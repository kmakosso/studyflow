import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';

export function useGrades() {
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await db.all('grades');
    setGrades(data.sort((a, b) => new Date(b.date) - new Date(a.date)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (data) => {
    const item = { id: crypto.randomUUID(), date: new Date().toISOString().split('T')[0], maxScore: 20, coefficient: 1, ...data };
    await db.put('grades', item);
    await load();
    return item;
  };

  const update = async (id, data) => {
    const existing = grades.find(g => g.id === id);
    await db.put('grades', { ...existing, ...data });
    await load();
  };

  const remove = async (id) => {
    await db.del('grades', id);
    await load();
  };

  const forSubject = (subjectId) => grades.filter(g => g.subjectId === subjectId);

  const average = (list) => {
    if (!list || list.length === 0) return null;
    const weightSum = list.reduce((s, g) => s + (g.coefficient || 1), 0);
    const scoreSum  = list.reduce((s, g) => s + (g.score / (g.maxScore || 20)) * 20 * (g.coefficient || 1), 0);
    return scoreSum / weightSum;
  };

  return { grades, loading, add, update, remove, forSubject, average, reload: load };
}
