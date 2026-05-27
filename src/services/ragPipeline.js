/* ── ragPipeline.js — RAG léger 100 % local (BM25 + IndexedDB) ──
 *
 * Pas d'embeddings, pas de serveur : recherche par fréquence de termes
 * sur les chunks stockés en IndexedDB. Suffisant pour 10-50 documents.
 *
 * Pipeline :
 *   1. Chunk le texte d'un document en morceaux de ~400 tokens
 *   2. Stocke les chunks dans IndexedDB (store `documentChunks`)
 *   3. Lors d'une question, score chaque chunk par BM25 et retourne les top-N
 *   4. Formate le contexte pour injection dans le prompt Claude
 */

import { db } from './db';

/* ─── Constantes ─────────────────────────────────────────────────── */

const CHUNK_TARGET_CHARS  = 1600;   // ~400 tokens (1 token ≈ 4 chars)
const CHUNK_OVERLAP_CHARS = 200;    // chevauchement pour ne pas couper les idées
const RAG_MAX_CHUNKS      = 5;      // max chunks injectés par requête
const BM25_K1             = 1.5;
const BM25_B              = 0.75;

/* ─── Chunking ───────────────────────────────────────────────────── */

/**
 * Découpe un texte en chunks chevauchants avec métadonnées.
 * Essaie de couper sur des frontières de paragraphes.
 */
export function chunkText(text, documentId, opts = {}) {
  const targetLen  = opts.targetChars  ?? CHUNK_TARGET_CHARS;
  const overlapLen = opts.overlapChars ?? CHUNK_OVERLAP_CHARS;

  if (!text || text.length < 50) return [];

  // Sépare d'abord en paragraphes
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0);
  const chunks = [];
  let current = '';
  let chunkIndex = 0;

  const flush = () => {
    if (current.trim().length < 30) return;
    chunks.push({
      id:          crypto.randomUUID(),
      documentId,
      chunkIndex:  chunkIndex++,
      content:     current.trim(),
      tokenEstimate: Math.ceil(current.length / 4),
      createdAt:   new Date().toISOString(),
    });
  };

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > targetLen) {
      flush();
      // Overlap : reprend les derniers caractères du chunk précédent
      const overlap = current.slice(-overlapLen);
      current = overlap + '\n\n' + para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  flush();

  return chunks;
}

/* ─── Indexation ─────────────────────────────────────────────────── */

/**
 * Chunk et indexe un document dans IndexedDB.
 * Supprime d'abord les anciens chunks du même document.
 */
export async function indexDocument(documentId, text) {
  if (!text || text.trim().length < 50) return 0;

  // Supprime les anciens chunks
  const existing = await db.byIndex('documentChunks', 'documentId', documentId);
  for (const c of existing) await db.del('documentChunks', c.id);

  // Crée les nouveaux chunks
  const chunks = chunkText(text, documentId);
  for (const chunk of chunks) {
    await db.put('documentChunks', chunk);
  }

  return chunks.length;
}

/* ─── Tokenisation simple ────────────────────────────────────────── */

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\sÀ-ɏ]/g, ' ')  // garde les accents français
    .split(/\s+/)
    .filter(t => t.length > 2);              // filtre les mots trop courts
}

function termFrequency(tokens) {
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  return freq;
}

/* ─── Scoring BM25 ───────────────────────────────────────────────── */

/**
 * Calcule le score BM25 d'un chunk par rapport à une requête.
 * @param queryTerms   Termes de la requête (après tokenisation)
 * @param chunkTokens  Tokens du chunk
 * @param idf          Map terme → score IDF
 * @param avgDocLen    Longueur moyenne des documents du corpus
 */
function bm25Score(queryTerms, chunkTokens, idf, avgDocLen) {
  const tf  = termFrequency(chunkTokens);
  const dl  = chunkTokens.length;
  let score = 0;

  for (const term of queryTerms) {
    const f   = tf.get(term) ?? 0;
    if (f === 0) continue;
    const idfScore = idf.get(term) ?? 0;
    score += idfScore * (f * (BM25_K1 + 1))
           / (f + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgDocLen)));
  }

  return score;
}

