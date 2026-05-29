import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../services/db';
import { notif, scheduleReminder, cancelReminder, syncReminders } from '../services/notifications';
import { useSyncRefresh } from './useSyncRefresh';

export function useReminders() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading]     = useState(true);
  const tickRef = useRef(null);

  const load = useCallback(async () => {
    const data = await db.all('reminders');
    setReminders(data.sort((a, b) => new Date(a.datetime) - new Date(b.datetime)));
    setLoading(false);
    syncReminders(data);   // (re)programme les rappels futurs (déclenchement hors-ligne)
  }, []);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

  // Check every minute if a reminder should fire
  useEffect(() => {
    clearInterval(tickRef.current);
    tickRef.current = setInterval(async () => {
      const now = new Date();
      // L'affichage est géré par le démon global (Layout) ou par les
      // Notification Triggers ; ici on rafraîchit juste l'UI.
      const due = reminders.filter(r => !r.triggered && new Date(r.datetime) <= now);
      for (const r of due) {
        await db.put('reminders', { ...r, triggered: true });
      }
      if (due.length > 0) load();
    }, 60_000);
    return () => clearInterval(tickRef.current);
  }, [reminders, load]);

  const add = async (data) => {
    const item = { id: crypto.randomUUID(), triggered: false, ...data };
    await db.put('reminders', item);
    // Demande la permission au moment où l'utilisateur crée un rappel (geste)
    if (notif.permission === 'default') await notif.request();
    await scheduleReminder(item);
    await load();
    return item;
  };

  const remove = async (id) => {
    await cancelReminder(id);
    await db.del('reminders', id);
    await load();
  };

  const update = async (id, data) => {
    const existing = reminders.find(r => r.id === id);
    const updated  = { ...existing, ...data };
    await cancelReminder(id);
    await db.put('reminders', updated);
    await scheduleReminder(updated);
    await load();
  };

  return { reminders, loading, add, remove, update, reload: load };
}
