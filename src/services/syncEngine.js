/* ── syncEngine.js — Offline-first cloud sync ────────────────────────
 *
 * Architecture:
 *   • IndexedDB is ALWAYS the source of truth.
 *   • Every db.put / db.del fires a write-hook → items are queued here.
 *   • The queue is persisted in IndexedDB settings ('_syncQueue') so
 *     pending writes survive page reloads.
 *   • flush() batches the queue → Supabase upsert / soft-delete.
 *   • pullFromCloud() fetches rows updated since last pull → merges
 *     into IndexedDB (last-write-wins by updated_at timestamp).
 *   • SyncEngine.start() wires the flush on a 30-second interval.
 *
 * Stores that are NOT synced (local-only):
 *   settings, documentChunks, profile, dailyLogs
 *
 * Lifecycle:
 *   import { syncEngine } from './syncEngine';
 *   syncEngine.init(userId);   // call after login
 *   syncEngine.stop();         // call after logout
 */

import { db, onDbWrite, onDbDelete } from './db';
import { supabase, isSupabaseConfigured } from './supabase';

/* ─── Stores excluded from cloud sync ───────────────────────────── */
const LOCAL_ONLY_STORES = new Set([
  'settings',
  'documentChunks', // large, can be rebuilt from documents
  'profile',
  'dailyLogs',
]);

/* ─── Status callbacks ───────────────────────────────────────────── */
const _statusListeners = [];
export function onSyncStatus(fn) {
  _statusListeners.push(fn);
  return () => {
    const i = _statusListeners.indexOf(fn);
    if (i >= 0) _statusListeners.splice(i, 1);
  };
}
function _emit(status) { for (const fn of _statusListeners) fn(status); }

/* ─── SyncEngine class ───────────────────────────────────────────── */

class SyncEngine {
  constructor() {
    this._userId      = null;
    this._queue       = [];    // in-memory copy of the persisted queue
    this._timer       = null;
    this._running     = false;
    this._lastPull    = null;  // ISO string — used for incremental pull
    this._hooksWired  = false; // wire db hooks only once per singleton lifetime
  }

  /* ── Init / teardown ─────────────────────────────────────────── */

  async init(userId) {
    if (!isSupabaseConfigured) return;
    this._userId = userId;

    // Restore persisted queue
    const saved = await db.getSetting('_syncQueue', []);
    this._queue  = Array.isArray(saved) ? saved : [];
    this._lastPull = await db.getSetting('_syncLastPull', null);

    // Subscribe to future writes — wire only once per app lifetime
    if (!this._hooksWired) {
      this._hooksWired = true;
      onDbWrite((store, item) => {
        if (!this._userId) return;
        if (LOCAL_ONLY_STORES.has(store)) return;
        this._enqueue({ op: 'upsert', store, id: item.id, data: item, ts: Date.now() });
      });
      onDbDelete((store, id) => {
        if (!this._userId) return;
        if (LOCAL_ONLY_STORES.has(store)) return;
        this._enqueue({ op: 'delete', store, id, ts: Date.now() });
      });
    }

    // Initial pull, then start flush loop
    await this.pullFromCloud();
    this._startTimer();
    _emit('idle');
  }

  stop() {
    this._userId = null;
    if (this._timer) clearInterval(this._timer);
    this._timer   = null;
    this._running = false;
    _emit('offline');
  }

  /* ── Queue management ────────────────────────────────────────── */

  _enqueue(op) {
    // Deduplicate: keep only the latest op for (store, id)
    this._queue = this._queue.filter(q => !(q.store === op.store && q.id === op.id));
    this._queue.push(op);
    // Persist queue (fire-and-forget; we don't await to avoid blocking the write)
    db.setSetting('_syncQueue', this._queue).catch(() => {});
  }

  /* ── Flush: push queue → Supabase ────────────────────────────── */