/* ─── Recherche RAG ──────────────────────────────────────────────── */

/**
 * Trouve les chunks les plus pertinents pour une requête.
 *
 * @param query      Question de l'utilisateur
 * @param subjectId  Filtre par matière (null = tous les documents)
 * @param maxChunks  Nombre max de chunks à retourner
 */
export async function retrieveChunks(query, subjectId = null, maxChunks = RAG_MAX_CHUNKS) {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  // Charge tous les chunks (filtré par matière si précisé)
  let allChunks = await db.all('documentChunks');

  if (subjectId) {
    // Charge les documents de la matière pour filtrer
    const docs = await db.byIndex('documents', 'subjectId', subjectId);
    const docIds = new Set(docs.map(d => d.id));
    allChunks = allChunks.filter(c => docIds.has(c.documentId));
  }

  if (allChunks.length === 0) return [];

  // Tokenise tous les chunks
  const tokenized = allChunks.map(c => tokenize(c.content));
  const avgDocLen  = tokenized.reduce((s, t) => s + t.length, 0) / tokenized.length;

  // Calcule IDF pour chaque terme de la requête
  const idf = new Map();
  for (const term of queryTerms) {
    const df   = tokenized.filter(t => t.includes(term)).length;
    const idfV = df > 0
      ? Math.log((allChunks.length - df + 0.5) / (df + 0.5) + 1)
      : 0;
    idf.set(term, idfV);
  }

  // Score chaque chunk
  const scored = allChunks
    .map((chunk, i) => ({
      chunk,
      score: bm25Score(queryTerms, tokenized[i], idf, avgDocLen),
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks);

  return scored.map(s => s.chunk);
}

/* ─── Construction du contexte pour Claude ──────────────────────── */

/**
 * Formate les chunks récupérés en un bloc de contexte pour le prompt.
 * Retourne aussi le texte tel quel pour mise en cache.
 */
export async function buildRagContext(query, subjectId = null) {
  const chunks = await retrieveChunks(query, subjectId);
  if (chunks.length === 0) {
    return { contextText: '', chunks: [], isEmpty: true };
  }

  // Charge les métadonnées des documents sources
  const docIds = [...new Set(chunks.map(c => c.documentId))];
  const docs   = await Promise.all(docIds.map(id => db.get('documents', id)));
  const docMap  = new Map(docs.filter(Boolean).map(d => [d.id, d]));

  const contextText = chunks.map((chunk, i) => {
    const doc = docMap.get(chunk.documentId);
    return `### [${i + 1}] ${doc?.name ?? 'Document'}\n\n${chunk.content}`;
  }).join('\n\n---\n\n');

  return {
    contextText: `## Sources documentaires\n\n${contextText}`,
    chunks,
    isEmpty: false,
    docTitles: chunks.map(c => docMap.get(c.documentId)?.name ?? 'Document'),
  };
}

/* ─── Cache de session (évite de recharger les mêmes chunks) ─────── */

// Simple Map en mémoire, vidée à chaque reload de page
const _sessionCache = new Map();

export async function buildRagContextCached(query, subjectId = null) {
  const key = `${subjectId ?? 'all'}::${query.trim().toLowerCase().slice(0, 80)}`;

  if (_sessionCache.has(key)) {
    return { ..._sessionCache.get(key), fromCache: true };
  }

  const result = await buildRagContext(query, subjectId);
  _sessionCache.set(key, result);

  // Limite la taille du cache session à 20 entrées
  if (_sessionCache.size > 20) {
    const firstKey = _sessionCache.keys().next().value;
    _sessionCache.delete(firstKey);
  }

  return { ...result, fromCache: false };
}

export function clearRagCache() {
  _sessionCache.clear();
}
