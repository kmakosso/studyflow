import { db } from './db.js';
import { differenceInDays } from 'date-fns';

export async function predictRisks() {
  const [assignments, exams, pomodoro, subjects] = await Promise.all([
    db.all('assignments'),
    db.all('exams'),
    db.all('pomodoro'),
    db.all('subjects'),
  ]);

  let profile = null;
  try { profile = await db.get('profile', 'main'); } catch (_) {}

  const now         = new Date();
  const futureExams = exams.filter(e => new Date(e.date) >= now);
  const pending     = assignments.filter(a => a.status !== 'done');
  const risks       = [];

  // Delay risk per assignment
  pending.forEach(a => {
    try {
      const daysLeft = differenceInDays(new Date(a.dueDate), now);
      if (daysLeft < 0) return; // already overdue, handled by rules engine
      if (daysLeft > 14) return;

      const priorityW    = { high: 1.5, medium: 1.0, low: 0.7 }[a.priority] || 1.0;
      const statusFactor = a.status === 'in_progress' ? 0.5 : 1.0;
      const delayFactor  = profile?.delayTendency ?? 0.3;

      const rawRisk = (1 - daysLeft / 14) * delayFactor * statusFactor * priorityW;
      const risk    = Math.max(0, Math.min(1, rawRisk));

      if (risk > 0.55) {
        const sub = subjects.find(s => s.id === a.subjectId);
        risks.push({
          type:     'delay',
          severity: risk > 0.75 ? 'critical' : 'warning',
          message:  `Risque de retard sur "${a.title}"${sub ? ` (${sub.name})` : ''} — ${daysLeft}j restants`,
          score:    risk,
          entityId: a.id,
        });
      }
    } catch (_) {}
  });

  // Overload prediction
  const hoursPerDay = (pending.length * 1.5) / 14;
  if (hoursPerDay > 5) {
    risks.push({
      type:     'overload',
      severity: hoursPerDay > 7 ? 'critical' : 'warning',
      message:  `Surcharge prévue : ~${hoursPerDay.toFixed(1)}h/j de travail sur les 2 prochaines semaines`,
      score:    Math.min(1, hoursPerDay / 10),
    });
  }

  // Exam failure risk: upcoming exam in weak subject
  futureExams.forEach(e => {
    try {
      const daysLeft = differenceInDays(new Date(e.date), now);
      if (daysLeft > 14 || daysLeft < 0) return;
      const isWeak = profile?.weakSubjectIds?.includes(e.subjectId);
      if (isWeak && daysLeft <= 7) {
        const sub = subjects.find(s => s.id === e.subjectId);
        risks.push({
          type:     'exam_fail',
          severity: daysLeft <= 3 ? 'critical' : 'warning',
          message:  `Risque élevé pour ${sub?.name || 'l\'examen'} — matière difficile avec seulement ${daysLeft}j de préparation`,
          score:    Math.min(1, (1 - daysLeft / 14) * 1.5),
          entityId: e.id,
        });
      }
    } catch (_) {}
  });

  // Productivity drop
  const countWeek = (offset, len) => pomodoro.filter(s => {
    try {
      const d = differenceInDays(now, new Date(s.date));
      return s.completed && d >= offset && d < offset + len;
    } catch (_) { return false; }
  }).length;

  const last7  = countWeek(0, 7);
  const prev7  = countWeek(7, 7);
  if (prev7 >= 3 && last7 < prev7 * 0.5) {
    risks.push({
      type:     'productivity_drop',
      severity: 'info',
      message:  `Baisse de productivité : ${last7} sessions cette semaine vs ${prev7} la semaine passée`,
      score:    1 - last7 / Math.max(1, prev7),
    });
  }

  return risks.sort((a, b) => b.score - a.score);
}

export function detectDashboardMode({ futureExams, assignments, avgDailyLoad, recentPomodoro }) {
  // Exam mode: critical exam in ≤ 5 days
  const criticalExam = futureExams.find(e => {
    try {
      const d = differenceInDays(new Date(e.date), new Date());
      return d >= 0 && d <= 5;
    } catch (_) { return false; }
  });
  if (criticalExam) return 'exam';

  // Overload mode
  if (avgDailyLoad > 6) return 'overload';

  // Catchup mode: ≥2 overdue assignments
  const overdue = assignments.filter(a => {
    try {
      return a.status !== 'done' && differenceInDays(new Date(a.dueDate), new Date()) < 0;
    } catch (_) { return false; }
  });
  if (overdue.length >= 2) return 'catchup';

  // Rest mode: nothing pending
  const pending = assignments.filter(a => a.status !== 'done');
  if (pending.length === 0 && futureExams.length === 0) return 'rest';

  // Low activity with work to do
  if (recentPomodoro === 0 && pending.length > 0) return 'catchup';

  return 'normal';
}

export const DASHBOARD_MODE_LABELS = {
  normal:   'Mode normal',
  exam:     'Mode examen',
  overload: 'Surcharge',
  rest:     'En avance',
  catchup:  'Rattrapage',
};

export const DASHBOARD_MODE_COLORS = {
  normal:   'var(--muted)',
  exam:     'var(--danger)',
  overload: 'var(--warning)',
  rest:     'var(--success)',
  catchup:  'var(--warning)',
};
