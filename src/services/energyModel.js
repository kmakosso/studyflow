import { db } from './db.js';

/* ── Compute today's energy / fatigue level from Pomodoro history ── */
export async function getEnergyStatus() {
  const today    = new Date().toISOString().split('T')[0];
  const pomodoro = await db.all('pomodoro');

  const todaySessions = pomodoro.filter(s => {
    if (!s.date) return false;
    const d = s.date.toString().split('T')[0];
    return d === today && s.completed;
  });

  const workSessions   = todaySessions.filter(s => s.phase === 'work');
  const totalMinutes   = workSessions.reduce((acc, s) => acc + (s.duration || 0), 0) / 60;
  const sessionCount   = workSessions.length;

  let level;
  if      (totalMinutes >= 300 || sessionCount >= 8) level = 'low';
  else if (totalMinutes >= 120 || sessionCount >= 4) level = 'normal';
  else                                               level = 'high';

  const ADVICE = {
    high:   "Bonne énergie ! Attaque les tâches difficiles en premier.",
    normal: "Bon rythme. Alterne tâches exigeantes et légères.",
    low:    "Fatigue détectée. Privilégie des sessions de 15-20 min et prends soin de toi.",
  };

  const SUGGESTED_MIN = { high: 45, normal: 25, low: 15 };
  const WORK_REDUCTION = { high: 0, normal: 0, low: 0.20 }; // 20% reduction when tired

  return {
    level,
    label:                  { high: 'Élevée',  normal: 'Normale',   low: 'Faible' }[level],
    icon:                   { high: '⚡',       normal: '🔋',        low: '🪫'    }[level],
    color:                  { high: 'var(--success)', normal: 'var(--primary)', low: 'var(--danger)' }[level],
    advice:                 ADVICE[level],
    todayWorkMinutes:       Math.round(totalMinutes),
    todaySessions:          sessionCount,
    suggestedSessionMinutes: SUGGESTED_MIN[level],
    workReduction:          WORK_REDUCTION[level],
  };
}

export const ENERGY_LABELS = { high: 'Élevée', normal: 'Normale', low: 'Faible' };
