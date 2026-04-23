// ══════════════════════════════════════════════════════
//  NOLDEX FLEET v27 — Service Worker
//  Stratégie : Cache-first pour assets statiques
//              Network-first pour Firebase / API
//  Auteur    : HABATECH / Gondwana Systems
// ══════════════════════════════════════════════════════

const CACHE_NAME    = "noldex-fleet-v27";
const CACHE_STATIC  = "noldex-static-v27";
const CACHE_FONTS   = "noldex-fonts-v27";

// ── Assets à mettre en cache immédiatement à l'install ──
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// ── Assets externes à mettre en cache à la première requête ──
const CACHEABLE_ORIGINS = [
  "https://cdnjs.cloudflare.com",
  "https://unpkg.com",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
];

// ── Origines réseau-only (jamais en cache) ──
const NETWORK_ONLY_ORIGINS = [
  "https://firestore.googleapis.com",
  "https://firebase.googleapis.com",
  "https://identitytoolkit.googleapis.com",
  "https://www.gstatic.com/firebasejs",
  "https://api.cloudinary.com",
  "https://res.cloudinary.com",
  "https://ui-avatars.com",
  "https://images.unsplash.com",
  "https://tile.openstreetmap.org",
];

// ══════════════════════════════════════════════════════
//  INSTALL — Précache des assets essentiels
// ══════════════════════════════════════════════════════
self.addEventListener("install", event => {
  console.info("[SW] Install — NOLDEX FLEET v27");
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        // Ne pas bloquer l'install si un asset est absent
        console.warn("[SW] Précache partiel :", err.message);
      });
    }).then(() => self.skipWaiting()) // Activer immédiatement
  );
});

// ══════════════════════════════════════════════════════
//  ACTIVATE — Nettoyer les anciens caches
// ══════════════════════════════════════════════════════
self.addEventListener("activate", event => {
  console.info("[SW] Activate — nettoyage anciens caches");
  const validCaches = [CACHE_NAME, CACHE_STATIC, CACHE_FONTS];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => !validCaches.includes(k))
          .map(k => {
            console.info("[SW] Suppression cache obsolète :", k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim()) // Prendre le contrôle immédiatement
  );
});

// ══════════════════════════════════════════════════════
//  FETCH — Stratégies de cache par type de requête
// ══════════════════════════════════════════════════════
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // ── Ignorer les requêtes non-GET ──
  if (request.method !== "GET") return;

  // ── Ignorer les requêtes chrome-extension ──
  if (!request.url.startsWith("http")) return;

  // ── Réseau uniquement : Firebase, Cloudinary, tiles map, avatars ──
  if (NETWORK_ONLY_ORIGINS.some(o => request.url.startsWith(o))) {
    event.respondWith(fetch(request));
    return;
  }

  // ── Fonts Google : Cache-first avec fallback réseau ──
  if (
    url.origin === "https://fonts.googleapis.com" ||
    url.origin === "https://fonts.gstatic.com"
  ) {
    event.respondWith(cacheFirst(request, CACHE_FONTS));
    return;
  }

  // ── CDN externes (Chart.js, Leaflet, jsPDF) : Cache-first ──
  if (CACHEABLE_ORIGINS.some(o => request.url.startsWith(o))) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // ── App shell (index.html + assets locaux) : Network-first ──
  // Permet d'avoir toujours la dernière version déployée
  // avec fallback sur le cache si hors-ligne
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, CACHE_STATIC));
    return;
  }

  // ── Tout le reste : réseau direct ──
  event.respondWith(fetch(request));
});

// ══════════════════════════════════════════════════════
//  STRATÉGIES
// ══════════════════════════════════════════════════════

// Cache-first : sert depuis le cache, réseau en fallback
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn("[SW] cacheFirst — réseau indisponible :", request.url);
    return new Response("Hors-ligne — ressource non disponible", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

// Network-first : réseau en priorité, cache en fallback
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) {
      console.info("[SW] Hors-ligne — servi depuis cache :", request.url);
      return cached;
    }
    // Fallback ultime : renvoyer index.html pour les navigations SPA
    if (request.mode === "navigate") {
      const shell = await caches.match("/index.html");
      if (shell) return shell;
    }
    return new Response("Hors-ligne — page non disponible", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

// ══════════════════════════════════════════════════════
//  MESSAGE — Gestion des commandes depuis l'app
// ══════════════════════════════════════════════════════
self.addEventListener("message", event => {
  // Commande de mise à jour immédiate (depuis le banner update)
  if (event.data === "SKIP_WAITING") {
    console.info("[SW] SKIP_WAITING reçu — activation immédiate");
    self.skipWaiting();
  }

  // Commande de purge du cache (depuis les paramètres de l'app)
  if (event.data === "CLEAR_CACHE") {
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => {
      console.info("[SW] Cache purgé sur demande");
      event.ports?.[0]?.postMessage({ ok: true });
    });
  }
});
