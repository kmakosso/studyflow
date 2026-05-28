import { openDB } from 'idb';

const DB_NAME    = 'studyflow_v1';
const DB_VERSION = 7;

let _db = null;

async function getDB() {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      const ensure = (name, idxs = []) => {
        if (db.objectStoreNames.contains(name)) return;
        const store = db.createObjectStore(name, { keyPath: 'id' });
        for (const idx of idxs) store.createIndex(idx, idx);
      };

      // V1 stores
      if (oldVersion < 1) {
        ensure('subjects');
        ensure('courses',     ['subjectId']);
        ensure('assignments', ['subjectId', 'dueDate', 'status']);
        ensure('exams',       ['subjectId', 'date']);
        ensure('grades',      ['subjectId']);
        ensure('pomodoro');
        ensure('reminders',   ['datetime']);
        ensure('settings');
      }

      // V2 additions
      if (oldVersion < 2) {
        ensure('revisions', ['subjectId', 'nextReview', 'status']);
      }

      // V3 additions
      if (oldVersion < 3) {
        ensure('profile');
        ensure('dailyLogs');
        ensure('weeklyGoals');
      }

      // V4 additions — workspace + workspace journal
      if (oldVersion < 4) {
        ensure('notes',     []);
        ensure('journal',   []);
        ensure('goals',     ['type']);
        ensure('checklist', ['date']);
      }

      // V5 additions — documents, flashcards, quizzes
      if (oldVersion < 5) {
        ensure('documents',  ['subjectId', 'type', 'createdAt']);
        ensure('flashcards', ['documentId', 'subjectId', 'nextReview']);
        ensure('quizzes',    ['documentId', 'subjectId', 'createdAt']);
      }

      // V6 additions — RAG document chunks + date index on courses
      if (oldVersion < 6) {
        ensure('documentChunks', ['documentId', 'chunkIndex']);
        // Add 'date' index to existing courses store for date-specific course lookup
        try {
          const cs = transaction.objectStore('courses');
          if (!cs.indexNames.contains('date')) cs.createIndex('date', 'date');
        } catch { /* courses may not exist in edge-case fresh install */ }
      }

      // V7 additions — raw file blobs (local-only, never synced to Supabase)
      // Stores the original File/Blob so users can re-download their documents.
      if (oldVersion < 7) {
        ensure('documentFiles', []);
      }
    },
  });
  return _db;
}

/* ─── Write-hook registry ────────────────────────────────────────── */
/* Listeners receive (store, item) on put, (store, id) on del.
 * The sync engine subscribes here — db.js never imports syncEngine. */

const _writeListeners  = [];
const _deleteListeners = [];

/** Register a callback for every db.put(store, item) call. */
export function onDbWrite(fn)  { _writeListeners.push(fn);  }
/** Register a callback for every db.del(store, id) call. */
export function onDbDelete(fn) { _deleteListeners.push(fn); }

/* ─── db API ─────────────────────────────────────────────────────── */

export const db = {
  async all(store)               { return (await getDB()).getAll(store); },
  async get(store, id)           { return (await getDB()).get(store, id); },

  async put(store, item) {
    const result = await (await getDB()).put(store, item);
    // Fire write hooks (non-blocking — errors must not break the write)
    try { for (const fn of _writeListeners) fn(store, item); } catch { /**/ }
    return result;
  },

  async del(store, id) {
    const result = await (await getDB()).delete(store, id);
    try { for (const fn of _deleteListeners) fn(store, id); } catch { /**/ }
    return result;
  },

  async clear(store)             { return (await getDB()).clear(store); },
  async byIndex(store, idx, val) { return (await getDB()).getAllFromIndex(store, idx, val); },

  async getSetting(key, def = null) {
    const row = await (await getDB()).get('settings', key);
    return row ? row.value : def;
  },
  async setSetting(key, value) {
    // Settings go straight to IDB — never synced to cloud (contains API key)
    return (await getDB()).put('settings', { id: key, value });
  },
};

export async function exportAll() {
  const stores = ['subjects','courses','assignments','exams','grades','pomodoro','reminders','settings','revisions','profile','dailyLogs','weeklyGoals','notes','journal','goals','checklist','documents','flashcards','quizzes','documentChunks'];
  const out    = { _version: 5, _date: new Date().toISOString() };
  for (const s of stores) out[s] = await db.all(s);
  return out;
}

export async function importAll(data) {
  const stores = ['subjects','courses','assignments','exams','grades','pomodoro','reminders','settings','revisions','profile','dailyLogs','weeklyGoals','notes','journal','goals','checklist','documents','flashcards','quizzes','documentChunks'];
  for (const s of stores) {
    if (!Array.isArray(data[s])) continue;
    await db.clear(s);
    for (const item of data[s]) await db.put(s, item);
  }
}
