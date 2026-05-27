/**
 * StudyFlow V4 — Local AI Assistant Engine
 * 100% offline. No external calls. Rule-based NLP intent matching.
 * Optional hook point for WebLLM / Transformers.js (see processWithLLM stub).
 */
import { db }               from './db.js';
import { differenceInDays, format, startOfWeek, endOfWeek } from 'date-fns';
import { fr }               from 'date-fns/locale';

/* ── helpers ────────────────────────────────────────────────────────────── */
const normalize = str =>
  str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

async function loadData() {
  const [assignments, exams, subjects, courses, grades, pomodoro, revisions] = await Promise.all([
    db.all('assignments'),
    db.all('exams'),
    db.all('subjects'),
    db.all('courses'),
    db.all('grades'),
    db.all('pomodoro'),
    db.all('revisions'),
  ]);
  let profile = null;
  try { profile = await db.get('profile', 'main'); } catch (_) {}
  return { assignments, exams, subjects, courses, grades, pomodoro, revisions, profile };
}

// today's day index: Mon=0 … Sat=5
const todayDayIndex = () => (new Date().getDay() + 6) % 7;

function subjectOf(id, subjects) {
  return subjects.find(s => s.id === id);
}

/* ── Plan generator helper ───────────────────────────────────────────────── */
function buildStudyPlan(daysLeft, chaptersRaw) {
  const sections = [];
  const chapters = chaptersRaw
    ? chaptersRaw.split(/[,;]/).map(s => s.trim()).filter(Boolean)
    : null;

  if (chapters && chapters.length > 0) {
    const perDay = Math.max(1, Math.ceil(chapters.length / Math.max(1, daysLeft - 1)));
    let dayNum   = 1;
    for (let i = 0; i < chapters.length; i += perDay) {
      sections.push({
        title: `Jour ${dayNum}`,
        items: chapters.slice(i, i + perDay).map(c => `📖 ${c}`),
      });
      dayNum++;
    }
    if (daysLeft >= 2) {
      sections.push({ title: `Jour ${daysLeft}`, items: ['🔄 Révision générale', '📝 Exercices & annales'] });
    }
  } else {
    const phases = [
      ['📖 Relecture complète du cours', '🗒️ Création de fiches résumé'],
      ['💡 Mémorisation des points clés', '🧩 Exercices d\'application'],
      ['📝 Annales & exercices types'],
      ['🔄 Révision finale', '😴 Détente la veille — ne surcharge pas'],
    ];
    for (let i = 0; i < Math.min(daysLeft, 7); i++) {
      sections.push({ title: `Jour ${i + 1}`, items: phases[Math.min(i, phases.length - 1)] });
    }
  }
  return sections.slice(0, 7);
}

/* ══ INTENT HANDLERS ════════════════════════════════════════════════════════ */

async function handleToday(_, d) {
  const now   = new Date();
  const dayIdx = todayDayIndex();
  const todayCourses = d.courses.filter(c => c.day === dayIdx);
  const urgent = d.assignments.filter(a => {
    if (a.status === 'done') return false;
    try { const days = differenceInDays(new Date(a.dueDate), now); return days >= 0 && days <= 2; }
    catch (_) { return false; }
  });
  const examsWeek = d.exams.filter(e => {
    try { const days = differenceInDays(new Date(e.date), now); return days >= 0 && days <= 7; }
    catch (_) { return false; }
  });

  const sections = [];
  if (todayCourses.length > 0)
    sections.push({ title: '📚 Cours du jour', items: todayCourses.map(c => `${subjectOf(c.subjectId, d.subjects)?.name || '?'} — ${c.startTime}–${c.endTime}${c.room ? ` (${c.room})` : ''}`) });
  if (urgent.length > 0)
    sections.push({ title: '⚠️ Devoirs urgents', items: urgent.map(a => { const days = differenceInDays(new Date(a.dueDate), now); return `${a.title} — ${days === 0 ? "aujourd'hui" : `dans ${days}j`}`; }) });
  if (examsWeek.length > 0)
    sections.push({ title: '🎓 Examens cette semaine', items: examsWeek.map(e => { const sub = subjectOf(e.subjectId, d.subjects); const days = differenceInDays(new Date(e.date), now); return `${sub?.name || '?'} — ${days === 0 ? "aujourd'hui" : `dans ${days}j`}`; }) });

  if (sections.length === 0) {
    return {
      emoji: '✅', title: 'Journée libre !',
      body: "Aucun cours, aucun devoir urgent et aucun examen cette semaine. Profite pour avancer tes révisions.",
      actions: [{ label: 'Réviser', to: '/revision' }],
    };
  }

  return {
    emoji: '📋', title: `Ta journée — ${format(now, 'EEEE d MMMM', { locale: fr })}`,
    sections,
    actions: [{ label: 'Voir les devoirs', to: '/assignments' }, { label: 'Emploi du temps', to: '/schedule' }],
  };
}

