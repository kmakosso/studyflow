import { db } from './db';
import { startOfWeek, endOfWeek, isWithinInterval, subDays, format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';

export async function computeStats() {
  const [sessions, assignments, exams, subjects, grades, revisions] = await Promise.all([
    db.all('pomodoro'),
    db.all('assignments'),
    db.all('exams'),
    db.all('subjects'),
    db.all('grades'),
    db.all('revisions'),
  ]);

  const now       = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now, { weekStartsOn: 1 });

  const getDate = (s) => new Date(s.completedAt || s.date + 'T12:00:00');

  const weekSessions   = sessions.filter(s => isWithinInterval(getDate(s), { start: weekStart, end: weekEnd }));
  const totalMinWeek   = weekSessions.reduce((acc, s) => acc + (s.duration || 25), 0);
  const totalMinAll    = sessions.reduce((acc, s) => acc + (s.duration || 25), 0);

  // Last 7 days productivity
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const day     = subDays(now, 6 - i);
    const dateStr = format(day, 'yyyy-MM-dd');
    const daySess = sessions.filter(s => (s.completedAt || s.date || '').startsWith(dateStr));
    return {
      date:    dateStr,
      label:   format(day, 'EEE', { locale: fr }),
      minutes: daySess.reduce((a, s) => a + (s.duration || 25), 0),
      count:   daySess.length,
    };
  });

  // Last 30 days productivity
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const day     = subDays(now, 29 - i);
    const dateStr = format(day, 'yyyy-MM-dd');
    const daySess = sessions.filter(s => (s.completedAt || s.date || '').startsWith(dateStr));
    return {
      date:    dateStr,
      label:   format(day, 'd/M'),
      minutes: daySess.reduce((a, s) => a + (s.duration || 25), 0),
      count:   daySess.length,
    };
  });

  // Assignment stats
  const done    = assignments.filter(a => a.status === 'done');
  const pending = assignments.filter(a => a.status !== 'done');
  const overdue = pending.filter(a => new Date(a.dueDate) < now);

  const avgLate = overdue.length > 0
    ? overdue.reduce((s, a) => s + differenceInDays(now, new Date(a.dueDate)), 0) / overdue.length
    : 0;

  // Subject breakdown from pomodoro sessions
  const assignmentMap = Object.fromEntries(assignments.map(a => [a.id, a]));
  const subMinutes = {};
  for (const s of sessions) {
    let subId = null;
    if (s.assignmentId && assignmentMap[s.assignmentId]) {
      subId = assignmentMap[s.assignmentId].subjectId;
    }
    if (subId) subMinutes[subId] = (subMinutes[subId] || 0) + (s.duration || 25);
  }

  const subjectStats = subjects
    .map(s => ({ id: s.id, name: s.name, color: s.color, minutes: subMinutes[s.id] || 0 }))
    .sort((a, b) => b.minutes - a.minutes);

  // Upcoming exams avg days
  const futureExams = exams.filter(e => new Date(e.date) >= now);
  const avgDaysToExam = futureExams.length > 0
    ? futureExams.reduce((s, e) => s + differenceInDays(new Date(e.date), now), 0) / futureExams.length
    : null;

  // Grade evolution — average per subject over time (sorted by date)
  const gradesBySubject = {};
  for (const g of grades) {
    if (!g.subjectId || g.value == null) continue;
    if (!gradesBySubject[g.subjectId]) gradesBySubject[g.subjectId] = [];
    gradesBySubject[g.subjectId].push({ date: g.date || g.createdAt || '', value: parseFloat(g.value) });
  }
  const gradeEvolution = subjects
    .filter(s => gradesBySubject[s.id]?.length > 0)
    .map(s => ({
      id:     s.id,
      name:   s.name,
      color:  s.color,
      points: gradesBySubject[s.id]
        .filter(p => p.date)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-12), // last 12 grades per subject
    }));

  // SRS (revisions) status breakdown
  const srsStatus = {
    unseen:   revisions.filter(r => r.status === 'unseen').length,
    learning: revisions.filter(r => r.status === 'learning').length,
    review:   revisions.filter(r => !['unseen', 'learning', 'mastered'].includes(r.status)).length,
    mastered: revisions.filter(r => r.status === 'mastered').length,
    total:    revisions.length,
  };

  return {
    week: { minutes: totalMinWeek, sessions: weekSessions.length },
    allTime: { minutes: totalMinAll, sessions: sessions.length },
    last7,
    last30,
    assignments: {
      total: assignments.length,
      done: done.length,
      pending: pending.length,
      overdue: overdue.length,
      rate: assignments.length > 0 ? done.length / assignments.length : 0,
      avgDaysLate: Math.round(avgLate),
    },
    exams: { upcoming: futureExams.length, avgDays: avgDaysToExam ? Math.round(avgDaysToExam) : null },
    subjectStats,
    gradeEvolution,
    srsStatus,
  };
}

/** Compute current study streak (consecutive days with ≥1 pomodoro session). */
export async function computeStreak() {
  const sessions = await db.all('pomodoro');
  const activeDays = new Set(
    sessions
      .map(s => (s.completedAt || s.date || '').slice(0, 10))
      .filter(Boolean)
  );

  const today = format(new Date(), 'yyyy-MM-dd');
  let day     = new Date();

  // If today has no session yet, start counting from yesterday (streak not broken)
  if (!activeDays.has(today)) day = subDays(day, 1);

  let streak = 0;
  while (activeDays.has(format(day, 'yyyy-MM-dd'))) {
    streak++;
    day = subDays(day, 1);
  }
  return streak;
}

export function fmtMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}
