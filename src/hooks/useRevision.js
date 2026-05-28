import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';
import { isDue } from '../services/srs';
import { useSyncRefresh } from './useSyncRefresh';

export function useRevision() {
  const [cards, setCards]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await db.all('revisions');
    setCards(data.sort((a, b) => {
      // Due cards first, then by status
      const aDue = isDue(a) ? 0 : 1;
      const bDue = isDue(b) ? 0 : 1;
      return aDue - bDue;
    }));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  const add = async (data) => {
    const card = {
      id:         crypto.randomUUID(),
      createdAt:  new Date().toISOString(),
      status:     'unseen',
      interval:   0,
      ease:       2.5,
      nextReview: new Date().toISOString().split('T')[0],
      lastReview: null,
      ...data,
    };
    await db.put('revisions', card);
    await load();
    return card;
  };

  const update = async (id, data) => {
    const existing = cards.find(c => c.id === id);
    await db.put('revisions', { ...existing, ...data });
    await load();
  };

  const remove = async (id) => {
    await db.del('revisions', id);
    await load();
  };

  const forSubject  = (subjectId) => cards.filter(c => c.subjectId === subjectId);
  const dueToday    = () => cards.filter(isDue);
  const byStatus    = (status) => cards.filter(c => c.status === status);

  return { cards, loading, add, update, remove, forSubject, dueToday, byStatus, reload: load };
}
