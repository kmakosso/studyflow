import { generatePlan } from './scheduler.js';
import { isWeekend }   from 'date-fns';

/* ─── Slot helpers ───────────────────────────────────────────────── */

export function getDayHours(date, slotConfig) {
  const key = isWeekend(new Date(date)) ? 'weekend' : 'weekday';
  return slotConfig[key]
    .filter(s => s.enabled)
    .reduce((sum, s) => sum + s.hours, 0);
}

function getActiveSlots(date, slotConfig) {
  const key = isWeekend(new Date(date)) ? 'weekend' : 'weekday';
  return slotConfig[key].filter(s => s.enabled);
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
        // No more slots — just attach remaining to last slot
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

export function generateAIPlan(assignments, exams, config = {}, subjects = [], profile = null, slotConfig = null) {
  // Compute representative hours/day from slot config
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

  const base = generatePlan(assignments, exams, { ...config, hoursPerDay }, subjects);

  // Annotate each day + distribute into slots
  const enhanced = base.map(day => {
    const dayHours  = slotConfig ? getDayHours(day.date, slotConfig) : hoursPerDay;
    const slots     = slotConfig ? getActiveSlots(day.date, slotConfig) : [];
    const slotTasks = slotConfig ? assignSlots(day.tasks, slots) : day.tasks;

    return {
      ...day,
      tasks:             slotTasks,
      availableHours:    dayHours,
      overloaded:        day.totalHours > dayHours * 1.2,
      underloaded:       day.tasks.length > 0 && day.totalHours < dayHours * 0.3,
      suggestedPomodoros: Math.ceil(day.totalHours * 60 / Math.max(15, profile?.avgFocusDuration || 25)),
      isWeekend:         isWeekend(new Date(day.date)),
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

  if (slotConfig) {
    const wd = slotConfig.weekday.filter(s => s.enabled).reduce((a, s) => a + s.hours, 0);
    const we = slotConfig.weekend.filter(s => s.enabled).reduce((a, s) => a + s.hours, 0);
    if (wd > 0 || we > 0) {
      suggestions.push({
        type:     'slots',
        severity: 'info',
        message:  `Créneaux configurés : semaine ${wd}h/jour · weekend ${we}h/jour — soit ~${hoursPerDay}h/jour en moyenne`,
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
