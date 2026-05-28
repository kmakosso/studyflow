import { generatePlan } from './scheduler.js';
import { isWeekend }   from 'date-fns';

/* ─── Time / course helpers ──────────────────────────────────────── */

function timeToMin(t = '00:00') {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Parse slot.start like "08h" → 8 */
function parseSlotStartH(s = '08h') { return parseInt(s, 10) || 0; }

/**
 * Return how many hours of `course` overlap with `slot`.
 * slot.start is like "08h", slot.hours is the slot duration.
 * course.startTime / course.endTime are "HH:MM" strings.
 */
function courseBlockedHoursInSlot(course, slot) {
  if (!course.startTime || !course.endTime) return 0;
  const cStart  = timeToMin(course.startTime);
  const cEnd    = timeToMin(course.endTime);
  const sStart  = parseSlotStartH(slot.start) * 60;
  const sEnd    = sStart + slot.hours * 60;
  const overlap = Math.max(0, Math.min(cEnd, sEnd) - Math.max(cStart, sStart));
  return overlap / 60;
}

/** Total class hours for a given day (across all courses) */
function totalCourseHours(courses) {
  return courses.reduce((sum, c) => {
    if (!c.startTime || !c.endTime) return sum;
    return sum + (timeToMin(c.endTime) - timeToMin(c.startTime)) / 60;
  }, 0);
}

/* ─── Slot helpers ───────────────────────────────────────────────── */

/**
 * Compute free study hours for a given day.
 * Subtracts the class-time that overlaps each active slot.
 *
 * @param {string}   date        - "YYYY-MM-DD"
 * @param {object}   slotConfig  - { weekday: Slot[], weekend: Slot[] }
 * @param {object[]} busyCourses - courses for that day (with startTime, endTime)
 */
export function getDayHours(date, slotConfig, busyCourses = []) {
  const key = isWeekend(new Date(date)) ? 'weekend' : 'weekday';
  return slotConfig[key]
    .filter(s => s.enabled)
    .reduce((sum, s) => {
      const blocked = busyCourses.reduce((b, c) => b + courseBlockedHoursInSlot(c, s), 0);
      return sum + Math.max(0, s.hours - blocked);
    }, 0);
}

/**
 * Return active slots with hours reduced by course overlap.
 * Slots whose free hours drop to ≤ 0.1 are excluded entirely.
 */
function getActiveSlots(date, slotConfig, busyCourses = []) {
  const key = isWeekend(new Date(date)) ? 'weekend' : 'weekday';
  return slotConfig[key]
    .filter(s => s.enabled)
    .map(s => {
      const blocked = busyCourses.reduce((b, c) => b + courseBlockedHoursInSlot(c, s), 0);
      const free    = Math.max(0, s.hours - blocked);
      return { ...s, hours: Math.round(free * 10) / 10, blockedHours: Math.round(blocked * 10) / 10 };
    })
    .filter(s => s.hours > 0.1);
}

/** Distribute a flat task list into available slots for one day.
 *  Tasks that exceed a slot spill into the next slot. */
function assignSlots(tasks, slots) {
  if (!slots.length) return tasks.map(t => ({ ...t, slot: null }));

  const result = [];
  let si    = 0;
  let left  = slots[si]?.hours ?? 0;

  for (const task of tasks) {
    let remaining = task.allocHours;

    while (remaining > 0.05 && si < slots.length) {
      const use = Math.min(remaining, left);
      result.push({
        ...task,
        allocHours: Math.round(use * 10) / 10,
        slot:       slots[si],
      });
      remaining -= use;
      left      -= use;
      if (left <= 0.05 && si < slots.length - 1) {
        si++;
        left = slots[si].hours;
      } else if (left <= 0.05) {
        // No more slots — attach remaining to last slot
        if (remaining > 0.05) {
          result.push({
            ...task,
            allocHours: Math.round(remaining * 10) / 10,
            slot:       slots[si],
          });
          remaining = 0;
        }
        break;
      }
    }
  }

  return result;
}

/* ─── Main planner ───────────────────────────────────────────────── */

/**
 * @param {object[]} assignments
 * @param {object[]} exams
 * @param {object}   config      - { hoursPerDay, days, ... }
 * @param {object[]} subjects
 * @param {object|null} profile
 * @param {object|null} slotConfig  - { weekday: Slot[], weekend: Slot[] }
 * @param {object}   busyPerDay  - map "YYYY-MM-DD" → course[] (with startTime, endTime)
 *                                 Used to subtract class time from each day's available slots.
 */
export function generateAIPlan(
  assignments, exams, config = {}, subjects = [],
  profile = null, slotConfig = null, busyPerDay = {},
) {
  // Compute representative hours/day from slot config (without course subtraction — just for reference)
  let hoursPerDay;
  if (slotConfig) {
    const wd = slotConfig.weekday.filter(s => s.enabled).reduce((a, s) => a + s.hours, 0);
    const we = slotConfig.weekend.filter(s => s.enabled).reduce((a, s) => a + s.hours, 0);
    hoursPerDay = Math.round(((5 * wd + 2 * we) / 7) * 10) / 10;
  } else {
    hoursPerDay = config.hoursPerDay ?? (profile?.avgFocusDuration
      ? Math.max(2, Math.min(6, Math.round(profile.avgFocusDuration / 60 * 4 * 10) / 10))
      : 3);
  }

  // Build per-day capacity map (slot hours minus course overlap)
  const dayCapacity = {};
  if (slotConfig) {
    const numDays = config.days || 14;
    const today   = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < numDays; i++) {
      const d       = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      dayCapacity[dateStr] = getDayHours(dateStr, slotConfig, busyPerDay[dateStr] || []);
    }
  }

  const base = generatePlan(
    assignments, exams,
    { ...config, hoursPerDay },
    subjects,
    dayCapacity,  // scheduler now respects per-day reduced capacity
  );

  // Annotate each day + distribute into slots
  const enhanced = base.map(day => {
    const busyCourses = busyPerDay[day.date] || [];
    const dayHours    = slotConfig ? getDayHours(day.date, slotConfig, busyCourses) : hoursPerDay;
    const slots       = slotConfig ? getActiveSlots(day.date, slotConfig, busyCourses) : [];
    const slotTasks   = slotConfig ? assignSlots(day.tasks, slots) : day.tasks;
    const classH      = Math.round(totalCourseHours(busyCourses) * 10) / 10;

    return {
      ...day,
      tasks:              slotTasks,
      availableHours:     dayHours,
      courseHours:        classH,        // hours blocked by classes
      courses:            busyCourses,   // raw course list for display
      overloaded:         day.totalHours > dayHours * 1.2,
      underloaded:        day.tasks.length > 0 && day.totalHours < dayHours * 0.3,
      suggestedPomodoros: Math.ceil(day.totalHours * 60 / Math.max(15, profile?.avgFocusDuration || 25)),
      isWeekend:          isWeekend(new Date(day.date)),
    };
  });

  // AI suggestions
  const suggestions = [];

  const overloadedDays = enhanced.filter(d => d.overloaded);
  if (overloadedDays.length > 0) {
    suggestions.push({
      type:     'rebalance',
      severity: 'warning',
      message:  `${overloadedDays.length} jour${overloadedDays.length > 1 ? 's' : ''} surchargé${overloadedDays.length > 1 ? 's' : ''} — utilise le bouton "Rééquilibrer" pour répartir la charge`,
    });
  }

  const busyDays = Object.values(busyPerDay).filter(cs => cs.length > 0).length;
  if (busyDays > 0) {
    const totalClassH = Object.values(busyPerDay)
      .flat()
      .reduce((sum, c) => sum + (c.startTime && c.endTime
        ? (timeToMin(c.endTime) - timeToMin(c.startTime)) / 60 : 0), 0);
    suggestions.push({
      type:     'schedule',
      severity: 'info',
      message:  `📚 Emploi du temps pris en compte : ${busyDays} jour${busyDays > 1 ? 's' : ''} de cours (${Math.round(totalClassH * 10) / 10}h au total) — les créneaux de cours sont exclus du planning`,
    });
  }

  if (slotConfig) {
    const wd = slotConfig.weekday.filter(s => s.enabled).reduce((a, s) => a + s.hours, 0);
    const we = slotConfig.weekend.filter(s => s.enabled).reduce((a, s) => a + s.hours, 0);
    if (wd > 0 || we > 0) {
      suggestions.push({
        type:     'slots',
        severity: 'info',
        message:  `Créneaux configurés : semaine ${wd}h/jour · weekend ${we}h/jour — soit ~${hoursPerDay}h/jour en moyenne (avant déduction des cours)`,
      });
    }
    const noWeekend = we === 0;
    if (noWeekend) {
      suggestions.push({
        type:     'weekend',
        severity: 'info',
        message:  'Aucun créneau weekend activé — activer le samedi ou dimanche peut réduire la surcharge en semaine',
      });
    }
  }

  if (profile?.delayTendency > 0.4) {
    suggestions.push({
      type:     'early_start',
      severity: 'info',
      message:  `Tu as tendance à repousser les tâches (${Math.round(profile.delayTendency * 100)}% de retard historique) — commence chaque tâche 1 jour avant la date prévue`,
    });
  }

  if (profile?.preferredWorkTime) {
    const labels = { morning: 'matin', afternoon: 'après-midi', evening: 'soir', night: 'nuit' };
    suggestions.push({
      type:     'timing',
      severity: 'info',
      message:  `Tu es plus productif le ${labels[profile.preferredWorkTime]} — planifie tes sessions difficiles sur ce créneau`,
    });
  }

  if (profile?.avgFocusDuration && profile.avgFocusDuration < 20) {
    suggestions.push({
      type:     'focus',
      severity: 'info',
      message:  `Ta durée de concentration moyenne est de ${profile.avgFocusDuration} min — privilégie des sessions courtes et fréquentes`,
    });
  }

  return {
    days:           enhanced,
    suggestions,
    suggestedHours: hoursPerDay,
    profileUsed:    profile !== null,
    slotConfig,
  };
}

export function rebalancePlan(plan, hoursPerDay) {
  const balanced = plan.map(d => ({ ...d, tasks: [...d.tasks] }));

  for (let i = 0; i < balanced.length; i++) {
    const day = balanced[i];
    const cap = day.availableHours || hoursPerDay;
    if (day.totalHours <= cap * 1.15) continue;

    for (let j = i + 1; j < balanced.length; j++) {
      const nextCap = balanced[j].availableHours || hoursPerDay;
      if (balanced[j].totalHours < nextCap * 0.85) {
        const task = day.tasks.pop();
        if (!task) break;
        balanced[j].tasks.push(task);
        balanced[j].totalHours = balanced[j].tasks.reduce((a, t) => a + (t.allocHours || 0), 0);
        day.totalHours         = day.tasks.reduce((a, t) => a + (t.allocHours || 0), 0);
        day.overloaded         = day.totalHours > cap * 1.15;
        break;
      }
    }
  }

  return balanced;
}
