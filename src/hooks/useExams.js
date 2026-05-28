import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';
import { useSyncRefresh } from './useSyncRefresh';

export function useExams() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await db.all('exams');
    setExams(data.sort((a, b) => new Date(a.date) - new Date(b.date)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  const add = async (data) => {
    const item = { id: crypto.randomUUID(), ...data };
    await db.put('exams', item);
    await load();
    return item;
  };

  const update = async (id, data) => {
    const existing = exams.find(e => e.id === id);
    await db.put('exams', { ...existing, ...data });
    await load();
  };

  const remove = async (id) => {
    await db.del('exams', id);
    await load();
  };

  const upcoming = (days = 60) => {
    const now  = new Date();
    const lim  = new Date(); lim.setDate(lim.getDate() + days);
    return exams.filter(e => { const d = new Date(e.date); return d >= now && d <= lim; });
  };

  const daysUntil = (exam) =>
    Math.ceil((new Date(exam.date) - new Date()) / 86400000);

  return { exams, loading, add, update, remove, upcoming, daysUntil, reload: load };
}
