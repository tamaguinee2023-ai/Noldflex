#!/usr/bin/env node
/**
 * inject-env.js
 * Remplace les tokens __VITE_FIREBASE_*__ dans public/index.html
 * par les variables d'environnement Vercel au moment du build.
 * Copie également sw.js et manifest.json dans dist/.
 *
 * Utilisé par : vercel.json → buildCommand
 */

const fs   = require("fs");
const path = require("path");

const SRC      = path.join(__dirname, "../public/index.html");
const SW_SRC   = path.join(__dirname, "../public/sw.js");
const MAN_SRC  = path.join(__dirname, "../public/manifest.json");
const DIST     = path.join(__dirname, "../dist/index.html");
const SW_DIST  = path.join(__dirname, "../dist/sw.js");
const MAN_DIST = path.join(__dirname, "../dist/manifest.json");

// Mapping token → variable d'environnement
const TOKENS = {
  __VITE_FIREBASE_API_KEY__:              process.env.FIREBASE_API_KEY,
  __VITE_FIREBASE_AUTH_DOMAIN__:          process.env.FIREBASE_AUTH_DOMAIN,
  __VITE_FIREBASE_PROJECT_ID__:           process.env.FIREBASE_PROJECT_ID,
  __VITE_FIREBASE_STORAGE_BUCKET__:       process.env.FIREBASE_STORAGE_BUCKET,
  __VITE_FIREBASE_MESSAGING_SENDER_ID__:  process.env.FIREBASE_MESSAGING_SENDER_ID,
  __VITE_FIREBASE_APP_ID__:              process.env.FIREBASE_APP_ID,
};

// Vérifier que toutes les variables sont définies
const missing = Object.entries(TOKENS)
  .filter(([, v]) => !v)
  .map(([k]) => k.replace(/__/g, "").replace(/^VITE_/, ""));

if (missing.length > 0) {
  console.error("❌ Variables d'environnement manquantes :");
  missing.forEach(k => console.error(`   • ${k}`));
  console.error("\nDéfinissez-les dans Vercel → Settings → Environment Variables");
  process.exit(1);
}

// Timestamp de build unique pour invalider le cache SW
const BUILD_TS = Date.now().toString(36); // ex: "lzxyz12"

// Créer dist/
fs.mkdirSync(path.dirname(DIST), { recursive: true });

// ── 1. Injecter les vars Firebase dans index.html ──
let html = fs.readFileSync(SRC, "utf8");
Object.entries(TOKENS).forEach(([token, value]) => {
  html = html.replaceAll(token, value);
});
fs.writeFileSync(DIST, html, "utf8");
console.log(`✅ index.html → dist/ (Firebase: ${process.env.FIREBASE_PROJECT_ID})`);

// ── 2. Injecter le build timestamp dans sw.js ──
let sw = fs.readFileSync(SW_SRC, "utf8");
sw = sw.replaceAll("__BUILD_TS__", BUILD_TS);
fs.writeFileSync(SW_DIST, sw, "utf8");
console.log(`✅ sw.js → dist/ (cache: noldex-v27-${BUILD_TS})`);

// ── 3. Copier manifest.json ──
fs.copyFileSync(MAN_SRC, MAN_DIST);
console.log(`✅ manifest.json → dist/`);

// ── 4. Copier les icônes si elles existent ──
const ICONS_SRC  = path.join(__dirname, "../public/icons");
const ICONS_DIST = path.join(__dirname, "../dist/icons");
if (fs.existsSync(ICONS_SRC)) {
  fs.mkdirSync(ICONS_DIST, { recursive: true });
  fs.readdirSync(ICONS_SRC).forEach(f => {
    fs.copyFileSync(path.join(ICONS_SRC, f), path.join(ICONS_DIST, f));
  });
  console.log(`✅ icons/ → dist/icons/`);
}

console.log(`\n🚀 Build OK — dist/ prêt pour Vercel`);
