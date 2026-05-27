/* ── Auto task generator — breaks a project title into subtasks ── */

const TEMPLATES = {
  projet:    ['📐 Analyse des besoins', '🏗️ Conception & UML', '💻 Implémentation', '🧪 Tests & débogage', '📄 Rapport final'],
  tp:        ['📖 Lecture du sujet', '💻 Implémentation', '🧪 Tests', '📝 Compte-rendu'],
  rapport:   ['📚 Recherche & collecte', '✏️ Plan détaillé', '📝 Rédaction', '🎨 Mise en forme', '🔍 Relecture'],
  exposé:    ['📚 Recherche bibliographique', '📋 Structuration du plan', '🎞️ Création des slides', '🗣️ Répétition'],
  mémoire:   ['📚 Revue de littérature', '🔬 Méthodologie', '📊 Collecte & analyse', '✏️ Rédaction', '📄 Mise en forme finale'],
  révision:  ['📖 Relecture du cours', '🗒️ Création de fiches', '🧩 Exercices d\'application', '🔄 Révision finale'],
  devoir:    ['📖 Compréhension du sujet', '✏️ Brouillon', '📝 Rédaction propre', '🔍 Relecture & correction'],
  programme: ['📋 Spécifications', '🏗️ Architecture', '💻 Développement', '🧪 Tests', '🚀 Déploiement'],
  default:   ['📋 Planification', '⚙️ Exécution — phase 1', '⚙️ Exécution — phase 2', '✅ Finalisation & relecture'],
};

function detectType(title) {
  const t = title.toLowerCase();
  if (t.includes('projet'))                               return 'projet';
  if (t.includes(' tp') || t.startsWith('tp'))           return 'tp';
  if (t.includes('rapport'))                              return 'rapport';
  if (t.includes('exposé') || t.includes('présentation'))return 'exposé';
  if (t.includes('mémoire') || t.includes('thèse'))      return 'mémoire';
  if (t.includes('révision') || t.includes('préparer'))  return 'révision';
  if (t.includes('devoir'))                               return 'devoir';
  if (t.includes('programme') || t.includes('appli'))    return 'programme';
  return 'default';
}

export function generateSubtasks(title) {
  const type = detectType(title);
  return (TEMPLATES[type] || TEMPLATES.default).map(text => ({
    id:   crypto.randomUUID(),
    text,
    done: false,
  }));
}

export function detectTaskType(title) {
  return detectType(title);
}
