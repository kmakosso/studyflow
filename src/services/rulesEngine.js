import { db } from './db.js';
import { differenceInDays } from 'date-fns';

const RULES = [
  {
    id: 'exam_today',
    category: 'exam',
    severity: 'critical',
    check(data) {
      return data.futureExams.find(e => differenceInDays(new Date(e.date), new Date()) === 0);
    },
    message(e, data) {
      const sub = data.subjects.find(s => s.id === e.subjectId);
      return `Examen de ${sub?.name || '?'} aujourd'hui — concentre-toi, tu es prêt(e) !`;
    },
  },
  {
    id: 'exam_imminent',
    category: 'exam',
    severity: 'critical',
    check(data) {
      return data.futureExams.find(e => {
        const d = differenceInDays(new Date(e.date), new Date());
        return d > 0 && d <= 2;
      });
    },
    message(e, data) {
      const sub = data.subjects.find(s => s.id === e.subjectId);
      const d   = differenceInDays(new Date(e.date), new Date());
      return `Examen de ${sub?.name || '?'} dans ${d}j — priorité maximale, commence les révisions`;
    },
  },
  {
    id: 'exam_soon',
    category: 'exam',
    severity: 'warning',
    check(data) {
      return data.futureExams.find(e => {
        const d = differenceInDays(new Date(e.date), new Date());
        return d > 2 && d <= 5;
      });
    },
    message(e, data) {
      const sub = data.subjects.find(s => s.id === e.subjectId);
      const d   = differenceInDays(new Date(e.date), new Date());
      return `Examen de ${sub?.name || '?'} dans ${d} jours — planifie des sessions de révision dès maintenant`;
    },
  },
  {
    id: 'overdue_assignments',
    category: 'assignments',
    severity: 'warning',
    check(data) {
      const overdue = data.assignments.filter(
        a => a.status !== 'done' && differenceInDays(new Date(a.dueDate), new Date()) < 0
      );
      return overdue.length > 0 ? overdue : null;
    },
    message(overdue) {
      return `${overdue.length} devoir${overdue.length > 1 ? 's' : ''} en retard — traitement urgent requis`;
    },
  },
  {
    id: 'assignment_not_started',
    category: 'assignments',
    severity: 'warning',
    check(data) {
      return data.assignments.find(a => {
        const d = differenceInDays(new Date(a.dueDate), new Date());
        return a.status === 'todo' && d >= 0 && d <= 3;
      });
    },
    message(a, data) {
      const sub = data.subjects.find(s => s.id === a.subjectId);
      const d   = differenceInDays(new Date(a.dueDate), new Date());
      return `"${a.title}"${sub ? ` (${sub.name})` : ''} — à rendre dans ${d === 0 ? "aujourd'hui" : `${d}j`} et pas encore commencé`;
    },
  },
  {
    id: 'weak_subject_exam',
    category: 'exam',
    severity: 'warning',
    check(data) {
      if (!data.profile?.weakSubjectIds?.length) return null;
      return data.futureExams.find(e => {
        const d = differenceInDays(new Date(e.date), new Date());
        return d <= 14 && data.profile.weakSubjectIds.includes(e.subjectId);
      });
    },
    message(e, data) {
      const sub = data.subjects.find(s => s.id === e.subjectId);
      const d   = differenceInDays(new Date(e.date), new Date());
      return `Examen de ${sub?.name || '?'} dans ${d}j — c'est une matière difficile pour toi, insiste sur les révisions`;
    },
  },
  {
    id: 'overload_risk',
    category: 'planning',
    severity: 'warning',
    action: 'rebalance',
    check(data) {
      return data.avgDailyLoad > 5 ? data.avgDailyLoad : null;
    },
    message(load) {
      return `Charge élevée prévue (~${load.toFixed(1)}h/j) — envisage de répartir ton travail sur plus de jours`;
    },
  },
  {
    id: 'low_pomodoro',
    category: 'habits',
    severity: 'info',
    check(data) {
      const pending = data.assignments.filter(a => a.status !== 'done').length;
      return data.recentPomodoro < 3 && pending > 1 ? true : null;
    },
    message() {
      return "Peu de sessions de travail cette semaine — même 25 min de Pomodoro peut tout changer";
    },
  },
  {
    id: 'productive_streak',
    category: 'motivation',
    severity: 'success',
    check(data) {
      return data.recentPomodoro >= 8 ? data.recentPomodoro : null;
    },
    message(count) {
      return `${count} sessions cette semaine — excellente régularité, tu es dans le rythme !`;
    },
  },
];

export async function evaluateRules() {
  const [assignments, exams, subjects, pomodoro] = await Promise.all([
    db.all('assignments'),
    db.all('exams'),
    db.all('subjects'),
    db.all('pomodoro'),
  ]);

  let profile = null;
  try { profile = await db.get('profile', 'main'); } catch (_) {}

  const now         = new Date();
  const futureExams = exams.filter(e => new Date(e.date) >= now);

  const recentPomodoro = pomodoro.filter(s => {
    try {
      return s.completed && differenceInDays(now, new Date(s.date)) <= 7;
    } catch (_) { return false; }
  }).length;

  const pending      = assignments.filter(a => a.status !== 'done');
  const avgDailyLoad = (pending.length * 1.5) / 7;

  const data = { assignments, futureExams, subjects, recentPomodoro, avgDailyLoad, profile };

  const triggered = [];
  for (const rule of RULES) {
    try {
      const match = rule.check(data);
      if (match) {
        triggered.push({
          id:       rule.id,
          category: rule.category,
          severity: rule.severity,
          message:  rule.message(match, data),
          action:   rule.action || null,
        });
      }
    } catch (_) {}
  }

  return triggered;
}

export const SEVERITY_COLOR = {
  critical: 'var(--danger)',
  warning:  'var(--warning)',
  info:     'var(--primary)',
  success:  'var(--success)',
};

export const SEVERITY_BG = {
  critical: '#ef444420',
  warning:  '#f59e0b20',
  info:     '#7c6af720',
  success:  '#22c55e20',
};
