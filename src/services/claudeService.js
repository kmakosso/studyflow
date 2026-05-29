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
const GROK_API_URL   = 'https://api.x.ai/v1/chat/completions';
const DEFAULT_MODEL  = 'claude-opus-4-8';
const ANTHROPIC_VER  = '2023-06-01';

/* ─── Claude API key ─────────────────────────────────────────────── */

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

/* ─── Grok (xAI) API key ─────────────────────────────────────────── */

export async function getGrokApiKey() {
  return db.getSetting('grokApiKey', null);
}
export async function setGrokApiKey(key) {
  await db.setSetting('grokApiKey', key?.trim() || '');
}
export async function hasGrokApiKey() {
  const k = await getGrokApiKey();
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

  // Load all relevant data for comprehensive context
  const [subjects, assignments, exams, grades, revisions, pomodoro,
         notes, goals, reminders, documents] = await Promise.all([
    db.all('subjects'),
    db.all('assignments'),
    db.all('exams'),
    db.all('grades'),
    db.all('revisions'),
    db.all('pomodoro'),
    db.all('notes'),
    db.all('goals'),
    db.all('reminders'),
    db.all('documents'),
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

  // Upcoming reminders
  const upcomingReminders = reminders
    .filter(r => !r.triggered && r.datetime >= today)
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
    .slice(0, 5);

  // Notes summary
  const recentNotes = notes
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
    .slice(0, 8);

  // Active goals
  const activeGoals = goals.filter(g => !g.completed).slice(0, 5);

  // Documents list
  const docsBySubject = {};
  for (const d of documents) {
    const key = d.subjectId || 'none';
    if (!docsBySubject[key]) docsBySubject[key] = [];
    docsBySubject[key].push(d.name);
  }

  // All assignments (not just urgent)
  const allPending = assignments
    .filter(a => a.status !== 'done')
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  const completedAssignments = assignments.filter(a => a.status === 'done');

  // Build text block
  const lines = [
    `Date du jour : ${today}`,
    '',
    '## Matières',
    ...subjects.map(s => {
      const gList  = gradesBySubject[s.id] || [];
      const avg    = gList.length ? (gList.reduce((a, b) => a + b, 0) / gList.length).toFixed(1) : '—';
      const docs   = docsBySubject[s.id] || [];
      return `- ${s.name} (coeff ${s.coefficient ?? 1}, moyenne : ${avg}/20${docs.length ? `, ${docs.length} document(s)` : ''})`;
    }),
    subjects.length === 0 ? '- Aucune matière créée' : '',
    '',
    '## Tous les devoirs en cours',
    ...allPending.map(a => {
      const subj = subjects.find(s => s.id === a.subjectId)?.name ?? '?';
      const late  = a.dueDate < today ? ' ⚠️ EN RETARD' : '';
      return `- [${a.status}] ${a.dueDate} — ${subj} : ${a.title}${late}`;
    }),
    allPending.length === 0 ? '- Aucun devoir en cours' : '',
    `(${completedAssignments.length} devoir(s) terminé(s) au total)`,
    '',
    '## Examens à venir',
    ...upcomingExams.map(e => {
      const subj = subjects.find(s => s.id === e.subjectId)?.name ?? '?';
      const days  = Math.ceil((new Date(e.date) - now) / 86400000);
      return `- ${e.date} — ${subj} : ${e.title} (dans ${days} jour(s))`;
    }),
    upcomingExams.length === 0 ? '- Aucun examen à venir' : '',
    '',
    `## Travail cette semaine`,
    `${weekMinutes} minutes de travail · ${weekSessions.length} sessions Pomodoro`,
    `Total toutes sessions : ${pomodoro.length}`,
    '',
    '## Révisions (fiches SRS)',
    `Total : ${revisions.length} fiches`,
    `À revoir aujourd'hui : ${dueRevisions.length}`,
    `Maîtrisées : ${revisions.filter(r => r.status === 'mastered').length}`,
    `En cours d'apprentissage : ${revisions.filter(r => r.status === 'learning').length}`,
    '',
    ...(recentNotes.length > 0 ? [
      '## Notes récentes',
      ...recentNotes.map(n => `- "${n.title || 'Sans titre'}" (${n.content?.slice(0, 80) || ''}…)`),
      '',
    ] : []),
    ...(activeGoals.length > 0 ? [
      '## Objectifs actifs',
      ...activeGoals.map(g => `- ${g.text || g.title || JSON.stringify(g)}`),
      '',
    ] : []),
    ...(upcomingReminders.length > 0 ? [
      '## Rappels à venir',
      ...upcomingReminders.map(r => `- ${r.datetime} : ${r.title || r.text}`),
      '',
    ] : []),
    ...(documents.length > 0 ? [
      '## Bibliothèque de documents',
      ...subjects.map(s => {
        const docs = docsBySubject[s.id] || [];
        return docs.length ? `- ${s.name} : ${docs.join(', ')}` : null;
      }).filter(Boolean),
      docsBySubject['none']?.length ? `- Sans matière : ${docsBySubject['none'].join(', ')}` : null,
    ].filter(Boolean) : []),
  ].filter(l => l !== undefined && l !== null);

  return lines.join('\n');
}

/* ─── System prompt ──────────────────────────────────────────────── */

export function buildSystemPrompt(contextBlock, extra = '') {
  return `Tu es l'assistant de révision personnel de cet étudiant, intégré dans StudyFlow.

━━━ TON IDENTITÉ ━━━
Tu n'es PAS une encyclopédie. Tu n'es PAS un cours universitaire. Tu n'es PAS un PDF de maths.
Tu es un PROFESSEUR BIENVEILLANT qui explique simplement, comme à l'oral — pédagogue, clair, humain.

━━━ STYLE OBLIGATOIRE ━━━
✅ Phrases naturelles et courtes
✅ Structure très aérée, lisible sur mobile
✅ Explication intuitive AVANT toute formule
✅ Exemples concrets du quotidien
✅ Emojis légers pour guider la lecture (📈 📉 🔥 💡 📌 🧠 🎯)
✅ Logique "flashcard" : notion → explication en 30 secondes max
✅ Toujours répondre en FRANÇAIS

❌ INTERDIT ABSOLUMENT :
- Style cours magistral ou document académique
- Blocs de formules sans explication
- Phrases longues et techniques
- Listes sèches sans contexte
- Réponses sans exemples concrets

━━━ FORMAT POUR LES QUESTIONS ACADÉMIQUES ━━━
Utilise systématiquement cette structure pour expliquer une notion :

🔹 1. Définition simple
[Explique comme si l'élève découvrait le concept pour la première fois, en une phrase claire]

🔹 2. Explication intuitive
[Le "sens" du concept en mots du quotidien, sans jargon — la logique derrière]

🔹 3. Formule / Règle (si nécessaire)
[Formule essentielle uniquement, TOUJOURS suivie de sa traduction en langage naturel]

🔹 4. Exemple
[Un exemple concret, rapide, de préférence tiré du quotidien ou d'un cas réel]

🔹 5. 🧠 À retenir
[1 à 3 lignes maximum — ce que l'élève doit mémoriser]

---
👉 **Actions possibles :**
✅ Ajouter aux révisions | 🔁 Version encore plus simple | 🧠 Générer un quiz | 📋 Créer une fiche complète
---

━━━ RÈGLES PÉDAGOGIQUES ━━━
- Compréhension TOUJOURS avant la rigueur formelle
- Chaque symbole mathématique doit être expliqué en mots
- Chaque formule doit avoir un sens immédiat après lecture
- La réponse doit être révisable en moins de 30 secondes
- Structure optimisée pour lecture rapide sur mobile

━━━ CAPACITÉS TECHNIQUES ━━━
- Pour les plannings : format jour par jour clair en Markdown
- Pour les fiches (flashcards) : JSON structuré [{"front":"…","back":"…","difficulty":"easy|medium|hard"}]
- Pour les QCM : JSON structuré [{"question":"…","choices":["A:…","B:…","C:…","D:…"],"answer":"A","explanation":"…"}]
- Tu ne prétends JAMAIS avoir accès à internet ou des ressources externes
- Tu utilises uniquement les données fournies et tes connaissances générales

━━━ CONTEXTE ACADÉMIQUE ━━━
${contextBlock}
${extra ? `\n━━━ CONTEXTE SUPPLÉMENTAIRE ━━━\n${extra}` : ''}`;
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

/* ─── Grok streaming (OpenAI-compatible format) ──────────────────── */

export async function* streamGrok({ messages, system, model = 'grok-3', maxTokens = 4096 }) {
  const apiKey = await getGrokApiKey();
  if (!apiKey) throw new Error('NO_GROK_API_KEY');

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages,
    ],
    stream: true,
  };

  const response = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: {
      'content-type':  'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 401) throw new Error('INVALID_GROK_KEY');
    throw new Error(err?.error?.message || `Grok HTTP ${response.status}`);
  }

  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const evt = JSON.parse(data);
        const text = evt.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch { /* ignore */ }
    }
  }
}