async function handleUrgent(_, d) {
  const now = new Date();
  const urgent = d.assignments
    .filter(a => a.status !== 'done')
    .filter(a => { try { return differenceInDays(new Date(a.dueDate), now) <= 3; } catch (_) { return false; } })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  if (urgent.length === 0)
    return { emoji: '🎉', title: 'Aucun devoir urgent', body: "Tu n'as aucun devoir urgent en ce moment. Bravo !", actions: [{ label: 'Tous les devoirs', to: '/assignments' }] };

  return {
    emoji: '⚠️', title: `${urgent.length} devoir${urgent.length > 1 ? 's' : ''} urgent${urgent.length > 1 ? 's' : ''}`,
    sections: [{
      title: '📝 À traiter en priorité',
      items: urgent.map(a => {
        const sub  = subjectOf(a.subjectId, d.subjects);
        const days = differenceInDays(new Date(a.dueDate), now);
        const badge = days < 0 ? '🔴 EN RETARD' : days === 0 ? '🔴 Aujourd\'hui' : days === 1 ? '🟠 Demain' : `🟡 ${days}j`;
        return `${badge} — ${a.title}${sub ? ` (${sub.name})` : ''}`;
      }),
    }],
    actions: [{ label: 'Gérer les devoirs', to: '/assignments' }, { label: 'Générer un planning', to: '/planner' }],
  };
}

async function handleExams(_, d) {
  const now  = new Date();
  const next = d.exams
    .filter(e => { try { return new Date(e.date) >= now; } catch (_) { return false; } })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  if (next.length === 0)
    return { emoji: '📚', title: 'Aucun examen à venir', body: "Tu n'as aucun examen planifié pour le moment.", actions: [{ label: 'Ajouter un examen', to: '/exams' }] };

  return {
    emoji: '🎓', title: 'Prochains examens',
    sections: [{
      title: '📅 Calendrier',
      items: next.map(e => {
        const sub  = subjectOf(e.subjectId, d.subjects);
        const days = differenceInDays(new Date(e.date), now);
        const col  = days <= 3 ? '🔴' : days <= 7 ? '🟠' : '🟢';
        return `${col} ${sub?.name || '?'} — ${format(new Date(e.date), 'd MMMM', { locale: fr })} (${days === 0 ? "aujourd'hui" : `J-${days}`})`;
      }),
    }],
    actions: [{ label: 'Voir tous les examens', to: '/exams' }, { label: 'Réviser', to: '/revision' }],
  };
}

async function handleSchedule(_, d) {
  const dayIdx = todayDayIndex();
  const DAYS   = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const today  = d.courses.filter(c => c.day === dayIdx).sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (today.length === 0)
    return { emoji: '📅', title: `${DAYS[dayIdx]} — pas de cours`, body: "Tu n'as aucun cours dans ton emploi du temps aujourd'hui.", actions: [{ label: 'Voir l\'emploi du temps', to: '/schedule' }] };

  return {
    emoji: '📅', title: `Emploi du temps — ${DAYS[dayIdx]}`,
    sections: [{
      title: '🕐 Séances d\'aujourd\'hui',
      items: today.map(c => {
        const sub = subjectOf(c.subjectId, d.subjects);
        return `${c.startTime}–${c.endTime} : ${sub?.name || '?'}${c.room ? ` — ${c.room}` : ''}`;
      }),
    }],
    actions: [{ label: 'Emploi du temps complet', to: '/schedule' }],
  };
}

