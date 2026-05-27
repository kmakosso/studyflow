import { db } from './db';
import { differenceInDays, differenceInHours, subDays, format } from 'date-fns';

export async function getSmartAlerts() {
  const [assignments, exams, sessions, subjects] = await Promise.all([
    db.all('assignments'),
    db.all('exams'),
    db.all('pomodoro'),
    db.all('subjects'),
  ]);

  const now     = new Date();
  const alerts  = [];
  const subMap  = Object.fromEntries(subjects.map(s => [s.id, s]));

  // 1. Exams in ≤ 2 days
  for (const e of exams) {
    const days = differenceInDays(new Date(e.date), now);
    if (days >= 0 && days <= 2) {
      const sub = subMap[e.subjectId];
      alerts.push({
        id:      'exam_' + e.id,
        level:   'critical',
        icon:    '🎓',
        message: days === 0
          ? `Examen ${sub?.name || ''} aujourd'hui à ${e.time} !`
          : `Examen ${sub?.name || ''} demain à ${e.time} — prêt ?`,
      });
    } else if (days > 2 && days <= 7) {
      const sub = subMap[e.subjectId];
      alerts.push({
        id:      'exam_warn_' + e.id,
        level:   'warning',
        icon:    '📚',
        message: `Examen ${sub?.name || ''} dans ${days} jours`,
      });
    }
  }

  // 2. Overdue assignments
  const overdue = assignments.filter(a => a.status !== 'done' && new Date(a.dueDate) < now);
  if (overdue.length > 0) {
    alerts.push({
      id:      'overdue',
      level:   'warning',
      icon:    '⚠️',
      message: overdue.length === 1
        ? `"${overdue[0].title}" est en retard`
        : `${overdue.length} devoirs en retard`,
    });
  }

  // 3. High-priority assignments due tomorrow
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const urgentTomorrow = assignments.filter(a =>
    a.status !== 'done' &&
    a.priority === 'high' &&
    differenceInDays(new Date(a.dueDate), now) === 1
  );
  if (urgentTomorrow.length > 0) {
    alerts.push({
      id:      'urgent_tomorrow',
      level:   'warning',
      icon:    '🔥',
      message: `"${urgentTomorrow[0].title}" à rendre demain (priorité haute)`,
    });
  }

  // 4. Subject not studied in 3+ days (only if pomodoro sessions exist)
  if (sessions.length > 5) {
    const assignMap = Object.fromEntries(assignments.map(a => [a.id, a]));
    const subLastStudied = {};
    for (const s of sessions) {
      const a = assignMap[s.assignmentId];
      if (a?.subjectId) {
        const d = new Date(s.completedAt || s.date + 'T12:00:00');
        if (!subLastStudied[a.subjectId] || d > subLastStudied[a.subjectId]) {
          subLastStudied[a.subjectId] = d;
        }
      }
    }

    for (const [subId, lastDate] of Object.entries(subLastStudied)) {
      const daysSince = differenceInDays(now, lastDate);
      if (daysSince >= 3 && subMap[subId]) {
        alerts.push({
          id:      'idle_' + subId,
          level:   'info',
          icon:    '💡',
          message: `Tu n'as pas travaillé ${subMap[subId].name} depuis ${daysSince} jours`,
        });
        break; // Only show one suggestion
      }
    }
  }

  return alerts;
}