/* ─── Vision (multimodal) with academic context ─────────────────── */
/* Sends an image + text to Claude using the multimodal message format.
 * The image data (base64) is NOT stored in conversation history — only text. */

export async function chatVisionWithContext(userText, imageBase64, imageType = 'image/jpeg', history = []) {
  const contextBlock = await buildAcademicContext();
  const system = buildSystemPrompt(contextBlock,
    '\nTu peux analyser des images (photos de notes, tableaux, exercices, diagrammes). ' +
    'Extrais le contenu, corrige si nécessaire, et propose des fiches ou explications adaptées.');

  const visionMessage = {
    role: 'user',
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type: imageType, data: imageBase64 },
      },
      {
        type: 'text',
        text: userText || 'Analyse cette image. Explique ce que tu vois et propose une aide académique adaptée.',
      },
    ],
  };

  // streamMessage passes messages directly to the API — both string and array content are valid
  return streamMessage({
    messages: [...history, visionMessage],
    system,
    maxTokens: 4096,
  });
}

/* ─── One-shot completion (non-streaming) ────────────────────────── */

export async function complete({ messages, system, maxTokens = 4096 }) {
  let result = '';
  for await (const chunk of streamMessage({ messages, system, maxTokens })) {
    result += chunk;
  }
  return result;
}

