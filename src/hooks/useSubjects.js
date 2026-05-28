import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';
import { useSyncRefresh } from './useSyncRefresh';

export const COLORS = [
  '#7c6af7','#ec4899','#f59e0b','#22c55e',
  '#3b82f6','#ef4444','#14b8a6','#f97316',
  '#a855f7','#06b6d4','#84cc16','#6366f1',
];

export function useSubjects() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    const data = await db.all('subjects');
    setSubjects(data.sort((a, b) => a.name.localeCompare(b.name)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  const add = async (data) => {
    const item = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...data };
    await db.put('subjects', item);
    await load();
    return item;
  };

  const update = async (id, data) => {
    const existing = subjects.find(s => s.id === id);
    await db.put('subjects', { ...existing, ...data });
    await load();
  };

  const remove = async (id) => {
    await db.del('subjects', id);
    await load();
  };

  const byId = (id) => subjects.find(s => s.id === id) || null;

  return { subjects, loading, add, update, remove, byId, reload: load };
}
