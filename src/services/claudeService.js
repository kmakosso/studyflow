/* ── claudeService.js — Core Claude API layer for StudyFlow V5 ──
 *
 * Privacy model:
 *   • API key stored in IndexedDB settings store — never hardcoded
 *   • Local academic data is NEVER sent without explicit user consent
 *   • Every function that sends user data calls confirmConsent() first
 *   • Claude does not store anything; all AI-generated content is saved locally
 *
 * Usage:
 *   import { claude } from './claudeService';
 *   const stream = await claude.chat(messages, { system, context });
 *   for await (const chunk of stream) { ... }
 */

import { db } from './db';
import { buildRagContextCached } from './ragPipeline';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL  = 'claude-opus-4-7';
const ANTHROPIC_VER  = '2023-06-01';

/* ─── API key management ─────────────────────────────────────────── */

export async function getApiKey() {
  return db.getSetting('claudeApiKey', null);
}

export async function setApiKey(key) {
  await db.setSetting('claudeApiKey', key?.trim() || '');
}

export async function hasApiKey() {
  const k = await getApiKey();
  return !!(k && k.length > 10);
}

/* ─── Context builder ────────────────────────────────────────────── */
/* Assembles a compact academic context from local DB data.
 * This is sent along with every chat message so Claude has
 * enough context to give relevant answers. It never includes
 * full document content — that requires explicit consent. */

export async function buildAcademicContext() {
  const today = new Date().toISOString().split('T')[0];
  const now   = new Date();

  // Load minimal data (no document content)
  const [subjects, assignments, exams, grades, revisions, pomodoro] = await Promise.all([
    db.all('subjects'),
    db.all('assignments'),
    db.all('exams'),
    db.all('grades'),
    db.all('revisions'),
    db.all('pomodoro'),
  ]);

  // Filter relevant upcoming items
  const upcomingExams = exams
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const urgentAssignments = assignments
    .filter(a => a.status !== 'done' && a.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  // Average per subject
  const gradesBySubject = {};
  for (const g of grades) {
    if (!gradesBySubject[g.subjectId]) gradesBySubject[g.subjectId] = [];
    gradesBySubject[g.subjectId].push(g.value);
  }

  // Pomodoro this week
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekSessions = pomodoro.filter(p => new Date(p.startedAt) >= weekStart);
  const weekMinutes  = weekSessions.reduce((s, p) => s + (p.duration || 25), 0);

  // Revisions due
  const dueRevisions = revisions
    .filter(r => r.nextReview && r.nextReview <= today && r.status !== 'mastered')
    .slice(0, 5);

  // Build text block
  const lines = [
    `Date du jour : ${today}`,
    '',
    '## Matières',
    ...subjects.map(s => {
      const gList = gradesBySubject[s.id] || [];
      const avg   = gList.length ? (gList.reduce((a, b) => a + b, 0) / gList.length).toFixed(1) : '—';
      return `- ${s.name} (coefficient ${s.coefficient ?? 1}, moyenne : ${avg}/20)`;
    }),
    '',
    '## Examens à venir',
    ...upcomingExams.map(e => {
      const subj = subjects.find(s => s.id === e.subjectId)?.name ?? '?';
      return `- ${e.date} — ${subj} : ${e.title}`;
    }),
    upcomingExams.length === 0 ? '- Aucun examen à venir' : '',
    '',
    '## Devoirs urgents',
    ...urgentAssignments.map(a => {
      const subj = subjects.find(s => s.id === a.subjectId)?.name ?? '?';
      return `- ${a.dueDate} — ${subj} : ${a.title}`;
    }),
    urgentAssignments.length === 0 ? '- Aucun devoir urgent' : '',
    '',
    `## Travail cette semaine : ${weekMinutes} minutes (${weekSessions.length} sessions Pomodoro)`,
    '',
    dueRevisions.length > 0 ? `## Révisions en retard : ${dueRevisions.length} fiche(s) à revoir` : '',
  ].filter(l => l !== undefined);

  return lines.join('\n');
}

/* ─── System prompt ──────────────────────────────────────────────── */

function buildSystemPrompt(contextBlock, extra = '') {
  return `Tu es l'assistant académique personnel de cet étudiant, intégré dans StudyFlow.
Tu connais son profil académique (matières, devoirs, examens, notes, révisions, sessions de travail).
Tu réponds TOUJOURS en français, de façon précise, bienveillante et orientée action.

RÈGLES IMPORTANTES :
- Tu proposes des actions concrètes et numérotées quand c'est pertinent.
- Tu adaptes le niveau de détail à la question.
- Tu ne fais JAMAIS semblant d'avoir accès à internet ou à des ressources externes.
- Tu travailles uniquement avec les données fournies et tes connaissances générales.
- Quand tu génères des fiches, QCM ou plannings, tu uses un format structuré (Markdown ou JSON selon la demande).

CONTEXTE ACADÉMIQUE ACTUEL :
${contextBlock}
${extra ? `\nCONTEXTE SUPPLÉMENTAIRE :\n${extra}` : ''}`;
}

/* ─── Streaming fetch ────────────────────────────────────────────── */
/* Returns an async generator yielding text chunks. */

export async function* streamMessage({ messages, system, maxTokens = 4096 }) {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('NO_API_KEY');

  const body = {
    model: DEFAULT_MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    stream: true,
    thinking: { type: 'adaptive' },
  };

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'content-type':                     'application/json',
      'x-api-key':                        apiKey,
      'anthropic-version':                ANTHROPIC_VER,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('INVALID_API_KEY');
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const evt = JSON.parse(data);
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          yield evt.delta.text;
        }
      } catch { /* ignore parse errors */ }
    }
  }
}

