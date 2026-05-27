import { generatePlan } from './scheduler.js';

export function generateAIPlan(assignments, exams, config = {}, subjects = [], profile = null) {
  const suggested = profile?.avgFocusDuration
    ? Math.max(2, Math.min(6, Math.round(profile.avgFocusDuration / 60 * 4 * 10) / 10))
    : 3;

  const {
    hoursPerDay = suggested,
    days        = 14,
    startDate   = new Date(),
  } = config;

  const base = generatePlan(assignments, exams, { hoursPerDay, days, startDate }, subjects);

  // Annotate each day with AI insights
  const enhanced = base.map(day => ({
    ...day,
    overloaded:        day.totalHours > hoursPerDay * 1.2,
    underloaded:       day.tasks.length > 0 && day.totalHours < hoursPerDay * 0.3,
    suggestedPomodoros: Math.ceil(day.totalHours * 60 / Math.max(15, profile?.avgFocusDuration || 25)),
  }));

  // Generate AI suggestions
  const suggestions = [];

  const overloadedDays = enhanced.filter(d => d.overloaded);
  if (overloadedDays.length > 0) {
    suggestions.push({
      type:     'rebalance',
      severity: 'warning',
      message:  `${overloadedDays.length} jour${overloadedDays.length > 1 ? 's' : ''} surchargé${overloadedDays.length > 1 ? 's' : ''} — utilise le bouton "Rééquilibrer" pour répartir la charge`,
    });
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
    days:          enhanced,
    suggestions,
    suggestedHours: suggested,
    profileUsed:   profile !== null,
  };
}

export function rebalancePlan(plan, hoursPerDay) {
  const balanced = plan.map(d => ({ ...d, tasks: [...d.tasks] }));

  for (let i = 0; i < balanced.length; i++) {
    const day = balanced[i];
    if (day.totalHours <= hoursPerDay * 1.15) continue;

    for (let j = i + 1; j < balanced.length; j++) {
      if (balanced[j].totalHours < hoursPerDay * 0.85) {
        const task = day.tasks.pop();
        if (!task) break;
        balanced[j].tasks.push(task);
        balanced[j].totalHours = balanced[j].tasks.reduce((a, t) => a + (t.allocHours || 0), 0);
        day.totalHours         = day.tasks.reduce((a, t) => a + (t.allocHours || 0), 0);
        day.overloaded         = day.totalHours > hoursPerDay * 1.15;
        break;
      }
    }
  }

  return balanced;
}
