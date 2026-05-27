# StudyFlow V7 — Guide de déploiement

> Architecture offline-first : IndexedDB est toujours la source de vérité.
> Supabase est optionnel — l'app fonctionne sans aucune configuration cloud.

---

## 1. Prérequis

| Outil | Version minimale |
|-------|-----------------|
| Node.js | 18+ |
| npm | 9+ |
| Compte Vercel (gratuit) | — |
| Compte Supabase (gratuit, optionnel) | — |

---

## 2. Configurer Supabase (optionnel mais recommandé)

### 2a. Créer un projet

1. Va sur [supabase.com](https://supabase.com) → **New project**
2. Choisis une région proche de tes utilisateurs (ex : `eu-west-1`)
3. Note l'**URL du projet** et la **clé anon publique** (Settings → API)

### 2b. Appliquer le schéma

1. Dans ton projet Supabase → **SQL Editor** → **New query**
2. Colle le contenu de `supabase/schema.sql`
3. Clique **Run** — toutes les tables, index, RLS et politiques Storage sont créés

### 2c. Activer les providers OAuth

Dans **Authentication → Providers** :

- **Google** : active → entre Client ID + Secret (depuis [console.cloud.google.com](https://console.cloud.google.com))
  - URI de redirection autorisée : `https://TON-PROJET.supabase.co/auth/v1/callback`
- **GitHub** : active → entre Client ID + Secret (depuis GitHub → Settings → Developer apps)
  - Homepage URL : `https://ton-app.vercel.app`
  - Callback URL : `https://TON-PROJET.supabase.co/auth/v1/callback`

> **Email magic link** fonctionne sans configuration supplémentaire (Supabase SMTP intégré).

---

## 3. Variables d'environnement

Copie `.env.example` en `.env.local` et remplis tes valeurs :

```env
VITE_SUPABASE_URL=https://ton-projet.supabase.co
VITE_SUPABASE_ANON_KEY=ta_cle_anon_publique
```

> Ces variables commencent par `VITE_` → elles sont embarquées dans le build
> côté client. Ne mets **jamais** la clé `service_role` ici.

---

## 4. Déployer sur Vercel

### Option A — Interface web (plus simple)

1. Push ton code sur GitHub / GitLab / Bitbucket
2. Va sur [vercel.com](https://vercel.com) → **New Project** → importe ton repo
3. Dans **Environment Variables**, ajoute :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Clique **Deploy** — Vercel détecte automatiquement Vite

### Option B — CLI Vercel

```bash
npm i -g vercel
vercel login
vercel --prod
# Réponds aux questions (framework: Vite, build: npm run build, output: dist)
# Ajoute les env vars dans le dashboard ou avec :
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
```

> `vercel.json` est déjà configuré avec les rewrites SPA + headers de sécurité.

---

## 5. Mettre à jour l'URL de redirection OAuth

Après le premier déploiement, note l'URL Vercel (ex : `https://studyflow.vercel.app`).

Dans Supabase → **Authentication → URL Configuration** :
- **Site URL** : `https://ton-app.vercel.app`
- **Redirect URLs** : ajoute `https://ton-app.vercel.app/**`

Dans la console Google / GitHub, mets à jour les callback URLs en conséquence.

---

## 6. Développement local

```bash
# Installer les dépendances
npm install

# Démarrer en dev (sans Supabase → mode offline)
npm run dev

# Démarrer avec Supabase
cp .env.example .env.local
# Édite .env.local avec tes valeurs
npm run dev

# Build de production
npm run build

# Preview du build (teste le SW PWA)
npm run preview
```

---

## 7. PWA — Installation

Une fois déployé, les utilisateurs peuvent **installer l'app** :
- Chrome / Edge : icône "installer" dans la barre d'adresse
- iOS Safari : bouton partage → "Ajouter à l'écran d'accueil"
- Android Chrome : bannière d'installation automatique

Le Service Worker met en cache l'app shell → **fonctionne hors ligne** même sans connexion.

---

## 8. Vérifications post-déploiement

| Check | Outil |
|-------|-------|
| PWA valide (manifest, icons, SW) | [web.dev/measure](https://web.dev/measure) |
| Headers de sécurité | [securityheaders.com](https://securityheaders.com) |
| Auth OAuth fonctionne | Test manuel Google + GitHub |
| Sync cloud | Se connecter, créer un sujet, recharger → doit persister |
| Mode offline | DevTools → Network → Offline → recharger |

---

## 9. Tier gratuit — Limites

| Service | Limite gratuite |
|---------|----------------|
| **Vercel** | 100 GB bande passante/mois, déploiements illimités |
| **Supabase** | 500 MB base de données, 1 GB Storage, 50 000 MAU |
| **Anthropic API** | Pas de tier gratuit — clé API de l'utilisateur |

Pour dépasser ces limites, passe à Supabase Pro ($25/mois) ou auto-héberge Supabase avec Docker.

---

## 10. Architecture de sync (résumé)

```
┌─────────────────────────────────────────┐
│  Navigateur (IndexedDB = source de      │
│  vérité, fonctionne 100% offline)       │
│                                         │
│  db.put(store, item)                    │
│    └─→ onDbWrite hook                   │
│           └─→ SyncEngine.enqueue()      │
│                 └─→ flush() toutes 30s  │
│                       └─→ Supabase      │
│                                         │
│  Login → pullFromCloud() → merge IDB    │
│  (last-write-wins par updated_at)       │
└─────────────────────────────────────────┘
```

Stores NON synchronisés (local uniquement) :
- `settings` (contient la clé API Claude)
- `documentChunks` (chunks RAG, reconstruits depuis documents)
- `profile`, `dailyLogs`