async function handleWorkload(_, d) {
  const now = new Date();
  const bySubject = {};
  d.subjects.forEach(s => { bySubject[s.id] = { subject: s, assignments: 0, exams: 0, pomodoroMin: 0, revisions: 0 }; });

  d.assignments.filter(a => a.status !== 'done').forEach(a => {
    if (bySubject[a.subjectId]) bySubject[a.subjectId].assignments++;
  });
  d.exams.filter(e => { try { return new Date(e.date) >= now; } catch (_) { return false; } }).forEach(e => {
    if (bySubject[e.subjectId]) bySubject[e.subjectId].exams++;
  });
  d.pomodoro.filter(s => s.completed && s.phase === 'work' && s.subjectId).forEach(s => {
    if (bySubject[s.subjectId]) bySubject[s.subjectId].pomodoroMin += (s.duration || 0) / 60;
  });
  d.revisions.forEach(r => { if (bySubject[r.subjectId]) bySubject[r.subjectId].revisions++; });

  const ranked = Object.values(bySubject)
    .map(s => ({ ...s, score: s.assignments * 2 + s.exams * 4 + s.revisions }))
    .filter(s => s.score > 0 || s.pomodoroMin > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (ranked.length === 0)
    return { emoji: '📊', title: 'Charge par matière', body: "Aucune donnée de charge de travail disponible pour le moment.", actions: [{ label: 'Ajouter des devoirs', to: '/assignments' }] };

  return {
    emoji: '📊', title: 'Charge de travail par matière',
    sections: [{
      title: '🏋️ Classement',
      items: ranked.map((s, i) => {
        const parts = [];
        if (s.assignments > 0) parts.push(`${s.assignments} devoir${s.assignments > 1 ? 's' : ''}`);
        if (s.exams > 0)       parts.push(`${s.exams} examen${s.exams > 1 ? 's' : ''}`);
        if (s.revisions > 0)   parts.push(`${s.revisions} cartes SRS`);
        return `${i + 1}. ${s.subject.name}${parts.length ? ' — ' + parts.join(', ') : ''}`;
      }),
    }],
    actions: [{ label: 'Planning auto', to: '/planner' }, { label: 'Mon profil', to: '/profile' }],
  };
}

async function handleCreatePlan(input, d) {
  const norm    = normalize(input);
  const now     = new Date();
  const subject = d.subjects.find(s => norm.includes(normalize(s.name)));
  const exam    = subject
    ? d.exams.find(e => e.subjectId === subject.id && new Date(e.date) >= now)
    : d.exams.filter(e => new Date(e.date) >= now).sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  if (!exam) {
    return {
      emoji: '📅', title: 'Pas d\'examen trouvé',
      body:  subject ? `Aucun examen à venir pour ${subject.name}.` : "Ajoute un examen pour générer un plan de révision.",
      actions: [{ label: 'Ajouter un examen', to: '/exams' }, { label: 'Planning auto', to: '/planner' }],
    };
  }

  const sub      = subjectOf(exam.subjectId, d.subjects);
  const daysLeft = differenceInDays(new Date(exam.date), now);

  if (daysLeft <= 0)
    return { emoji: '⏰', title: 'Examen passé', body: "Cet examen est déjà passé.", actions: [{ label: 'Voir les examens', to: '/exams' }] };

  const sections = buildStudyPlan(daysLeft, exam.chapters);

  return {
    emoji: '📅', title: `Plan de révision — ${sub?.name || 'Examen'}`,
    body:  `${daysLeft} jour${daysLeft > 1 ? 's' : ''} disponible${daysLeft > 1 ? 's' : ''} jusqu'au ${format(new Date(exam.date), 'd MMMM', { locale: fr })}`,
    sections,
    actions: [{ label: 'Planificateur IA', to: '/planner' }, { label: 'Réviser maintenant', to: '/revision' }],
  };
}

async function handleScore(_, d) {
  const p = d.profile;
  if (!p) return { emoji: '📊', title: 'Profil non calculé', body: "Lance des sessions Pomodoro et complète des devoirs pour générer ton score.", actions: [{ label: 'Mon profil', to: '/profile' }] };

  const items = [
    `⚡ Régularité : ${p.sessionsPerWeek ?? 0} sessions/semaine`,
    `🎯 Taux de complétion : ${Math.round((p.completionRate ?? 1) * 100)}%`,
    `⏱️ Concentration moy. : ${p.avgFocusDuration ?? 25} min`,
    ...(p.avgGrade != null ? [`📊 Note moyenne : ${p.avgGrade}/20`] : []),
    ...(p.delayTendency > 0.3 ? [`⚠️ Tendance au retard : ${Math.round(p.delayTendency * 100)}%`] : ['✅ Pas de retard habituel']),
    ...(p.weakSubjectIds?.length > 0
      ? [`📉 Matières faibles : ${p.weakSubjectIds.map(id => d.subjects.find(s => s.id === id)?.name || id).join(', ')}`]
      : []),
  ];

  return {
    emoji: '🏆', title: 'Ton profil étudiant',
    sections: [{ title: '📈 Indicateurs', items }],
    actions: [{ label: 'Voir le profil complet', to: '/profile' }, { label: 'Statistiques', to: '/analytics' }],
  };
}

async function handleWeek(_, d) {
  const now   = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 });
  const end   = endOfWeek(now,   { weekStartsOn: 1 });

  const weekExams = d.exams.filter(e => {
    try { const dt = new Date(e.date); return dt >= start && dt <= end; } catch (_) { return false; }
  });
  const weekPomodoro = d.pomodoro.filter(s => {
    try { const dt = new Date(s.date); return s.completed && s.phase === 'work' && dt >= start && dt <= end; } catch (_) { return false; }
  });
  const weekMinutes = weekPomodoro.reduce((acc, s) => acc + (s.duration || 0), 0) / 60;
  const dueThisWeek = d.assignments.filter(a => {
    try { const dt = new Date(a.dueDate); return a.status !== 'done' && dt >= now && dt <= end; } catch (_) { return false; }
  });
  const completedThisWeek = d.assignments.filter(a => {
    try { const dt = new Date(a.completedAt || 0); return a.status === 'done' && dt >= start && dt <= end; } catch (_) { return false; }
  });

  return {
    emoji: '📆', title: `Semaine du ${format(start, 'd')} au ${format(end, 'd MMMM', { locale: fr })}`,
    sections: [{
      title: '📊 Bilan',
      items: [
        `⏱️ Temps de travail : ${Math.round(weekMinutes)}h`,
        `🍅 Sessions Pomodoro : ${weekPomodoro.length}`,
        `✅ Devoirs terminés cette semaine : ${completedThisWeek.length}`,
        `📝 Devoirs à rendre encore : ${dueThisWeek.length}`,
        ...(weekExams.length > 0 ? [`🎓 Examens cette semaine : ${weekExams.length}`] : []),
      ],
    }],
    actions: [{ label: 'Statistiques détaillées', to: '/analytics' }],
  };
}

