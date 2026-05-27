/* ── costTracker.js — Suivi des coûts IA (100 % IndexedDB, offline) ──
 *
 * Stocke les dépenses par jour dans la table `settings` :
 *   clé  : "cost:YYYY-MM-DD"
 *   valeur : { totalUsd, savedByCache, requestCount, cacheHits, breakdown: [] }
 *
 * Budget journalier configurable via le setting "dailyBudgetUsd" (défaut 0.10 $).
 */

import { db } from './db';

/* ─── Grilles tarifaires Anthropic ($/million tokens) ───────────── */

export const AI_MODELS = {
  'claude-opus-4-7': {
    key:             'OPUS',
    inputPrice:      5.00,
    outputPrice:     25.00,
    cacheWritePrice: 6.25,   // 1.25× input
    cacheReadPrice:  0.50,   // 0.10× input  → 90 % de réduction
  },
  'claude-sonnet-4-6': {
    key:             'SONNET',
    inputPrice:      3.00,
    outputPrice:     15.00,
    cacheWritePrice: 3.75,
    cacheReadPrice:  0.30,
  },
  'claude-haiku-4-5': {
    key:             'HAIKU',
    inputPrice:      1.00,
    outputPrice:     5.00,
    cacheWritePrice: 1.25,
    cacheReadPrice:  0.10,
  },
};

const DEFAULT_DAILY_BUDGET = 0.10; // 10 centimes/jour

/* ─── Calcul du coût d'une requête ──────────────────────────────── */

export function computeCost(usage, modelId) {
  const model = AI_MODELS[modelId] ?? AI_MODELS['claude-opus-4-7'];
  const M = 1_000_000;

  const realCost =
    (usage.inputTokens      * model.inputPrice       / M) +
    (usage.outputTokens     * model.outputPrice      / M) +
    (usage.cacheWriteTokens * model.cacheWritePrice  / M) +
    (usage.cacheReadTokens  * model.cacheReadPrice   / M);

  // Ce qu'aurait coûté la requête SANS cache
  const withoutCacheCost =
    ((usage.inputTokens + usage.cacheWriteTokens + usage.cacheReadTokens)
      * model.inputPrice / M) +
    (usage.outputTokens * model.outputPrice / M);

  return {
    totalUsd:     realCost,
    savedByCache: Math.max(0, withoutCacheCost - realCost),
  };
}

/* ─── Clé du jour ────────────────────────────────────────────────── */

function todayKey() {
  return `cost:${new Date().toISOString().split('T')[0]}`;
}

/* ─── Enregistrement d'une utilisation ──────────────────────────── */

/**
 * Enregistre une utilisation IA et retourne les stats du jour.
 * Lève `BudgetExceededError` si le budget journalier est dépassé.
 *
 * @param usage   { inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens }
 * @param modelId "claude-opus-4-7" | "claude-sonnet-4-6" | "claude-haiku-4-5"
 * @param type    "chat" | "rag" | "ocr" | "planning" | "analysis"
 */
export async function trackUsage(usage, modelId, type = 'chat') {
  const { totalUsd, savedByCache } = computeCost(usage, modelId);
  const key = todayKey();

  // Charge les stats existantes du jour
  const existing = (await db.getSetting(key)) ?? {
    totalUsd:     0,
    savedByCache: 0,
    requestCount: 0,
    cacheHits:    0,
    breakdown:    [],
  };

  const updated = {
    totalUsd:     existing.totalUsd     + totalUsd,
    savedByCache: existing.savedByCache + savedByCache,
    requestCount: existing.requestCount + 1,
    cacheHits:    existing.cacheHits    + (usage.cacheReadTokens > 0 ? 1 : 0),
    breakdown: [
      ...existing.breakdown.slice(-49), // garde les 50 dernières requêtes
      {
        type,
        modelId,
        totalUsd,
        savedByCache,
        inputTokens:      usage.inputTokens,
        outputTokens:     usage.outputTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        cacheReadTokens:  usage.cacheReadTokens,
        ts: Date.now(),
      },
    ],
  };

  await db.setSetting(key, updated);

  // Vérification budget
  const budget = (await db.getSetting('dailyBudgetUsd')) ?? DEFAULT_DAILY_BUDGET;
  const stats = buildStats(updated, budget);

  if (stats.budgetUsedPct >= 100) {
    throw new BudgetExceededError(stats);
  }
  if (stats.budgetUsedPct >= 80) {
    console.warn(`[CostTracker] Budget à ${stats.budgetUsedPct.toFixed(0)} %`);
  }

  return stats;
}

/* ─── Lecture des stats du jour ──────────────────────────────────── */

export async function getDailyStats() {
  const existing = (await db.getSetting(todayKey())) ?? {
    totalUsd: 0, savedByCache: 0, requestCount: 0, cacheHits: 0, breakdown: [],
  };
  const budget = (await db.getSetting('dailyBudgetUsd')) ?? DEFAULT_DAILY_BUDGET;
  return buildStats(existing, budget);
}

function buildStats(data, budget) {
  return {
    totalUsd:      data.totalUsd,
    savedByCache:  data.savedByCache,
    requestCount:  data.requestCount,
    cacheHitRate:  data.requestCount > 0 ? data.cacheHits / data.requestCount : 0,
    budgetUsedPct: (data.totalUsd / budget) * 100,
    budget,
    breakdown:     data.breakdown ?? [],
  };
}

/* ─── Extraction depuis la réponse SSE Anthropic ─────────────────── */

/**
 * Analyse les événements SSE de la réponse streaming pour extraire
 * les compteurs de tokens (dont cache_read et cache_creation).
 */
export function extractUsageFromSseEvents(events) {
  let usage = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };

  for (const evt of events) {
    if (evt.type === 'message_start' && evt.message?.usage) {
      const u = evt.message.usage;
      usage.inputTokens      = u.input_tokens               ?? 0;
      usage.cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
      usage.cacheReadTokens  = u.cache_read_input_tokens     ?? 0;
    }
    if (evt.type === 'message_delta' && evt.usage) {
      usage.outputTokens = evt.usage.output_tokens ?? 0;
    }
  }

  return usage;
}

/* ─── Erreur budget ──────────────────────────────────────────────── */

export class BudgetExceededError extends Error {
  constructor(stats) {
    super(`Budget journalier IA dépassé (${stats.totalUsd.toFixed(4)} $ / ${stats.budget} $)`);
    this.name  = 'BudgetExceededError';
    this.stats = stats;
  }
}
