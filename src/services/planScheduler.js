/* ── planScheduler.js — Agenda d'étude par créneaux horaires ─────────
 *
 * Place des blocs d'étude à des heures précises, jour par jour, en :
 *   • respectant l'emploi du temps réel (aucun chevauchement avec les cours)
 *   • ne plaçant rien dans le passé (heures déjà écoulées aujourd'hui)
 *   • priorisant par urgence (échéance, importance) et coefficient matière
 *   • montant en charge la révision dans les jours précédant un examen
 *
 * Sortie : days[] où chaque jour = { date, blocks[], courses[], ... }
 * Chaque bloc = { id, date, startTime, endTime, durationMin, type,
 *                 title, subjectId, subject, color, sourceId, sourceType }
 */

import { addDays, format, differenceInDays, startOfDay, isWeekend } from 'date-fns';
import { subjectCoef } from './gradeCalc.js';

const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
const EXAM_SESSIONS   = { high: 8, medium: 5, low: 3 };   // nb de sessions de révision
const EXAM_WINDOW     = { high: 8, medium: 6, low: 4 };   // nb de jours avant l'exam

/* ─── Helpers temps ──────────────────────────────────────────────── */
export function timeToMin(t = '00:00') {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}
export function minToTime(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* Intervalles libres d'un jour : fenêtres − cours − passé */
function freeIntervals(ranges, courses, nowMin) {
  let intervals = ranges
    .map(r => [timeToMin(r.start), timeToMin(r.end)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);

  const busy = courses
    .filter(c => c.startTime && c.endTime)
    .map(c => [timeToMin(c.startTime), timeToMin(c.endTime)]);

  if (nowMin != null) busy.push([0, nowMin]); // aujourd'hui : couper le passé

  for (const [bs, be] of busy) {
    const next = [];
    for (const [is, ie] of intervals) {
      if (be <= is || bs >= ie) { next.push([is, ie]); continue; }
      if (bs > is) next.push([is, bs]);
      if (be < ie) next.push([be, ie]);
    }
    intervals = next.filter(([a, b]) => b - a >= 30); // garder ≥30min
  }
  return intervals;
}

/* Découpe les intervalles libres en créneaux de sessionLen (back-to-back) */
function daySlots(intervals, sessionLen) {
  const slots = [];
  for (const [s, e] of intervals) {
    let cur = s;
    while (cur + sessionLen <= e) { slots.push([cur, cur + sessionLen]); cur += sessionLen; }
    if (e - cur >= 30) slots.push([cur, e]); // reliquat ≥30min
  }
  return slots;
}

/* ─── Génération de l'agenda ─────────────────────────────────────── */
/**
 * @param assignments  devoirs non terminés
 * @param exams        examens à venir
 * @param subjects     matières (pour nom/couleur/coef)
 * @param opts         { windows, sessionLen, horizon }
 *                     windows = { weekday:{enabled,ranges[]}, weekend:{enabled,ranges[]} }
 * @param busyPerDay   map "YYYY-MM-DD" → course[] (emploi du temps)
 */
export function generateTimedPlan(assignments, exams, subjects, opts = {}, busyPerDay = {}) {
  const {
    windows = {
      weekday: { enabled: true, ranges: [{ start: '17:00', end: '21:00' }] },
      weekend: { enabled: true, ranges: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
    },
    sessionLen = 60,
    horizon    = 14,
  } = opts;

  const today  = startOfDay(new Date());
  const subMap = Object.fromEntries(subjects.map(s => [s.id, s]));
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  /* 1 — Construire la file d'unités d'étude (1 unité = 1 session) */
  let uid = 0;
  const units = [];

  // Devoirs → sessions réparties avant l'échéance
  for (const a of assignments) {
    if (a.status === 'done' || !a.dueDate) continue;
    const sub      = subMap[a.subjectId];
    const dueDay   = differenceInDays(new Date(a.dueDate), today);
    const overdue  = dueDay < 0;
    const deadline = Math.max(0, Math.min(dueDay, horizon - 1));
    const nSessions = Math.max(1, Math.ceil(((a.estimatedHours || 1.5) * 60) / sessionLen));
    const coef     = subjectCoef(sub);
    const urgency  = (PRIORITY_WEIGHT[a.priority] || 1) * coef * (overdue ? 5 : 1 / (deadline + 1));
    for (let k = 0; k < nSessions; k++) {
      units.push({
        uid: ++uid, type: 'assignment',
        title: a.title, subjectId: a.subjectId, subject: sub?.name || '',
        color: sub?.color || '#7c6af7',
        sourceId: a.id, sourceType: 'assignment',
        notBefore: 0, deadline, urgency, overdue,
      });
    }
  }

  // Examens → révision montant en charge avant l'examen
  for (const e of exams) {
    const examDay = differenceInDays(new Date(e.date), today);
    if (examDay < 0 || examDay > horizon) continue;
    const sub      = subMap[e.subjectId];
    const coef     = subjectCoef(sub);
    const win      = Math.min(examDay, EXAM_WINDOW[e.importance] || 5);
    const nSessions = Math.max(1, Math.round((EXAM_SESSIONS[e.importance] || 4) * Math.min(2, coef)));
    const notBefore = Math.max(0, examDay - win);
    for (let k = 0; k < nSessions; k++) {
      units.push({
        uid: ++uid, type: 'revision',
        title: `Révision — ${sub?.name || e.title || 'Examen'}`,
        subjectId: e.subjectId, subject: sub?.name || '',
        color: sub?.color || '#ef4444',
        sourceId: e.id, sourceType: 'exam',
        notBefore, deadline: examDay, urgency: (PRIORITY_WEIGHT[e.importance] || 2) * 2 * coef,
      });
    }
  }

  /* 2 — Placer les unités jour par jour */
  const days = [];
  let unscheduled = 0;

  for (let d = 0; d < horizon; d++) {
    const date    = addDays(today, d);
    const dateStr = format(date, 'yyyy-MM-dd');
    const weekend = isWeekend(date);
    const win     = weekend ? windows.weekend : windows.weekday;
    const courses = busyPerDay[dateStr] || [];

    let blocks = [];
    if (win?.enabled && win.ranges?.length) {
      const intervals = freeIntervals(win.ranges, courses, d === 0 ? nowMin : null);
      const slots     = daySlots(intervals, sessionLen);
      const placedToday = {}; // uid source → count (éviter monotonie)

      let prev = null;
      for (const [s, e] of slots) {
        // candidats éligibles ce jour
        const cand = units
          .filter(u => !u.placed && u.notBefore <= d && d <= u.deadline)
          .filter(u => (placedToday[u.sourceId] || 0) < 3)
          .sort((a, b) => (a.deadline - b.deadline) || (b.urgency - a.urgency))[0];

        if (!cand) { prev = null; continue; }
        cand.placed = true;
        placedToday[cand.sourceId] = (placedToday[cand.sourceId] || 0) + 1;

        // fusionner avec le bloc précédent si même source et contigu
        if (prev && prev.sourceId === cand.sourceId && prev.type === cand.type && timeToMin(prev.endTime) === s) {
          prev.endTime = minToTime(e);
          prev.durationMin += (e - s);
        } else {
          prev = {
            id: crypto.randomUUID(),
            date: dateStr,
            startTime: minToTime(s),
            endTime: minToTime(e),
            durationMin: e - s,
            type: cand.type,
            title: cand.title,
            subjectId: cand.subjectId,
            subject: cand.subject,
            color: cand.color,
            sourceId: cand.sourceId,
            sourceType: cand.sourceType,
            overdue: cand.overdue || false,
          };
          blocks.push(prev);
        }
      }
    }

    const courseMinutes = courses.reduce((sum, c) =>
      sum + (c.startTime && c.endTime ? timeToMin(c.endTime) - timeToMin(c.startTime) : 0), 0);
    const studyMinutes = blocks.reduce((sum, b) => sum + b.durationMin, 0);

    days.push({ date: dateStr, isWeekend: weekend, blocks, courses, studyMinutes, courseMinutes });
  }

  unscheduled = units.filter(u => !u.placed).length;

  /* 3 — Stats globales */
  const totalStudyMin = days.reduce((s, d) => s + d.studyMinutes, 0);
  const activeDays    = days.filter(d => d.blocks.length > 0).length;

  return {
    days,
    stats: {
      totalHours: Math.round(totalStudyMin / 6) / 10,
      blocks:     days.reduce((s, d) => s + d.blocks.length, 0),
      activeDays,
      unscheduled,
    },
  };
}

/* ─── Export ICS ─────────────────────────────────────────────────── */
export function exportPlanICS(days) {
  const toICS = (dateStr, timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(h, m, 0, 0);
    return d.toISOString().replace(/[-:]/g, '').replace('.000', '');
  };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StudyFlow//Planning//FR', 'CALSCALE:GREGORIAN'];
  for (const day of days) {
    for (const b of day.blocks) {
      lines.push(
        'BEGIN:VEVENT',
        `DTSTART:${toICS(b.date, b.startTime)}`,
        `DTEND:${toICS(b.date, b.endTime)}`,
        `SUMMARY:${b.subject ? `${b.subject} — ` : ''}${b.title}`,
        `UID:${b.id}@studyflow`,
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'studyflow-planning.ics'; a.click();
  URL.revokeObjectURL(url);
}
