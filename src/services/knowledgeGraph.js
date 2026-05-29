import { db } from './db.js';
import { differenceInDays } from 'date-fns';

export async function buildKnowledgeGraph() {
  const [subjects, grades, revisions, assignments, exams] = await Promise.all([
    db.all('subjects'),
    db.all('grades'),
    db.all('revisions'),
    db.all('assignments'),
    db.all('exams'),
  ]);

  const today = new Date().toISOString().split('T')[0];
  const now   = new Date();

  return subjects.map(subject => {
    // Grade analysis
    const subjectGrades = grades.filter(g => g.subjectId === subject.id);
    let gradePct  = null;
    let gradeTrend = 'stable';

    if (subjectGrades.length > 0) {
      const pcts = subjectGrades.map(g => g.maxScore ? (g.score / g.maxScore) * 100 : null).filter(Boolean);
      if (pcts.length > 0) {
        gradePct = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      }
      if (pcts.length >= 4) {
        const half    = Math.floor(pcts.length / 2);
        const recent  = pcts.slice(0, half);
        const older   = pcts.slice(half);
        const rAvg    = recent.reduce((a, b) => a + b, 0) / recent.length;
        const oAvg    = older.reduce((a, b) => a + b, 0) / older.length;
        if (rAvg > oAvg + 5)       gradeTrend = 'improving';
        else if (rAvg < oAvg - 5)  gradeTrend = 'declining';
      }
    }

    // Revision mastery
    const subRevisions     = revisions.filter(r => r.subjectId === subject.id);
    const masteredCount    = subRevisions.filter(r => r.status === 'mastered').length;
    const revisionMastery  = subRevisions.length > 0
      ? Math.round(masteredCount / subRevisions.length * 100)
      : null;
    const dueCards = subRevisions.filter(r => r.nextReview && r.nextReview <= today).length;

    // Workload
    const pendingCount  = assignments.filter(a => a.subjectId === subject.id && a.status !== 'done').length;
    const upcomingExams = exams.filter(e => {
      try { return e.subjectId === subject.id && new Date(e.date) >= now; } catch (_) { return false; }
    });

    // Combined mastery score (0-100)
    let masteryScore = 50;
    if (gradePct !== null && revisionMastery !== null) {
      masteryScore = Math.round(gradePct * 0.6 + revisionMastery * 0.4);
    } else if (gradePct !== null) {
      masteryScore = gradePct;
    } else if (revisionMastery !== null) {
      masteryScore = revisionMastery;
    }

    // Risk
    let riskLevel = 'low';
    if (masteryScore < 50) riskLevel = 'high';
    else if (masteryScore < 70) riskLevel = 'medium';
    const nearExam = upcomingExams.some(e => {
      try { return differenceInDays(new Date(e.date), now) <= 7; } catch (_) { return false; }
    });
    if (nearExam && riskLevel === 'medium') riskLevel = 'high';

    return {
      subject,
      gradePct,
      gradeTrend,
      revisionMastery,
      masteryScore,
      dueCards,
      totalCards:      subRevisions.length,
      pendingAssignments: pendingCount,
      upcomingExams:   upcomingExams.length,
      riskLevel,
    };
  });
}

export function getMasteryColor(score) {
  if (score === null) return 'var(--muted)';
  if (score >= 75)    return 'var(--success)';
  if (score >= 50)    return 'var(--warning)';
  return 'var(--danger)';
}

export const RISK_LABELS = {
  low:    'Maîtrisé',
  medium: 'À renforcer',
  high:   'Difficultés',
};

export const TREND_ICONS = {
  improving: '↗',
  declining: '↘',
  stable:    '→',
};