async function handleWeak(_, d) {
  const p = d.profile;
  if (!p?.weakSubjectIds?.length) {
    return { emoji: '💪', title: 'Pas de matière faible détectée', body: "Tes notes ne montrent pas de matière particulièrement faible — continue comme ça !", actions: [{ label: 'Voir les notes', to: '/grades' }] };
  }

  const weak = p.weakSubjectIds.map(id => {
    const sub    = d.subjects.find(s => s.id === id);
    const grades = d.grades.filter(g => g.subjectId === id);
    const avg    = grades.length > 0
      ? Math.round(grades.reduce((acc, g) => acc + (g.grade / g.maxGrade) * 20, 0) / grades.length * 10) / 10
      : null;
    const dueCount  = d.assignments.filter(a => a.subjectId === id && a.status !== 'done').length;
    const cardCount = d.revisions.filter(r => r.subjectId === id && r.status !== 'mastered').length;
    return { sub, avg, dueCount, cardCount };
  });

  return {
    emoji: '📉', title: 'Matières à renforcer',
    sections: [{
      title: '⚠️ Analyse',
      items: weak.map(w => {
        const parts = [];
        if (w.avg != null)   parts.push(`moy. ${w.avg}/20`);
        if (w.dueCount > 0)  parts.push(`${w.dueCount} devoir${w.dueCount > 1 ? 's' : ''}`);
        if (w.cardCount > 0) parts.push(`${w.cardCount} carte${w.cardCount > 1 ? 's' : ''} SRS à revoir`);
        return `📉 ${w.sub?.name || '?'}${parts.length ? ' — ' + parts.join(', ') : ''}`;
      }),
    }],
    actions: [{ label: 'Révisions SRS', to: '/revision' }, { label: 'Voir les notes', to: '/grades' }],
  };
}

