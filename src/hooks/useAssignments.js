import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';
import { useSyncRefresh } from './useSyncRefresh';

export function useAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading]         = useState(true);

  const load = useCallback(async () => {
    const data = await db.all('assignments');
    setAssignments(data.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  const add = async (data) => {
    const item = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'todo',
      priority: 'medium',
      subtasks: [],
      ...data,
    };
    await db.put('assignments', item);
    await load();
    return item;
  };

  const update = async (id, data) => {
    const existing = assignments.find(a => a.id === id);
    await db.put('assignments', { ...existing, ...data });
    await load();
  };

  const remove = async (id) => {
    await db.del('assignments', id);
    await load();
  };

  const toggleSubtask = async (assignmentId, subtaskId) => {
    const a = assignments.find(x => x.id === assignmentId);
    const subtasks = a.subtasks.map(st =>
      st.id === subtaskId ? { ...st, done: !st.done } : st
    );
    await update(assignmentId, { subtasks });
  };

  const urgent = () => {
    const limit = new Date();
    limit.setDate(limit.getDate() + 3);
    return assignments.filter(a => a.status !== 'done' && new Date(a.dueDate) <= limit);
  };

  return { assignments, loading, add, update, remove, toggleSubtask, urgent, reload: load };
}
