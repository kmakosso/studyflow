import { useState, useEffect, useCallback } from 'react';
import { db } from '../services/db';
import { useSyncRefresh } from './useSyncRefresh';

export const DAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

// JS getDay(): 0=Sun,1=Mon,...,6=Sat  →  our index: 0=Mon,...,6=Sun
export function todayIndex() {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
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

/** Returns an array of 7 Date objects [Mon … Dim] for the week of refDate */
export function getWeekDates(refDate = new Date()) {
  const mon = getWeekStart(refDate);
  return Array.from({ length: 7 }, (_, i) => {
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

/** Tri par heure de début — robuste si startTime manquant */
function byStartTime(a, b) {
  return String(a.startTime || '').localeCompare(String(b.startTime || ''));
}

/* ─── Hook ───────────────────────────────────────────────────────── */

export function useSchedule() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  // weekType conservé pour compat — n'a plus aucun effet sur le filtrage.
  const [weekType, setWeekTypeState] = useState('both');

  const load = useCallback(async () => {
    const data = await db.all('courses');
    setCourses(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useSyncRefresh(load);

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

  const setWeekType = (wt) => setWeekTypeState(wt); // no-op pour le filtrage

  /**
   * Cours récurrents pour un index de jour (0=Lun … 6=Dim).
   * N'inclut PAS les cours liés à une date précise.
   */
  const forDay = (dayIdx) =>
    courses
      .filter(c => !c.date && c.day === dayIdx)
      .sort(byStartTime);

  /**
   * Tous les cours d'une date "YYYY-MM-DD" :
   *   - récurrents dont le jour correspond
   *   - cours datés dont le champ `date` correspond exactement
   */
  const forDateStr = useCallback((dateStr) => {
    const d   = fromDateStr(dateStr);
    const dow = d.getDay();                    // 0=Dim
    const dayIdx = dow === 0 ? 6 : dow - 1;    // 0=Lun … 6=Dim

    const recurring = courses.filter(c => !c.date && c.day === dayIdx);
    const specific  = courses.filter(c => c.date === dateStr);

    return [...recurring, ...specific].sort(byStartTime);
  }, [courses]);

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