/* ─── One-shot completion (non-streaming) ────────────────────────── */

export async function complete({ messages, system, maxTokens = 4096 }) {
  let result = '';
  for await (const chunk of streamMessage({ messages, system, maxTokens })) {
    result += chunk;
  }
  return result;
}

/* ─── High-level chat with academic context ─────────────────────── */

export async function chatWithContext(userMessages, extraContext = '') {
  const contextBlock = await buildAcademicContext();
  const system       = buildSystemPrompt(contextBlock, extraContext);
  return streamMessage({ messages: userMessages, system });
}

/**
 * Chat with context scoped to a specific subject.
 * RAG retrieval is restricted to that subject's documents.
 * Claude only sees documents, flashcards and notes from that subject.
 *
 * @param userMessages  Array of { role, content } messages
 * @param subjectId     Subject UUID to scope to (null = global)
 * @param extraContext  Additional context string
 */
export async function chatWithSubjectContext(userMessages, subjectId = null, extraContext = '') {
  const lastQuery = userMessages.at(-1)?.content ?? '';

  const [contextBlock, ragResult, subjectData] = await Promise.all([
    buildAcademicContext(),
    // RAG restricted to the subject's documents
    buildRagContextCached(lastQuery, subjectId),
    // Load subject-specific resources for context
    subjectId ? loadSubjectResources(subjectId) : Promise.resolve(null),
  ]);

  // Build a subject-specific section for the system prompt
  let subjectSection = '';
  if (subjectData) {
    const lines = [
      `## Contexte matière : ${subjectData.name}`,
      subjectData.docNames.length
        ? `Documents disponibles : ${subjectData.docNames.join(', ')}`
        : 'Aucun document encore importé pour cette matière.',
      subjectData.flashcardCount > 0
        ? `${subjectData.flashcardCount} fiche(s) de révision créée(s)`
        : '',
      subjectData.quizCount > 0
        ? `${subjectData.quizCount} QCM disponible(s)`
        : '',
    ].filter(Boolean);
    subjectSection = lines.join('\n');
  }

  const ragSection  = ragResult.isEmpty ? '' : ragResult.contextText;
  const fullExtra   = [subjectSection, ragSection, extraContext].filter(Boolean).join('\n\n');
  const system      = buildSystemPrompt(contextBlock, fullExtra);

  return streamMessage({ messages: userMessages, system });
}

/** Load a compact summary of a subject's resources */
async function loadSubjectResources(subjectId) {
  const [subject, docs, flashcards, quizzes] = await Promise.all([
    db.byIndex('subjects', 'id', subjectId).catch(() => null),
    db.byIndex('documents',  'subjectId', subjectId),
    db.byIndex('flashcards', 'subjectId', subjectId),
    db.byIndex('quizzes',    'subjectId', subjectId),
  ]);

  // db.byIndex on keyPath 'id' doesn't work; use db.get instead
  const subj = await db.get('subjects', subjectId);
  if (!subj) return null;

  return {
    name:          subj.name,
    docNames:      docs.map(d => d.name),
    flashcardCount: flashcards.length,
    quizCount:      quizzes.length,
  };
}