async function handleWorkTime(_, d) {
  const now = new Date();
  const workSessions = d.pomodoro.filter(s => s.completed && s.phase === 'work');

  const totalMin  = workSessions.reduce((acc, s) => acc + (s.duration || 0), 0) / 60;
  const todayStr  = now.toISOString().split('T')[0];
  const todayMin  = workSessions.filter(s => (s.date || '').startsWith(todayStr)).reduce((acc, s) => acc + (s.duration || 0), 0) / 60;
  const weekMin   = workSessions.filter(s => { try { return differenceInDays(now, new Date(s.date)) <= 7; } catch (_) { return false; } }).reduce((acc, s) => acc + (s.duration || 0), 0) / 60;

  const fmtH = m => m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)}h${Math.round(m % 60) > 0 ? Math.round(m % 60) + 'min' : ''}`;

  return {
    emoji: '⏱️', title: 'Temps de travail',
    sections: [{
      title: '📊 Statistiques Pomodoro',
      items: [
        `Aujourd'hui : ${fmtH(todayMin)} (${workSessions.filter(s => (s.date || '').startsWith(todayStr)).length} sessions)`,
        `Cette semaine : ${fmtH(weekMin)}`,
        `Total cumulé : ${fmtH(totalMin)}`,
        `Sessions totales : ${workSessions.length}`,
      ],
    }],
    actions: [{ label: 'Statistiques complètes', to: '/analytics' }],
  };
}

async function handleSubjectQuery(input, d) {
  const norm    = normalize(input);
  const subject = d.subjects.find(s => norm.includes(normalize(s.name)));
  if (!subject) return handleHelp(input, d);

  const now       = new Date();
  const pending   = d.assignments.filter(a => a.subjectId === subject.id && a.status !== 'done');
  const exams     = d.exams.filter(e => e.subjectId === subject.id && new Date(e.date) >= now);
  const grades    = d.grades.filter(g => g.subjectId === subject.id);
  const revisions = d.revisions.filter(r => r.subjectId === subject.id);
  const avgGrade  = grades.length > 0
    ? Math.round(grades.reduce((acc, g) => acc + (g.grade / g.maxGrade) * 20, 0) / grades.length * 10) / 10
    : null;

  const items = [
    `📝 Devoirs en attente : ${pending.length}`,
    `🎓 Examens à venir : ${exams.length}`,
    ...(avgGrade != null ? [`📊 Note moyenne : ${avgGrade}/20`] : []),
    `🃏 Cartes de révision : ${revisions.length} (${revisions.filter(r => r.status === 'mastered').length} maîtrisées)`,
  ];

  if (pending.length > 0) {
    items.push('', '📋 Devoirs :', ...pending.slice(0, 3).map(a => `  • ${a.title} — dans ${differenceInDays(new Date(a.dueDate), now)}j`));
  }
  if (exams.length > 0) {
    items.push('', '🎓 Examens :', ...exams.slice(0, 3).map(e => `  • ${format(new Date(e.date), 'd MMMM', { locale: fr })} (J-${differenceInDays(new Date(e.date), now)})`));
  }

  return {
    emoji: '📚', title: `Résumé — ${subject.name}`,
    sections: [{ title: '📊 Vue d\'ensemble', items }],
    actions: [
      { label: 'Voir les devoirs', to: '/assignments' },
      { label: 'Réviser', to: '/revision' },
    ],
  };
}

