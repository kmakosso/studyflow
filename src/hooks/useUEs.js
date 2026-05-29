import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';
import { useSyncRefresh } from './useSyncRefresh';

/** UE = Unité d'Enseignement (regroupe plusieurs matières) */
export function useUEs() {
  const [ues, setUEs]       = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await db.all('ues');
    setUEs(data.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  const add = async (data) => {
    const item = {
      id: crypto.randomUUID(),
      coefficient: 1,
      createdAt: new Date().toISOString(),
      ...data,
    };
    await db.put('ues', item);
    await load();
    return item;
  };

  const update = async (id, data) => {
    const existing = ues.find(u => u.id === id);
    await db.put('ues', { ...existing, ...data });
    await load();
  };

  const remove = async (id) => {
    await db.del('ues', id);
    await load();
  };

  const byId = (id) => ues.find(u => u.id === id) || null;

  return { ues, loading, add, update, remove, byId, reload: load };
}
