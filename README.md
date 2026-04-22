# NOLDEX FLEET v27 — Déploiement Vercel

Plateforme logistique B2B — Single-file HTML avec Firebase v9 modular.

## Structure du projet

```
noldex-fleet/
├── public/
│   └── index.html          ← App complète (11 000+ lignes)
├── scripts/
│   ├── inject-env.js       ← Build : injecte les vars Firebase
│   └── dev-server.js       ← Serveur de dev local
├── .env.example            ← Template variables d'environnement
├── .gitignore
├── package.json
└── vercel.json             ← Config Vercel (routes, headers CSP)
```

## Déploiement Vercel

### 1. Prérequis

- Compte [Vercel](https://vercel.com)
- Projet Firebase configuré (Auth + Firestore + Storage)
- [Vercel CLI](https://vercel.com/docs/cli) : `npm i -g vercel`

### 2. Cloner et initialiser

```bash
# Cloner le repo
git clone https://github.com/VOTRE_ORG/noldex-fleet.git
cd noldex-fleet

# Initialiser Vercel
vercel
# → Répondre aux questions (project name, framework: Other, etc.)
```

### 3. Variables d'environnement Vercel

Dans **Vercel Dashboard → Settings → Environment Variables**, ajouter :

| Variable | Valeur | Environnements |
|----------|--------|----------------|
| `FIREBASE_API_KEY` | `AIzaSy...` | Production, Preview, Development |
| `FIREBASE_AUTH_DOMAIN` | `projet.firebaseapp.com` | tous |
| `FIREBASE_PROJECT_ID` | `projet-id` | tous |
| `FIREBASE_STORAGE_BUCKET` | `projet.appspot.com` | tous |
| `FIREBASE_MESSAGING_SENDER_ID` | `123456789` | tous |
| `FIREBASE_APP_ID` | `1:xxx:web:xxx` | tous |

Ou via CLI :

```bash
vercel env add FIREBASE_API_KEY
vercel env add FIREBASE_AUTH_DOMAIN
vercel env add FIREBASE_PROJECT_ID
vercel env add FIREBASE_STORAGE_BUCKET
vercel env add FIREBASE_MESSAGING_SENDER_ID
vercel env add FIREBASE_APP_ID
```

### 4. Déployer

```bash
# Preview deploy
vercel

# Production deploy
vercel --prod
```

Le build s'exécute automatiquement :
```
node scripts/inject-env.js
→ dist/index.html  (tokens Firebase remplacés)
```

## Développement local

```bash
# Copier le template d'environnement
cp .env.example .env.local

# Remplir .env.local avec vos vraies clés Firebase
nano .env.local

# Lancer le serveur de dev (port 3000)
node scripts/dev-server.js

# Ou tester le build
node scripts/inject-env.js
node scripts/dev-server.js dist
```

## Firebase — Configuration requise

### Auth
Activer **Email/Password** dans Firebase Console → Authentication → Sign-in method.

### Custom Claims (obligatoire)
Chaque utilisateur doit avoir `companyId` et `role` dans ses custom claims :

```js
// Exécuter une seule fois par utilisateur via Admin SDK
await admin.auth().setCustomUserClaims(uid, {
  companyId: "noldex",          // ID de l'entreprise
  role: "admin",                // admin | manager | driver | client | partner
});
```

### Firestore Rules
Déployer `firestore.rules` (contenu dans l'app, ligne ~11087) :
```bash
firebase deploy --only firestore:rules
```

### Storage Rules
Déployer `storage.rules` (contenu dans le schéma architecture) :
```bash
firebase deploy --only storage
```

### Domaine autorisé
Ajouter votre domaine Vercel dans Firebase Console →
Authentication → Settings → Authorized domains :
```
noldex-fleet.vercel.app
votre-domaine-custom.com   (si domaine personnalisé)
```

## Variables par environnement

Pour utiliser des projets Firebase différents (dev/prod) :

```bash
# Variables uniquement pour production
vercel env add FIREBASE_PROJECT_ID production

# Variables uniquement pour preview
vercel env add FIREBASE_PROJECT_ID preview
```

## Domaine personnalisé

```bash
vercel domains add fleet.noldex.gn
```

Puis configurer les DNS :
```
CNAME  fleet  cname.vercel-dns.com
```

## Sécurité

- ✅ Les clés Firebase sont injectées au build, jamais exposées en clair dans git
- ✅ Headers CSP configurés dans `vercel.json`
- ✅ `X-Frame-Options: DENY` (anti-clickjacking)
- ✅ `Geolocation` et `Camera` autorisées (GPS tracker mobile)
- ✅ `Cache-Control: no-cache` sur `index.html` (toujours version fraîche)
- ⚠️ Les clés Firebase client-side sont visibles dans le bundle — c'est normal
  Les règles Firestore/Storage sont la vraie protection côté serveur

## Mise à jour de l'app

```bash
# Remplacer public/index.html par la nouvelle version
cp NoldexFleet_v27_fixed.html public/index.html

# Redéployer
vercel --prod
```