async function handleHelp(_, d) {
  return {
    emoji: '🤖', title: 'Ce que je peux faire',
    sections: [{
      title: '💬 Questions possibles',
      items: [
        '"Que dois-je faire aujourd\'hui ?"',
        '"Mes devoirs urgents"',
        '"Prochains examens"',
        '"Mon emploi du temps"',
        '"Quel cours est le plus chargé ?"',
        '"Crée un plan de révision pour [matière]"',
        '"Mon score étudiant"',
        '"Bilan de la semaine"',
        '"Mes matières faibles"',
        '"Combien de temps j\'ai travaillé ?"',
        '"Résume [nom de matière]"',
      ],
    }],
    body: null,
    actions: [],
  };
}

/* ══ INTENT REGISTRY ════════════════════════════════════════════════════════ */
const INTENTS = [
  { id: 'today',          patterns: ["aujourd'hui", 'ce soir', 'ce matin', 'que faire', 'quoi faire', 'prévu', 'journée'],   handler: handleToday    },
  { id: 'urgent',         patterns: ['urgent', 'retard', 'en retard', 'priorité'],                                            handler: handleUrgent   },
  { id: 'exams',          patterns: ['examen', 'exam', 'épreuve', 'contrôle', 'prochains exam'],                              handler: handleExams    },
  { id: 'schedule',       patterns: ['emploi du temps', 'cours', 'horaire', 'séance'],                                        handler: handleSchedule },
  { id: 'workload',       patterns: ['chargé', 'difficile', 'matière', 'plus de travail', 'lourd'],                           handler: handleWorkload },
  { id: 'create_plan',    patterns: ['plan', 'planifier', 'programme', 'organiser', 'révision pour', 'préparer'],             handler: handleCreatePlan },
  { id: 'score',          patterns: ['score', 'productivité', 'statistiques', 'stats', 'performance', 'profil'],             handler: handleScore    },
  { id: 'week',           patterns: ['semaine', 'cette semaine', 'bilan', 'résumé semaine'],                                  handler: handleWeek     },
  { id: 'weak',           patterns: ['faible', 'difficultés', 'mauvais', 'problème', 'faibles'],                              handler: handleWeak     },
  { id: 'work_time',      patterns: ['combien', 'heures', 'travaillé', 'temps de travail', 'pomodoro'],                       handler: handleWorkTime },
  { id: 'help',           patterns: ['aide', 'help', 'que peux-tu', 'commandes', 'fonctions', 'quoi dire'],                  handler: handleHelp     },
];

/* ══ MAIN ENTRY POINT ═══════════════════════════════════════════════════════ */
export async function processMessage(input) {
  if (!input?.trim()) return handleHelp(input, await loadData());

  const norm = normalize(input);
  const data = await loadData();

  // Match intent
  const intent = INTENTS.find(i => i.patterns.some(p => norm.includes(normalize(p))));
  if (intent) return intent.handler(input, data);

  // Check if a subject name is mentioned
  const mentionedSubject = data.subjects.find(s => norm.includes(normalize(s.name)));
  if (mentionedSubject) return handleSubjectQuery(input, data);

  // Fallback
  return {
    emoji: '🤔',
    title: 'Je ne suis pas sûr de comprendre',
    body:  `Tu peux essayer : "que dois-je faire aujourd'hui ?", "mes devoirs urgents", "prochains examens", ou "aide".`,
    sections: [],
    actions: [],
  };
}

/* Stub for future WebLLM / Transformers.js integration — all local, no cloud */
export async function processWithLLM(input) {
  // TODO: integrate window.webllm or @xenova/transformers here
  // The model must be loaded locally (WASM/ONNX) and NEVER send data externally.
  console.log('[LLM stub] would process:', input);
  return processMessage(input); // fallback to rule engine
}

/* Suggested quick prompts shown in the chat UI */
export const QUICK_PROMPTS = [
  "Que dois-je faire aujourd'hui ?",
  "Mes devoirs urgents",
  "Prochains examens",
  "Mon score étudiant",
  "Bilan de la semaine",
  "Crée un plan de révision",
  "Mes matières faibles",
  "Combien j'ai travaillé ?",
];
