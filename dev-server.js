#!/usr/bin/env node
/**
 * dev-server.js
 * Serveur HTTP local qui injecte les variables d'environnement
 * depuis .env.local à la volée — sans build step.
 *
 * Usage :
 *   node scripts/dev-server.js          → sert public/ avec injection
 *   node scripts/dev-server.js dist     → sert dist/ (post-build)
 *
 * Requiert : un fichier .env.local à la racine du projet
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");

// ── Charger .env.local ──
const ENV_FILE = path.join(__dirname, "../.env.local");
if (fs.existsSync(ENV_FILE)) {
  fs.readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .filter(l => l && !l.startsWith("#"))
    .forEach(l => {
      const [key, ...rest] = l.split("=");
      process.env[key.trim()] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    });
  console.log("✓ .env.local chargé");
} else {
  console.warn("⚠ .env.local introuvable — Firebase sera en mode hors-ligne");
}

const SERVE_DIR = path.join(__dirname, "..", process.argv[2] || "public");
const PORT      = process.env.PORT || 3000;

const TOKENS = {
  __VITE_FIREBASE_API_KEY__:             process.env.FIREBASE_API_KEY             || "VOTRE_API_KEY",
  __VITE_FIREBASE_AUTH_DOMAIN__:         process.env.FIREBASE_AUTH_DOMAIN         || "VOTRE_PROJECT.firebaseapp.com",
  __VITE_FIREBASE_PROJECT_ID__:          process.env.FIREBASE_PROJECT_ID          || "VOTRE_PROJECT_ID",
  __VITE_FIREBASE_STORAGE_BUCKET__:      process.env.FIREBASE_STORAGE_BUCKET      || "VOTRE_PROJECT.appspot.com",
  __VITE_FIREBASE_MESSAGING_SENDER_ID__: process.env.FIREBASE_MESSAGING_SENDER_ID || "VOTRE_SENDER_ID",
  __VITE_FIREBASE_APP_ID__:             process.env.FIREBASE_APP_ID              || "VOTRE_APP_ID",
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

const server = http.createServer((req, res) => {
  // SPA fallback — tout → index.html
  let filePath = path.join(SERVE_DIR, req.url === "/" ? "index.html" : req.url);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(SERVE_DIR, "index.html");
  }

  const ext  = path.extname(filePath);
  const mime = MIME[ext] || "application/octet-stream";

  try {
    let content = fs.readFileSync(filePath);

    if (ext === ".html") {
      // Injection des tokens Firebase à la volée
      let html = content.toString("utf8");
      Object.entries(TOKENS).forEach(([token, value]) => {
        html = html.replaceAll(token, value);
      });
      content = Buffer.from(html, "utf8");
    }

    if (ext === ".js" && path.basename(filePath) === "sw.js") {
      // Injection du timestamp de build dans le Service Worker
      let sw = content.toString("utf8");
      sw = sw.replaceAll("__BUILD_TS__", "dev-" + Date.now().toString(36));
      content = Buffer.from(sw, "utf8");
    }

    res.writeHead(200, {
      "Content-Type":  mime,
      "Cache-Control": ext === ".html" ? "no-cache" : "max-age=3600",
    });
    res.end(content);
  } catch (e) {
    res.writeHead(404);
    res.end("404 Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 NoldexFleet dev server`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Serving: ${SERVE_DIR}`);
  console.log(`   Firebase project: ${process.env.FIREBASE_PROJECT_ID || "(non configuré)"}\n`);
});