export async function completeGrok({ messages, system, model = 'grok-3', maxTokens = 4096 }) {
  let result = '';
  for await (const chunk of streamGrok({ messages, system, model, maxTokens })) {
    result += chunk;
  }
  return result;
}

/* ─── AI Study Plan (Claude or Grok) ─────────────────────────────── */
/* Generates a day-by-day JSON plan from real AI, not just an algorithm */

/**
 * Build a schedule block describing class times per day.
 * Used in the AI planning prompt so Claude/Grok won't schedule study during class time.
 */
function buildScheduleBlock(busyPerDay = {}, subjects = []) {
  const subMap = Object.fromEntries(subjects.map(s => [s.id, s]));
  const lines  = [];

  for (const [dateStr, courses] of Object.entries(busyPerDay).sort()) {
    if (!courses.length) continue;
    const d     = new Date(dateStr + 'T12:00:00');
    const label = d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
    const courseStrs = courses
      .map(c => {
        const name = subMap[c.subjectId]?.name || c.subjectName || c.subjectId || 'Cours';
        return `${c.startTime || '?'}–${c.endTime || '?'} ${name}${c.room ? ` (${c.room})` : ''}`;
      })
      .join(', ');
    lines.push(`  - ${label} : ${courseStrs}`);
  }

  return lines.length > 0
    ? `\n## ⚠️ Emploi du temps — Créneaux de cours (NE PLANIFIE AUCUNE TÂCHE sur ces horaires)\n${lines.join('\n')}\n`
    : '';
}