  async flush() {
    if (!isSupabaseConfigured || !this._userId || this._running) return;
    if (this._queue.length === 0) return;

    this._running = true;
    _emit('syncing');

    try {
      const toProcess = [...this._queue];
      const upserts   = toProcess.filter(q => q.op === 'upsert');
      const deletes   = toProcess.filter(q => q.op === 'delete');

      // Batch upsert
      if (upserts.length > 0) {
        const rows = upserts.map(q => ({
          user_id: this._userId,
          store:   q.store,
          id:      q.id,
          data:    q.data,
          deleted_at: null,
        }));
        const { error } = await supabase
          .from('studyflow_items')
          .upsert(rows, { onConflict: 'user_id,store,id' });
        if (error) throw error;
      }

      // Batch soft-delete
      if (deletes.length > 0) {
        for (const q of deletes) {
          const { error } = await supabase
            .from('studyflow_items')
            .update({ deleted_at: new Date().toISOString() })
            .eq('user_id', this._userId)
            .eq('store',   q.store)
            .eq('id',      q.id);
          if (error) throw error;
        }
      }

      // Clear processed items from queue
      const processedKeys = new Set(toProcess.map(q => `${q.store}:${q.id}`));
      this._queue = this._queue.filter(q => !processedKeys.has(`${q.store}:${q.id}`));
      await db.setSetting('_syncQueue', this._queue);
      _emit('idle');
    } catch (err) {
      console.warn('[SyncEngine] flush error:', err);
      _emit('error');
    } finally {
      this._running = false;
    }
  }

  /* ── Pull: fetch cloud → merge into IDB ─────────────────────── */

  async pullFromCloud() {
    if (!isSupabaseConfigured || !this._userId) return;
    _emit('syncing');

    try {
      let query = supabase
        .from('studyflow_items')
        .select('store, id, data, updated_at, deleted_at')
        .eq('user_id', this._userId)
        .order('updated_at', { ascending: true });

      // Incremental pull: only rows updated since last pull
      if (this._lastPull) {
        query = query.gt('updated_at', this._lastPull);
      }

      const { data: rows, error } = await query;
      if (error) throw error;
      if (!rows || rows.length === 0) { _emit('idle'); return; }

      let latestTs = this._lastPull ?? '';

      for (const row of rows) {
        if (LOCAL_ONLY_STORES.has(row.store)) continue;

        if (row.deleted_at) {
          // Remote delete → remove from IDB (without triggering write hooks)
          const idb = await getIDB();
          await idb.delete(row.store, row.id).catch(() => {});
        } else {
          // Upsert: last-write-wins using updated_at
          const local = await db.get(row.store, row.id).catch(() => null);
          const localTs = local?.updatedAt ?? local?.createdAt ?? '';
          if (!local || row.updated_at >= localTs) {
            // Write directly to IDB without triggering write hooks (avoid echo)
            const idb = await getIDB();
            await idb.put(row.store, row.data).catch(() => {});
          }
        }

        if (row.updated_at > latestTs) latestTs = row.updated_at;
      }

      // Persist the high-water mark
      this._lastPull = latestTs;
      await db.setSetting('_syncLastPull', latestTs);
      _emit('idle');
    } catch (err) {
      console.warn('[SyncEngine] pull error:', err);
      _emit('error');
    }
  }

  /* ── Full push: re-sync everything (e.g., after first login) ─── */

  async pushAll() {
    if (!isSupabaseConfigured || !this._userId) return;

    const stores = [
      'subjects','courses','assignments','exams','grades','pomodoro',
      'reminders','revisions','notes','journal','goals','checklist',
      'documents','flashcards','quizzes',
    ];

    _emit('syncing');
    try {
      for (const store of stores) {
        const items = await db.all(store);
        if (items.length === 0) continue;
        const rows = items.map(item => ({
          user_id: this._userId,
          store,
          id:      item.id,
          data:    item,
          deleted_at: null,
        }));
        // Batch in chunks of 200 to stay within Supabase limits
        for (let i = 0; i < rows.length; i += 200) {
          const { error } = await supabase
            .from('studyflow_items')
            .upsert(rows.slice(i, i + 200), { onConflict: 'user_id,store,id' });
          if (error) throw error;
        }
      }
      _emit('idle');
    } catch (err) {
      console.warn('[SyncEngine] pushAll error:', err);
      _emit('error');
    }
  }

  /* ── Timer ───────────────────────────────────────────────────── */

  _startTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.flush(), 30_000); // every 30 s
  }
}

/* ─── Singleton export ───────────────────────────────────────────── */
export const syncEngine = new SyncEngine();

/* ─── Internal helper to get raw IDB without write hooks ────────── */
/* We open the same IDB directly so we can write cloud-pulled data
 * without triggering the write hooks (would cause echo loops). */
import { openDB } from 'idb';
async function getIDB() {
  return openDB('studyflow_v1', 6);
}
