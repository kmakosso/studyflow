/* ── Workspace hooks — Notes, Journal, Goals, Checklist ── */
import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';
import { useSyncRefresh } from './useSyncRefresh';

/* ────────────────────────── NOTES ────────────────────────── */
export function useNotes() {
  const [notes, setNotes] = useState([]);

  const load = useCallback(async () => {
    const all = await db.all('notes');
    setNotes(all.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
  }, []);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  const save = async (note) => {
    const now  = new Date().toISOString();
    const item = { ...note, updatedAt: now };
    if (!item.id)        item.id        = crypto.randomUUID();
    if (!item.createdAt) item.createdAt = now;
    await db.put('notes', item);
    await load();
    return item;
  };

  const remove = async (id) => {
    await db.del('notes', id);
    await load();
  };

  return { notes, save, remove, reload: load };
}

/* ────────────────────────── JOURNAL ────────────────────────── */
export function useJournal() {
  const [entries, setEntries] = useState([]);
  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    const all = await db.all('journal');
    setEntries(all.sort((a, b) => new Date(b.date) - new Date(a.date)));
  }, []);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  const saveEntry = async (entry) => {
    const now  = new Date().toISOString();
    const item = { ...entry, updatedAt: now };
    if (!item.id)   item.id   = crypto.randomUUID();
    if (!item.date) item.date = today;
    await db.put('journal', item);
    await load();
    return item;
  };

  const getTodayEntry = () => entries.find(e => e.date === today) || null;

  const remove = async (id) => {
    await db.del('journal', id);
    await load();
  };

  return { entries, saveEntry, getTodayEntry, remove, reload: load, today };
}

/* ────────────────────────── GOALS ────────────────────────── */
export function useGoals() {
  const [goals, setGoals] = useState([]);

  const load = useCallback(async () => {
    const all = await db.all('goals');
    setGoals(all.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    }));
  }, []);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  const save = async (goal) => {
    const now  = new Date().toISOString();
    const item = { ...goal, updatedAt: now };
    if (!item.id)        item.id        = crypto.randomUUID();
    if (!item.createdAt) item.createdAt = now;
    if (item.done === undefined) item.done = false;
    await db.put('goals', item);
    await load();
    return item;
  };

  const toggle = async (id) => {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;
    await save({ ...goal, done: !goal.done });
  };

  const remove = async (id) => {
    await db.del('goals', id);
    await load();
  };

  return { goals, save, toggle, remove, reload: load };
}

/* ────────────────────────── CHECKLIST ────────────────────────── */
export function useChecklist() {
  const today = new Date().toISOString().split('T')[0];
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    const all = await db.all('checklist');
    setItems(
      all
        .filter(i => i.date === today)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    );
  }, [today]);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  const add = async (text) => {
    const item = {
      id: crypto.randomUUID(),
      text,
      done: false,
      date: today,
      createdAt: new Date().toISOString(),
    };
    await db.put('checklist', item);
    await load();
    return item;
  };

  const toggle = async (id) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    await db.put('checklist', { ...item, done: !item.done });
    await load();
  };

  const remove = async (id) => {
    await db.del('checklist', id);
    await load();
  };

  const clearDone = async () => {
    for (const item of items.filter(i => i.done)) await db.del('checklist', item.id);
    await load();
  };

  const doneCount = items.filter(i => i.done).length;

  return { items, add, toggle, remove, clearDone, reload: load, today, doneCount };
}
