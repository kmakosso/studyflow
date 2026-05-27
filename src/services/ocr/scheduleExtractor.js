/* ── ocr/scheduleExtractor.js — Extraction multi-pass via Claude Vision ──
 *
 * Stratégie 3 passes :
 *   Pass 1 : image enhanced → prompt structuré
 *   Pass 2 : image highContrast si confiance < 0.70
 *   Pass 3 : tiling (4 quadrants) si confiance < 0.50
 *
 * Compatible avec le service claudeService (même clé API + fetch direct).
 */

import { getApiKey } from '../claudeService';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VER  = '2023-06-01';
const VISION_MODEL   = 'claude-opus-4-7'; // vision + reasoning

/* ─── Prompts ────────────────────────────────────────────────────── */

const MAIN_PROMPT = `Tu analyses une image d'emploi du temps universitaire.
Extrais CHAQUE créneau horaire visible en JSON strict.

RÈGLES :
- Cellules fusionnées → un seul événement (durée réelle)
- Texte illisible → null (n'invente RIEN)
- Heures : format "HH:MM" 24h
- Jours : nom français ("Lundi") ou date ISO si visible
- Type : "CM", "TD", "TP", "EXAM" ou null

Retourne UNIQUEMENT ce JSON (aucun texte avant/après) :
{
  "events": [
    {
      "day": "Lundi",
      "startTime": "08:00",
      "endTime": "10:00",
      "subject": "Mathématiques",
      "type": "CM",
      "room": "A101",
      "professor": null,
      "rawText": "texte brut de la cellule"
    }
  ]
}`;

const FALLBACK_PROMPT = `Image difficile à lire. Extrais uniquement ce qui est CERTAIN.
Pour chaque cellule lisible, retourne ce JSON minimal :
{
  "events": [
    { "day": "...", "startTime": "HH:MM", "endTime": "HH:MM", "subject": "...", "rawText": "..." }
  ]
}
Ne devine pas. Mets null pour tout ce qui est ambigu.`;

/* ─── Appel Claude Vision ────────────────────────────────────────── */

async function callVision(base64, mimeType, prompt, onProgress) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('NO_API_KEY');

  const start = Date.now();
  onProgress?.(`Analyse en cours…`);

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'content-type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': ANTHROPIC_VER,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      VISION_MODEL,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('INVALID_API_KEY');
    throw new Error(err?.error?.message ?? `HTTP ${response.status}`);
  }

  const json = await response.json();
  const text = json.content?.filter(b => b.type === 'text').map(b => b.text).join('') ?? '';

  return {
    text,
    timeMs: Date.now() - start,
    inputTokens:  json.usage?.input_tokens  ?? 0,
    outputTokens: json.usage?.output_tokens ?? 0,
  };
}

/* ─── Parse JSON robuste ─────────────────────────────────────────── */

export function safeParseEvents(raw) {
  // Essai direct
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p?.events)) return p.events;
  } catch { /* continue */ }

  // Extraction du bloc JSON avec events
  const blockMatch = raw.match(/\{[\s\S]*?"events"\s*:\s*\[[\s\S]*?\]\s*\}/);
  if (blockMatch) {
    try {
      const p = JSON.parse(blockMatch[0]);
      if (Array.isArray(p.events)) return p.events;
    } catch { /* continue */ }
  }

  // Extraction du tableau seul
  const arrayMatch = raw.match(/\[[\s\S]*?\]/);
  if (arrayMatch) {
    try {
      const arr = JSON.parse(arrayMatch[0]);
      if (Array.isArray(arr)) return arr;
    } catch { /* continue */ }
  }

  return [];
}

/* ─── Score de confiance rapide ──────────────────────────────────── */

function quickConfidence(events) {
  if (events.length === 0) return 0;
  const requiredFields = ['day', 'startTime', 'endTime', 'subject'];
  const filled = events.reduce((acc, e) => {
    return acc + requiredFields.filter(k => e[k] != null && String(e[k]).trim() !== '').length;
  }, 0);
  return Math.min(1, filled / (events.length * requiredFields.length));
}

