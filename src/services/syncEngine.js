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

import { db, getDB, onDbWrite, onDbDelete } from './db';
import { supabase, isSupabaseConfigured } from './supabase';

/* ─── Stores excluded from cloud sync ───────────────────────────── */
const LOCAL_ONLY_STORES = new Set([
  'settings',
  'documentChunks', // large, rebuilt locally from documents
  'documentFiles',  // binary blobs — too large for JSON sync
  'dailyLogs',
  // NOTE: 'profile' and 'conversations' ARE synced — users expect them
  // on every device they log into.
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

/* ─── DOM sync event ─────────────────────────────────────────────── */
/* Dispatched after every pull that wrote rows. React hooks subscribe
 * to this event to reload their local state without a page reload.   */
export const SYNC_EVENT = 'studyflow:data-sync';

function dispatchSync() {
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

/* ─── Sanitize items before cloud upload ─────────────────────────── */
/* Truncate very large text fields so rows stay within Supabase limits */
const MAX_TEXT_BYTES = 80_000;   // ~80 KB per document row
const MAX_MSG_COUNT  = 200;      // keep last N messages per conversation

function sanitizeForSync(store, item) {
  if (store === 'documents' && item.text && item.text.length > MAX_TEXT_BYTES) {
    return { ...item, text: item.text.slice(0, MAX_TEXT_BYTES) };
  }
  if (store === 'conversations' && Array.isArray(item.messages) && item.messages.length > MAX_MSG_COUNT) {
    return { ...item, messages: item.messages.slice(-MAX_MSG_COUNT) };
  }
  return item;
}

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
        // Sanitize before queueing (truncate large doc.text)
        const data = sanitizeForSync(store, item);
        this._enqueue({ op: 'upsert', store, id: item.id, data, ts: Date.now() });
      });
      onDbDelete((store, id) => {
        if (!this._userId) return;
        if (LOCAL_ONLY_STORES.has(store)) return;
        this._enqueue({ op: 'delete', store, id, ts: Date.now() });
      });
    }

    // Initial pull (full pull if first login on this device, incremental otherwise)
    // If no _lastPull we reset it so pullFromCloud fetches ALL rows
    if (!this._lastPull) {
      this._lastPull = null; // ensure full pull on new device
    }
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

      let latestTs    = this._lastPull ?? '';
      let rowsWritten = 0;

      for (const row of rows) {
        if (LOCAL_ONLY_STORES.has(row.store)) continue;

        if (row.deleted_at) {
          // Remote delete → remove from IDB directly (no hooks to avoid echo)
          const idb = await getDB();
          await idb.delete(row.store, row.id).catch(() => {});
          rowsWritten++;
        } else {
          // Upsert: last-write-wins using updated_at
          const local = await db.get(row.store, row.id).catch(() => null);
          const localTs = local?.updatedAt ?? local?.createdAt ?? '';
          if (!local || row.updated_at >= localTs) {
            // Write directly to IDB without triggering write hooks (avoid echo)
            const idb = await getDB();
            await idb.put(row.store, row.data).catch(() => {});
            rowsWritten++;
          }
        }

        if (row.updated_at > latestTs) latestTs = row.updated_at;
      }

      // Persist the high-water mark
      this._lastPull = latestTs;
      await db.setSetting('_syncLastPull', latestTs);
      _emit('idle');

      // Notify all React hooks so they reload their state without a page refresh
      if (rowsWritten > 0) {
        dispatchSync();
      }
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
      'profile','conversations',   // user profile + AI chat history
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
          data:    sanitizeForSync(store, item),   // truncate large fields
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
// getDB() is imported from db.js and used directly for raw IDB writes.
// It uses the current DB version (no stale version bug) and bypasses
// write hooks (avoids echo loops with the sync queue).
