import { db } from './db';
import { startOfWeek, endOfWeek, isWithinInterval, subDays, format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';

export async function computeStats() {
  const [sessions, assignments, exams, subjects] = await Promise.all([
    db.all('pomodoro'),
    db.all('assignments'),
    db.all('exams'),
    db.all('subjects'),
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

  // Assignment stats
  const done    = assignments.filter(a => a.status === 'done');
  const pending = assignments.filter(a => a.status !== 'done');
  const overdue = pending.filter(a => new Date(a.dueDate) < now);

  // Average days late (done assignments that were completed after due date — approximate)
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

  return {
    week: { minutes: totalMinWeek, sessions: weekSessions.length },
    allTime: { minutes: totalMinAll, sessions: sessions.length },
    last7,
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
  };
}

export function fmtMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}
