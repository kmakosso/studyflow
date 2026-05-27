/**
 * Simplified SM-2 spaced repetition algorithm.
 * quality: 1=Again, 3=Hard, 4=Good, 5=Easy
 */
export function computeNextReview(card, quality) {
  let { interval = 0, ease = 2.5 } = card;

  if (quality < 3) {
    interval = 1;
    ease     = Math.max(1.3, ease - 0.2);
  } else {
    if (interval === 0)      interval = 1;
    else if (interval === 1) interval = 4;
    else                     interval = Math.round(interval * ease);

    const bonus = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
    ease = Math.max(1.3, ease + bonus);
  }

  const next = new Date();
  next.setDate(next.getDate() + interval);

  const status = ease >= 2.3 && interval >= 7 ? 'mastered'
               : interval >= 2               ? 'learning'
               : 'unseen';

  return {
    interval,
    ease: Math.round(ease * 100) / 100,
    nextReview:  next.toISOString().split('T')[0],
    lastReview:  new Date().toISOString().split('T')[0],
    status,
  };
}

export function isDue(card) {
  if (!card.nextReview) return true;
  return card.nextReview <= new Date().toISOString().split('T')[0];
}

export function getStatusColor(status) {
  return { unseen: 'var(--muted)', learning: 'var(--warning)', mastered: 'var(--success)' }[status] || 'var(--muted)';
}

export function getStatusLabel(status) {
  return { unseen: 'Pas vu', learning: 'En cours', mastered: 'Maîtrisé' }[status] || '—';
}