/* ─── Fusion des listes d'events ─────────────────────────────────── */

function mergeEvents(primary, secondary) {
  const merged = [...primary];
  for (const ev of secondary) {
    const dup = merged.find(
      e =>
        norm(e.day) === norm(ev.day) &&
        e.startTime === ev.startTime &&
        e.endTime === ev.endTime,
    );
    if (dup) {
      // Complète les champs null avec le secondaire
      for (const k of Object.keys(ev)) {
        if (dup[k] == null && ev[k] != null) dup[k] = ev[k];
      }
    } else {
      merged.push(ev);
    }
  }
  return merged;
}

const norm = s => (s ?? '').toLowerCase().trim();

/* ─── Pipeline multi-pass ────────────────────────────────────────── */

/**
 * Extrait les events d'un emploi du temps en jusqu'à 3 passes.
 *
 * @param preprocessed  Objet retourné par imagePreprocessor.preprocessImage()
 * @param onProgress    Callback(message) pour afficher l'avancement dans l'UI
 * @returns Array de passes : [{ pass, events, confidence, timeMs, variant }]
 */
export async function extractSchedule(preprocessed, onProgress) {
  const passes = [];

  // ── PASS 1 : image enhanced ─────────────────────────────────────
  onProgress?.('Passe 1/3 : analyse de l\'image…');
  const r1 = await callVision(
    preprocessed.enhanced,
    preprocessed.mimeType,
    MAIN_PROMPT,
    onProgress,
  );
  const events1    = safeParseEvents(r1.text);
  const confidence1 = quickConfidence(events1);

  passes.push({
    pass:       1,
    variant:    'enhanced',
    events:     events1,
    confidence: confidence1,
    timeMs:     r1.timeMs,
    tokens:     { input: r1.inputTokens, output: r1.outputTokens },
  });

  if (confidence1 >= 0.70) {
    onProgress?.(`Passe 1 réussie (confiance ${(confidence1 * 100).toFixed(0)} %)`);
    return passes;
  }

  // ── PASS 2 : high contrast ───────────────────────────────────────
  onProgress?.(`Passe 2/3 : image contrastée (confiance ${(confidence1 * 100).toFixed(0)} % insuffisante)…`);
  const r2 = await callVision(
    preprocessed.highContrast,
    preprocessed.mimeType,
    MAIN_PROMPT,
    onProgress,
  );
  const events2    = mergeEvents(events1, safeParseEvents(r2.text));
  const confidence2 = quickConfidence(events2);

  passes.push({
    pass:       2,
    variant:    'highContrast',
    events:     events2,
    confidence: confidence2,
    timeMs:     r2.timeMs,
    tokens:     { input: r2.inputTokens, output: r2.outputTokens },
  });

  if (confidence2 >= 0.50) {
    onProgress?.(`Passe 2 réussie (confiance ${(confidence2 * 100).toFixed(0)} %)`);
    return passes;
  }

  // ── PASS 3 : tiling (4 quadrants) ───────────────────────────────
  onProgress?.(`Passe 3/3 : découpage en zones (confiance ${(confidence2 * 100).toFixed(0)} % insuffisante)…`);

  const tileResults = [];
  for (let i = 0; i < preprocessed.tiles.length; i++) {
    const tile = preprocessed.tiles[i];
    onProgress?.(`  Analyse zone ${i + 1}/${preprocessed.tiles.length}…`);
    const rt = await callVision(tile.base64, tile.mimeType, FALLBACK_PROMPT, onProgress);
    tileResults.push(...safeParseEvents(rt.text));
  }

  const events3    = mergeEvents(events2, tileResults);
  const confidence3 = quickConfidence(events3);

  passes.push({
    pass:       3,
    variant:    'tiling',
    events:     events3,
    confidence: confidence3,
    timeMs:     0,
    tokens:     { input: 0, output: 0 },
  });

  onProgress?.(`Passe 3 terminée (confiance finale ${(confidence3 * 100).toFixed(0)} %)`);
  return passes;
}
