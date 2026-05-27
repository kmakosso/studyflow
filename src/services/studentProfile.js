import { db } from './db.js';
import { differenceInDays, getHours } from 'date-fns';

const PROFILE_KEY = 'main';

export async function getProfile() {
  let stored = null;
  try { stored = await db.get('profile', PROFILE_KEY); } catch (_) {}
  if (!stored) return computeProfile();
  const ageHours = (Date.now() - new Date(stored.lastComputed || 0).getTime()) / 3600000;
  if (ageHours > 1) return computeProfile();
  return stored;
}

export async function computeProfile() {
  const [pomodoro, assignments, grades, revisions] = await Promise.all([
    db.all('pomodoro'),
    db.all('assignments'),
    db.all('grades'),
    db.all('revisions'),
  ]);

  const profile = {
    id: PROFILE_KEY,
    productiveHours:   [],
    preferredWorkTime: 'evening',
    sessionsPerWeek:   0,
    avgFocusDuration:  25,
    completionRate:    1,
    delayTendency:     0,
    avgDelayDays:      0,
    weakSubjectIds:    [],
    strongSubjectIds:  [],
    avgGrade:          null,
    revisionMastery:   0,
    lastComputed:      new Date().toISOString(),
  };

  // === Pomodoro analysis ===
  const workSessions = pomodoro.filter(s => s.completed && s.phase === 'work' && s.date);
  if (workSessions.length > 0) {
    const hourMap = {};
    workSessions.forEach(s => {
      try {
        const h = getHours(new Date(s.date));
        hourMap[h] = (hourMap[h] || 0) + 1;
      } catch (_) {}
    });

    profile.productiveHours = Object.entries(hourMap)
      .map(([hour, count]) => ({ hour: Number(hour), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const slots = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    Object.entries(hourMap).forEach(([h, c]) => {
      const hour = Number(h);
      if      (hour >= 5  && hour < 12) slots.morning   += c;
      else if (hour >= 12 && hour < 17) slots.afternoon += c;
      else if (hour >= 17 && hour < 22) slots.evening   += c;
      else                              slots.night     += c;
    });
    profile.preferredWorkTime = Object.entries(slots).sort((a, b) => b[1] - a[1])[0][0];

    const last28 = workSessions.filter(s => {
      try { return differenceInDays(new Date(), new Date(s.date)) <= 28; } catch (_) { return false; }
    });
    profile.sessionsPerWeek = Math.round(last28.length / 4);

    const withDur = workSessions.filter(s => (s.duration || 0) > 0);
    if (withDur.length > 0) {
      const avgSec = withDur.reduce((a, s) => a + s.duration, 0) / withDur.length;
      profile.avgFocusDuration = Math.round(avgSec / 60);
    }
  }

  // === Assignment reliability analysis ===
  const done = assignments.filter(a => a.status === 'done');
  if (assignments.length > 0) {
    profile.completionRate = done.length / assignments.length;
    const lateOnes = done.filter(a => a.completedAt && a.dueDate && (() => {
      try { return differenceInDays(new Date(a.completedAt), new Date(a.dueDate)) > 0; } catch (_) { return false; }
    })());
    profile.delayTendency = done.length > 0 ? lateOnes.length / done.length : 0;
    if (lateOnes.length > 0) {
      profile.avgDelayDays = Math.round(
        lateOnes.reduce((acc, a) => {
          try { return acc + differenceInDays(new Date(a.completedAt), new Date(a.dueDate)); } catch (_) { return acc; }
        }, 0) / lateOnes.length
      );
    }
  }

  // === Grade analysis ===
  if (grades.length > 0) {
    const bySubject = {};
    grades.forEach(g => {
      if (!g.subjectId || !g.grade || !g.maxGrade) return;
      if (!bySubject[g.subjectId]) bySubject[g.subjectId] = [];
      bySubject[g.subjectId].push((g.grade / g.maxGrade) * 20);
    });
    const subjectAvgs = Object.entries(bySubject).map(([id, scores]) => ({
      id,
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    }));
    profile.weakSubjectIds   = subjectAvgs.filter(s => s.avg < 10).map(s => s.id);
    profile.strongSubjectIds = subjectAvgs.filter(s => s.avg >= 15).map(s => s.id);
    const allAvgs = subjectAvgs.map(s => s.avg);
    if (allAvgs.length > 0) {
      profile.avgGrade = Math.round((allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) * 10) / 10;
    }
  }

  // === Revision mastery ===
  if (revisions.length > 0) {
    const mastered = revisions.filter(r => r.status === 'mastered');
    profile.revisionMastery = mastered.length / revisions.length;
  }

  try { await db.put('profile', profile); } catch (_) {}
  return profile;
}

export function computeStudentScore(profile, weeklyMinutes) {
  if (!profile) return null;

  // Regularity (0-30): pomodoro sessions per week
  let regularity = 0;
  if      (profile.sessionsPerWeek >= 12) regularity = 30;
  else if (profile.sessionsPerWeek >= 7)  regularity = 24;
  else if (profile.sessionsPerWeek >= 4)  regularity = 16;
  else if (profile.sessionsPerWeek >= 1)  regularity = 8;

  // Punctuality (0-30): completion rate + no delay tendency
  const punctuality = Math.round(
    Math.min(1, profile.completionRate) * 20 +
    (1 - Math.min(1, profile.delayTendency)) * 10
  );

  // Mastery (0-20): grades + revision
  const gradePart    = profile.avgGrade !== null ? (profile.avgGrade / 20) * 10 : 5;
  const revisionPart = profile.revisionMastery * 10;
  const mastery      = Math.round(gradePart + revisionPart);

  // Workload consistency (0-20): weekly study hours
  const weeklyHours = (weeklyMinutes || 0) / 60;
  let workload = 0;
  if      (weeklyHours >= 15) workload = 20;
  else if (weeklyHours >= 8)  workload = 14;
  else if (weeklyHours >= 3)  workload = 8;
  else if (weeklyHours > 0)   workload = 3;

  const total = Math.min(100, regularity + punctuality + mastery + workload);
  const label = total >= 85 ? 'Excellent' : total >= 70 ? 'Bien' : total >= 50 ? 'Moyen' : 'À améliorer';
  const color = total >= 85 ? 'var(--success)' : total >= 70 ? 'var(--primary)' : total >= 50 ? 'var(--warning)' : 'var(--danger)';

  return { total, breakdown: { regularity, punctuality, mastery, workload }, label, color };
}

export const WORK_TIME_LABELS = {
  morning:   'Matin (6h–12h)',
  afternoon: 'Après-midi (12h–17h)',
  evening:   'Soir (17h–22h)',
  night:     'Nuit (22h–6h)',
};
