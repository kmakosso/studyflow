import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';

export const DAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

// JS getDay(): 0=Sun,1=Mon,...,6=Sat  →  our index: 0=Mon,...,5=Sat
export function todayIndex() {
  const d = new Date().getDay();
  return d === 0 ? -1 : d - 1;
}

/* ─── Week / date helpers (exported for use in pages) ─────────────── */

/** Returns the Monday of the week containing refDate (time zeroed) */
export function getWeekStart(refDate = new Date()) {
  const d = new Date(refDate);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Returns an array of 6 Date objects [Mon … Sat] for the week of refDate */
export function getWeekDates(refDate = new Date()) {
  const mon = getWeekStart(refDate);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

/** Format a Date to "YYYY-MM-DD" */
export function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

/** Parse "YYYY-MM-DD" to Date (noon, avoids timezone day-off issues) */
export function fromDateStr(s) {
  return new Date(s + 'T12:00:00');
}

/* ─── Hook ───────────────────────────────────────────────────────── */

export function useSchedule() {
  const [courses, setCourses]           = useState([]);
  const [weekType, setWeekTypeState]    = useState('A');
  const [loading, setLoading]           = useState(true);

  const load = useCallback(async () => {
    const [data, wt] = await Promise.all([
      db.all('courses'),
      db.getSetting('weekType', 'A'),
    ]);
    setCourses(data);
    setWeekTypeState(wt);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (data) => {
    const item = { id: crypto.randomUUID(), ...data };
    await db.put('courses', item);
    await load();
    return item;
  };

  const update = async (id, data) => {
    const existing = courses.find(c => c.id === id);
    await db.put('courses', { ...existing, ...data });
    await load();
  };

  const remove = async (id) => {
    await db.del('courses', id);
    await load();
  };

  const setWeekType = async (wt) => {
    await db.setSetting('weekType', wt);
    setWeekTypeState(wt);
  };

  /**
   * Recurring courses for a day index (0=Mon … 5=Sat).
   * Does NOT include date-specific courses.
   */
  const forDay = (dayIdx, wt = weekType) =>
    courses
      .filter(c => !c.date && c.day === dayIdx && (c.weekType === 'both' || c.weekType === wt))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

  /**
   * All courses for a specific date string "YYYY-MM-DD":
   *   - recurring courses whose day-index matches the date's weekday
   *   - date-specific courses whose `date` field matches exactly
   */
  const forDateStr = useCallback((dateStr, wt = weekType) => {
    const d   = fromDateStr(dateStr);
    const dow = d.getDay();                    // 0=Sun
    const dayIdx = dow === 0 ? -1 : dow - 1;  // -1 if Sunday

    const recurring = dayIdx >= 0
      ? courses.filter(c =>
          !c.date &&
          c.day === dayIdx &&
          (c.weekType === 'both' || c.weekType === wt)
        )
      : [];

    const specific = courses.filter(c => c.date === dateStr);

    return [...recurring, ...specific].sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
  }, [courses, weekType]);

  const today = () => {
    const idx = todayIndex();
    return idx < 0 ? [] : forDay(idx);
  };

  return {
    courses, loading, weekType, setWeekType,
    add, update, remove,
    forDay, forDateStr, today,
    reload: load,
  };
}