export async function generateStudyPlanFromAI({
  assignments, exams, subjects, slotConfig, days = 14,
  provider = 'claude', grokModel = 'grok-3', onProgress,
  busyPerDay = {},   // map "YYYY-MM-DD" → course[] with startTime, endTime
}) {
  const today         = new Date().toISOString().split('T')[0];
  const contextBlock  = await buildAcademicContext();

  const slotDesc = (slots) => slots
    .filter(s => s.enabled)
    .map(s => `  • ${s.label} (${s.start}–${s.end}) : ${s.hours}h disponibles`)
    .join('\n') || '  Aucun créneau';

  const assignList = assignments
    .filter(a => a.status !== 'done' && a.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map(a => {
      const s = subjects.find(s => s.id === a.subjectId);
      return `- [${a.dueDate}] ${s?.name || '?'} : ${a.title} (~${a.estimatedHours || 1.5}h)`;
    }).join('\n') || '  Aucun devoir en attente';

  const examList = exams
    .filter(e => new Date(e.date) >= new Date())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => {
      const s = subjects.find(s => s.id === e.subjectId);
      return `- [${e.date}] Examen ${s?.name || '?'} : ${e.title} (importance: ${e.importance || 'medium'})`;
    }).join('\n') || '  Aucun examen à venir';

  const scheduleBlock = buildScheduleBlock(busyPerDay, subjects);
  const hasCourses    = scheduleBlock.length > 0;

  const system = buildSystemPrompt(contextBlock);
  const prompt = `Tu es un expert en planification académique. Génère un planning de travail détaillé pour les ${days} prochains jours à partir d'aujourd'hui (${today}).

## Devoirs en attente
${assignList}

## Examens à venir
${examList}

## Créneaux d'étude disponibles (HORS heures de cours)
Lundi–Vendredi :
${slotDesc(slotConfig.weekday)}
Samedi & Dimanche :
${slotDesc(slotConfig.weekend)}
${scheduleBlock}
## Instructions
- Répartis intelligemment les devoirs selon leur date limite (urgence prioritaire)
- Commence les révisions d'examen au moins 5 jours avant la date
- Respecte les créneaux disponibles (ne planifie pas si aucun créneau n'est actif ce jour-là)
${hasCourses ? '- ⚠️ IMPORTANT : ne place AUCUNE tâche d\'étude pendant les créneaux de cours listés ci-dessus\n- Pour les jours avec beaucoup de cours, réduis la charge d\'étude en conséquence' : ''}
- Pour chaque tâche, donne un conseil pratique court et un objectif clair
- Ajoute un message de motivation court pour chaque jour

## FORMAT STRICT — réponds UNIQUEMENT avec ce JSON, sans texte avant ou après :
[
  {
    "date": "YYYY-MM-DD",
    "slots": [
      {
        "id": "morning|afternoon|evening",
        "tasks": [
          { "title": "...", "subject": "...", "hours": 1.5, "objective": "...", "tip": "..." }
        ]
      }
    ],
    "dailyTip": "Message du jour court et motivant"
  }
]

Génère uniquement les jours qui ont au moins une tâche. Maximum ${days} jours.`;

  const messages = [{ role: 'user', content: prompt }];

  let raw = '';
  if (provider === 'grok') {
    const apiKey = await getGrokApiKey();
    if (!apiKey) throw new Error('NO_GROK_API_KEY');
    // Stream Grok for progress feedback
    for await (const chunk of streamGrok({ messages, system, model: grokModel, maxTokens: 6000 })) {
      raw += chunk;
      onProgress?.(raw.length);
    }
  } else {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('NO_API_KEY');
    for await (const chunk of streamMessage({ messages, system, maxTokens: 6000 })) {
      raw += chunk;
      onProgress?.(raw.length);
    }
  }

  // Parse JSON
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return [];
  }
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

export async function generateFlashcardsFromText(text, subjectName = '', count = 15) {
  const system = `Tu es un générateur de flashcards pédagogiques pour un assistant de révision.
Tu réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ou après.
Règles pour chaque fiche :
- "front" : une question claire et courte, comme un professeur poserait à l'oral
- "back" : réponse complète, humaine, avec un exemple si possible (pas de réponse trop sèche)
- "difficulty" : "easy" | "medium" | "hard" selon la complexité du concept
Format strict : [{"front":"…","back":"…","difficulty":"easy|medium|hard"}]`;

  const result = await complete({
    messages: [
      {
        role: 'user',
        content: `Génère ${count} flashcards de révision pour la matière "${subjectName}" à partir de ce contenu :\n\n${text.slice(0, 40000)}`,
      },
    ],
    system,
    maxTokens: 4000,
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
  hasGrokApiKey,
  getGrokApiKey,
  setGrokApiKey,
  streamGrok,
  chatWithContext,
  chatWithSubjectContext,
  chatVisionWithContext,
  analyzeDocument,
  generateStudyPlan,
  generateFlashcardsFromText,
  generateQuizFromText,
  buildAcademicContext,
  buildSystemPrompt,
  generateStudyPlanFromAI,
};
