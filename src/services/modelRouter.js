/* ── modelRouter.js — Sélection automatique du modèle Claude ──
 *
 * Stratégie : Haiku pour les requêtes simples (×5 moins cher),
 *             Sonnet pour les requêtes intermédiaires,
 *             Opus pour la planification et le raisonnement complexe.
 *
 * Économies attendues : ~70 % sur les questions simples.
 */

export const MODELS = {
  HAIKU:  'claude-haiku-4-5',
  SONNET: 'claude-sonnet-4-6',
  OPUS:   'claude-opus-4-7',
};

/* ─── Mots-clés de complexité ───────────────────────────────────── */

const OPUS_KEYWORDS = [
  'planifie', 'génère un planning', 'analyse en profondeur', 'compare',
  'stratégie', 'optimise', 'priorise', 'planning semestri',
  'révision complète', 'décompose', 'raisonne', 'explique en détail',
  'contrainte', 'propose un plan', 'calendrier de révision',
];

const HAIKU_KEYWORDS = [
  'quel est', 'quand', 'où', 'qui enseigne', 'liste les',
  'rappelle-moi', 'définis', 'quelle est la date', 'combien',
  'résume en une phrase', 'c\'est quoi',
];

/**
 * Sélectionne le modèle le plus adapté à la requête.
 *
 * @param query          Texte de la question
 * @param opts.ragChunks Nombre de chunks RAG injectés
 * @param opts.turns     Nombre de tours de conversation déjà effectués
 * @param opts.forceOpus Forcer Opus (ex : génération de planning)
 * @returns { modelId, useAdaptiveThinking, reason }
 */
export function routeModel(query, opts = {}) {
  const { ragChunks = 0, turns = 0, forceOpus = false } = opts;
  const q = query.toLowerCase();

  if (forceOpus) {
    return {
      modelId:            MODELS.OPUS,
      useAdaptiveThinking: true,
      reason:             'Forcé Opus (tâche complexe)',
    };
  }

  // Heuristique Haiku : courte + peu de contexte + mots simples
  const isShort  = query.length < 90;
  const fewChunks = ragChunks <= 1;
  const fewTurns  = turns <= 1;
  const hasHaikuKw = HAIKU_KEYWORDS.some(k => q.includes(k));

  if (isShort && fewChunks && fewTurns && hasHaikuKw) {
    return {
      modelId:            MODELS.HAIKU,
      useAdaptiveThinking: false,
      reason:             'Question simple courte',
    };
  }

  // Heuristique Opus : longue + planification + beaucoup de contexte
  const isLong    = query.length > 280;
  const manyChunks = ragChunks >= 5;
  const hasOpusKw  = OPUS_KEYWORDS.some(k => q.includes(k));

  if (isLong || manyChunks || hasOpusKw) {
    return {
      modelId:            MODELS.OPUS,
      useAdaptiveThinking: true,
      reason:             'Requête complexe ou planification',
    };
  }

  // Par défaut : Sonnet (bon équilibre qualité/prix)
  return {
    modelId:            MODELS.SONNET,
    useAdaptiveThinking: false,
    reason:             'Complexité intermédiaire',
  };
}

/** Coût estimé d'une requête sans l'exécuter (avant appel API) */
export function estimateCost(query, modelId) {
  const { inputPrice, outputPrice } = {
    [MODELS.OPUS]:   { inputPrice: 5.00,  outputPrice: 25.00 },
    [MODELS.SONNET]: { inputPrice: 3.00,  outputPrice: 15.00 },
    [MODELS.HAIKU]:  { inputPrice: 1.00,  outputPrice: 5.00  },
  }[modelId] ?? { inputPrice: 5.00, outputPrice: 25.00 };

  // Estimation grossière : ~1 token ≈ 4 chars
  const inputTokens  = Math.ceil(query.length / 4) + 500; // +500 pour le system prompt
  const outputTokens = 600;  // estimation sortie moyenne

  return ((inputTokens * inputPrice) + (outputTokens * outputPrice)) / 1_000_000;
}
