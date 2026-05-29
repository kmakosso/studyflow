/* ── gradeCalc.js — Moyennes LMD (matière → UE → générale) ──────────
 *
 * Hiérarchie de calcul du système français (LMD) :
 *   1. Moyenne d'une matière  = Σ(note_norm × coef_note) / Σ(coef_note)
 *      où note_norm = (score / maxScore) × 20
 *   2. Moyenne d'une UE       = Σ(moy_matière × coef_matière) / Σ(coef_matière)
 *      (uniquement les matières ayant au moins une note)
 *   3. Moyenne générale       = Σ(moy_UE × coef_UE) / Σ(coef_UE)
 *      (uniquement les UE ayant au moins une matière notée)
 *
 * Une note / matière / UE renvoie `null` si elle n'a pas de données,
 * afin qu'elle soit exclue de la pondération du niveau supérieur.
 */

/** Note normalisée sur 20 */
export function normalizeGrade(g) {
  const max = g.maxScore || 20;
  if (!max) return 0;
  return (g.score / max) * 20;
}

/** Moyenne d'une matière à partir de ses notes (pondérée par coef de note) */
export function subjectAverage(gradeList) {
  if (!gradeList || gradeList.length === 0) return null;
  let weight = 0, sum = 0;
  for (const g of gradeList) {
    const c = g.coefficient ?? 1;
    weight += c;
    sum    += normalizeGrade(g) * c;
  }
  return weight > 0 ? sum / weight : null;
}

/** Coefficient d'une matière (défaut : 1) */
export function subjectCoef(subject) {
  const c = Number(subject?.coefficient);
  return Number.isFinite(c) && c > 0 ? c : 1;
}

/** Coefficient (ou crédits ECTS) d'une UE (défaut : 1) */
export function ueCoef(ue) {
  const c = Number(ue?.coefficient);
  return Number.isFinite(c) && c > 0 ? c : 1;
}

/**
 * Moyenne d'une UE.
 * @param subjects  matières de l'UE
 * @param gradesBySubject  (subjectId) => grade[]
 * @returns { average, gradedCount, totalCoef }
 */
export function ueAverage(subjects, gradesBySubject) {
  let weight = 0, sum = 0, graded = 0;
  for (const s of subjects) {
    const avg = subjectAverage(gradesBySubject(s.id));
    if (avg === null) continue;
    const c = subjectCoef(s);
    weight += c;
    sum    += avg * c;
    graded += 1;
  }
  return {
    average:     weight > 0 ? sum / weight : null,
    gradedCount: graded,
    totalCoef:   weight,
  };
}

/**
 * Moyenne générale du semestre.
 * @param groups  [{ ue, average }]  — résultats déjà calculés par UE
 *                (ue peut être null pour le groupe « Hors UE »)
 * @returns { average, totalCoef, validatedCount }
 */
export function generalAverage(groups) {
  let weight = 0, sum = 0;
  for (const { ue, average } of groups) {
    if (average === null) continue;
    const c = ueCoef(ue);
    weight += c;
    sum    += average * c;
  }
  return {
    average:   weight > 0 ? sum / weight : null,
    totalCoef: weight,
  };
}

/** Couleur d'une moyenne /20 */
export function avgColor(avg) {
  if (avg === null || avg === undefined) return 'var(--muted)';
  if (avg >= 16) return 'var(--success)';
  if (avg >= 12) return 'var(--warning)';
  if (avg >= 10) return '#f59e0b';
  return 'var(--danger)';
}

/** UE / matière validée si moyenne ≥ 10 */
export function isValidated(avg) {
  return avg !== null && avg !== undefined && avg >= 10;
}
