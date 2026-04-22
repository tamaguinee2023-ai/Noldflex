/**
 * sw.js — NoldexFleet v27 Service Worker
 *
 * Stratégies :
 *   App shell (index.html)      → Network-first, fallback cache
 *   CDN assets (JS/CSS tiers)   → Cache-first, revalidation bg
 *   Firebase / API calls        → Network-only (jamais mis en cache)
 *   Fonts Google                → Cache-first, longue durée
 *
 * Mise à jour : à chaque deploy Vercel, CACHE_VERSION change
 * → l'ancien SW est remplacé automatiquement.
 */

const CACHE_VERSION  = "noldex-v27-__BUILD_TS__"; // injecté par inject-env.js
const SHELL_CACHE    = `shell-${CACHE_VERSION}`;
const ASSETS_CACHE   = `assets-${CACHE_VERSION}`;
const FONTS_CACHE    = "fonts-v1"; // stable — fonts changent rarement

// ── Assets CDN à précacher au premier install ──
const CDN_PRECACHE = [
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
];

// ── Origines à ne jamais mettre en cache ──
const NEVER_CACHE = [
  "firebaseio.com",
  "googleapis.com",
  "gstatic.com/firebasejs", // Firebase SDK ESM — toujours fresh
  "identitytoolkit",
];

function isFirebase(url) {
  return NEVER_CACHE.some(h => url.includes(h));
}

function isFont(url) {
  return url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com");
}

function isCDN(url) {
  return url.includes("cdnjs.cloudflare.com") || url.includes("unpkg.com");
}

// ══════════════════════════════════════════
//  INSTALL — précacher le shell + CDN assets
// ══════════════════════════════════════════
self.addEventListener("install", event => {
  event.waitUntil(
    Promise.all([
      // App shell
      caches.open(SHELL_CACHE).then(cache =>
        cache.addAll(["/", "/index.html"])
          .catch(() => {}) // ne pas bloquer si offline au premier install
      ),
      // CDN assets
      caches.open(ASSETS_CACHE).then(cache =>
        Promise.allSettled(
          CDN_PRECACHE.map(url =>
            fetch(url, { cache: "no-cache" })
              .then(r => r.ok ? cache.put(url, r) : null)
              .catch(() => null)
          )
        )
      ),
    ]).then(() => {
      console.log("[SW] Install OK — cache:", CACHE_VERSION);
      self.skipWaiting(); // activer immédiatement sans attendre fermeture des onglets
    })
  );
});

// ══════════════════════════════════════════
//  ACTIVATE — purger les anciens caches
// ══════════════════════════════════════════
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== ASSETS_CACHE && k !== FONTS_CACHE)
          .map(k => {
            console.log("[SW] Suppression ancien cache:", k);
            return caches.delete(k);
          })
      )
    ).then(() => {
      console.log("[SW] Activate OK — version active:", CACHE_VERSION);
      return self.clients.claim(); // prendre le contrôle de tous les onglets ouverts
    })
  );
});

// ══════════════════════════════════════════
//  FETCH — stratégies par type de ressource
// ══════════════════════════════════════════
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = request.url;

  // Ignorer les requêtes non-GET
  if (request.method !== "GET") return;

  // ── Firebase / API → Network-only ──
  if (isFirebase(url)) return;

  // ── Fonts → Cache-first, longue durée ──
  if (isFont(url)) {
    event.respondWith(cacheFirst(request, FONTS_CACHE));
    return;
  }

  // ── CDN assets → Cache-first ──
  if (isCDN(url)) {
    event.respondWith(cacheFirst(request, ASSETS_CACHE));
    return;
  }

  // ── App shell (même origine) → Network-first, fallback cache ──
  if (url.startsWith(self.location.origin)) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }
});

// ══════════════════════════════════════════
//  STRATÉGIES
// ══════════════════════════════════════════

// Cache-first : sert depuis le cache, réseau en fallback
async function cacheFirst(request, cacheName) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("Offline — ressource non disponible", { status: 503 });
  }
}

// Network-first : tente le réseau, fallback cache, fallback offline page
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request)
                || await cache.match("/index.html") // SPA fallback
                || await cache.match("/");
    if (cached) return cached;
    // Offline fallback minimaliste
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8">
       <meta name="viewport" content="width=device-width,initial-scale=1">
       <title>NOLDEX FLEET — Hors ligne</title>
       <style>body{background:#04080F;color:#C8D0E0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:20px}
       h1{color:#E8A926;font-size:24px;margin-bottom:12px}.sub{color:#6B7A94;font-size:14px;margin-bottom:24px}
       button{background:#E8A926;border:none;color:#07080A;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}
       </style></head><body>
       <div><div style="font-size:48px;margin-bottom:16px">🚛</div>
       <h1>NOLDEX FLEET</h1>
       <p class="sub">Vous êtes hors ligne.<br>Vérifiez votre connexion internet.</p>
       <button onclick="location.reload()">↺ Réessayer</button></div>
       </body></html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

// ══════════════════════════════════════════
//  MESSAGES depuis l'app
// ══════════════════════════════════════════
self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data === "GET_VERSION") {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
});