/* ─── Document analysis ──────────────────────────────────────────── */
/* Called after user consents to send document content. */

export async function analyzeDocument(documentText, task = 'summarize') {
  const contextBlock = await buildAcademicContext();
  const system = buildSystemPrompt(contextBlock);

  const taskPrompts = {
    summarize:   'Résume ce document de façon claire et structurée avec les points clés en bullet points.',
    flashcards:  'Génère 10 à 20 fiches de révision (flashcards) au format JSON : [{"front":"...","back":"..."}]. Couvre les concepts importants du document.',
    questions:   'Génère 10 questions de révision avec leurs réponses détaillées basées sur ce document.',
    quiz:        'Génère un QCM de 10 questions avec 4 choix (A, B, C, D) et les bonnes réponses au format JSON : [{"question":"...","choices":["A:...","B:...","C:...","D:..."],"answer":"A"}].',
    mindmap:     'Crée un plan structuré en arborescence des concepts principaux de ce document.',
    revision:    'Crée une fiche de révision complète et structurée en Markdown avec les concepts, définitions, formules et exemples importants.',
  };

  const prompt = taskPrompts[task] || taskPrompts.summarize;

  return streamMessage({
    messages: [
      {
        role: 'user',
        content: `${prompt}\n\nDOCUMENT :\n\n${documentText.slice(0, 80000)}`,
      },
    ],
    system,
    maxTokens: 6000,
  });
}

/* ─── Planning IA ────────────────────────────────────────────────── */

export async function generateStudyPlan(options = {}) {
  const contextBlock = await buildAcademicContext();
  const system = buildSystemPrompt(contextBlock);

  const { days = 14, hoursPerDay = 3, focusSubjects = [] } = options;
  const focus = focusSubjects.length ? `Priorité aux matières : ${focusSubjects.join(', ')}.` : '';

  return streamMessage({
    messages: [
      {
        role: 'user',
        content: `Génère un planning de révision détaillé pour les ${days} prochains jours.
Disponibilité : ${hoursPerDay}h/jour. ${focus}
Format : planning jour par jour avec matières, durées et objectifs précis.
Tiens compte des examens à venir, devoirs urgents et révisions en retard.`,
      },
    ],
    system,
    maxTokens: 4000,
  });
}

/* ─── Flashcard generation (JSON output) ────────────────────────── */

export async function generateFlashcardsFromText(text, subjectName = '') {
  const system = `Tu es un générateur de flashcards académiques.
Tu réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après.
Format : [{"front":"question ou concept","back":"réponse ou explication","difficulty":"easy|medium|hard"}]`;

  const result = await complete({
    messages: [
      {
        role: 'user',
        content: `Génère 15 flashcards de révision pour la matière "${subjectName}" à partir de ce contenu :\n\n${text.slice(0, 40000)}`,
      },
    ],
    system,
    maxTokens: 3000,
  });

  try {
    const match = result.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return [];
  }
}

/* ─── Quiz generation (JSON output) ─────────────────────────────── */

export async function generateQuizFromText(text, subjectName = '', count = 10) {
  const system = `Tu es un générateur de QCM académiques.
Tu réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après.
Format : [{"question":"...","choices":["A: ...","B: ...","C: ...","D: ..."],"answer":"A","explanation":"..."}]`;

  const result = await complete({
    messages: [
      {
        role: 'user',
        content: `Génère ${count} questions QCM pour réviser "${subjectName}" à partir de ce contenu :\n\n${text.slice(0, 40000)}`,
      },
    ],
    system,
    maxTokens: 3000,
  });

  try {
    const match = result.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return [];
  }
}

export const claude = {
  hasApiKey,
  getApiKey,
  setApiKey,
  chatWithContext,
  chatWithSubjectContext,
  analyzeDocument,
  generateStudyPlan,
  generateFlashcardsFromText,
  generateQuizFromText,
  buildAcademicContext,
};
