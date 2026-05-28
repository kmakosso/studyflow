import { addDays, format, differenceInDays, isAfter, startOfDay } from 'date-fns';

const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };

/**
 * Generate an optimized study plan.
 * @param {object[]} assignments  - pending assignments with dueDate, priority, estimatedHours
 * @param {object[]} exams        - upcoming exams with date, subjectName, importance
 * @param {object}   config       - { hoursPerDay: number, startDate: Date, days: number }
 * @param {object[]} subjects     - for name lookup
 * @param {object}   dayCapacity  - optional map { "YYYY-MM-DD": freeHours } — overrides hoursPerDay per day
 *                                  (pass reduced hours after subtracting class time)
 */
export function generatePlan(assignments, exams, config = {}, subjects = [], dayCapacity = {}) {
  const {
    hoursPerDay = 3,
    startDate   = new Date(),
    days        = 14,
  } = config;

  const today    = startOfDay(startDate);
  const subMap   = Object.fromEntries(subjects.map(s => [s.id, s]));

  // Build task queue ─ exams generate revision blocks
  const tasks = [];

  for (const a of assignments) {
    if (a.status === 'done') continue;
    const daysLeft   = differenceInDays(new Date(a.dueDate), today);
    if (daysLeft < 0) continue;
    const urgency    = (PRIORITY_WEIGHT[a.priority] || 1) * (1 / Math.max(1, daysLeft));
    const sub        = subMap[a.subjectId];
    tasks.push({
      type:    'assignment',
      id:      a.id,
      title:   a.title,
      subject: sub?.name || '',
      color:   sub?.color || '#7c6af7',
      dueDate: a.dueDate,
      hours:   a.estimatedHours || 1.5,
      urgency,
    });
  }

  for (const e of exams) {
    const daysLeft = differenceInDays(new Date(e.date), today);
    if (daysLeft < 0 || daysLeft > days) continue;
    const sub = subMap[e.subjectId];
    // Spread revision evenly across days before exam
    const revDays = Math.min(daysLeft, Math.max(1, Math.ceil(daysLeft * 0.6)));
    const hPerDay = (e.importanceHours || 1) / revDays;
    for (let d = daysLeft - revDays; d < daysLeft; d++) {
      tasks.push({
        type:    'exam_revision',
        id:      e.id + '_' + d,
        title:   `Révision — ${sub?.name || 'Examen'}`,
        subject: sub?.name || '',
        color:   sub?.color || '#ef4444',
        dueDate: e.date,
        hours:   hPerDay,
        targetDay: d,
        urgency: (PRIORITY_WEIGHT[e.importance] || 2) * 2,
      });
    }
  }

  // Sort by urgency desc
  tasks.sort((a, b) => b.urgency - a.urgency);

  // Greedy fill: for each day, assign tasks until hoursPerDay reached
  const plan = [];
  const assigned = new Set();

  for (let d = 0; d < days; d++) {
    const date      = addDays(today, d);
    const dateStr   = format(date, 'yyyy-MM-dd');
    // Use per-day capacity (class-adjusted) when provided, otherwise default hoursPerDay
    const cap       = dateStr in dayCapacity ? dayCapacity[dateStr] : hoursPerDay;
    const dayTasks  = [];
    let hoursLeft   = cap;

    for (const t of tasks) {
      if (assigned.has(t.id)) continue;
      if (t.targetDay !== undefined && t.targetDay !== d) continue;
      if (hoursLeft <= 0.05) break;

      const alloc = Math.min(t.hours, hoursLeft);
      dayTasks.push({ ...t, allocHours: Math.round(alloc * 10) / 10 });
      hoursLeft -= alloc;
      if (alloc >= t.hours) assigned.add(t.id);
    }

    if (dayTasks.length > 0 || d === 0) {
      plan.push({ date: dateStr, tasks: dayTasks, totalHours: cap - hoursLeft });
    }
  }

  return plan;
}
