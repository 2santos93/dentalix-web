/*
 * Service worker de Dentalix (DX-405). Mínimo y sin dependencias:
 *
 * - `/_next/static/*` (nombres con hash, inmutables): caché primero.
 * - Navegación a `/agenda`: red primero; si la red falla o tarda más de
 *   NAV_TIMEOUT_MS, la última copia guardada. Así la agenda abre sin conexión
 *   (sus datos los descifra la página desde IndexedDB; aquí no hay datos de
 *   pacientes: el HTML de la agenda no lleva ninguno).
 * - Todo lo demás (incluida la API) pasa sin tocar.
 *
 * Los nombres de caché llevan versión: al cambiarla, `activate` borra las
 * viejas. `PAGES_CACHE` debe coincidir con `SW_PAGES_CACHE` de
 * `src/lib/offline/service-worker.ts` (la página la borra al cerrar sesión).
 */
const STATIC_CACHE = 'dentalix-static-v1';
const PAGES_CACHE = 'dentalix-pages-v1';
const OFFLINE_PAGES = ['/agenda'];
const NAV_TIMEOUT_MS = 4000;
const MAX_STATIC_ENTRIES = 400;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGES_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith('dentalix-') && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

function isStatic(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/_next/static/');
}

function isOfflinePage(url) {
  return url.origin === self.location.origin && OFFLINE_PAGES.includes(url.pathname);
}

function cacheable(response) {
  return response && response.ok && response.type === 'basic' && !response.redirected;
}

async function trimStatic(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_STATIC_ENTRIES; i += 1) await cache.delete(keys[i]);
}

async function staticFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (cacheable(response)) {
    await cache.put(request, response.clone());
    void trimStatic(cache);
  }
  return response;
}

async function savePage(pathname, response) {
  if (!cacheable(response)) return;
  const cache = await caches.open(PAGES_CACHE);
  await cache.put(pathname, response);
}

async function networkFirstPage(event, url) {
  const network = fetch(event.request).then(async (response) => {
    await savePage(url.pathname, response.clone());
    return response;
  });
  // La copia en segundo plano termina aunque se responda con la guardada.
  event.waitUntil(network.catch(() => undefined));
  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS, null));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
  } catch {
    // Sin red: la guardada.
  }
  const cached = await caches.match(url.pathname, { cacheName: PAGES_CACHE });
  if (cached) return cached;
  return network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isStatic(url)) {
    event.respondWith(staticFirst(request));
    return;
  }
  if (request.mode === 'navigate' && isOfflinePage(url)) {
    event.respondWith(networkFirstPage(event, url));
  }
});

async function warm(pages, statics) {
  const cache = await caches.open(STATIC_CACHE);
  for (const href of statics) {
    try {
      const url = new URL(href, self.location.origin);
      if (!isStatic(url) || (await cache.match(url.href))) continue;
      const response = await fetch(url.href);
      if (cacheable(response)) await cache.put(url.href, response);
    } catch {
      // Mejor esfuerzo.
    }
  }
  for (const page of pages) {
    try {
      const url = new URL(page, self.location.origin);
      if (!isOfflinePage(url)) continue;
      await savePage(url.pathname, await fetch(url.href, { credentials: 'same-origin' }));
    } catch {
      // Sin red: se queda la anterior.
    }
  }
}

self.addEventListener('message', (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  const data = event.data || {};
  if (data.type === 'warm') {
    const pages = Array.isArray(data.pages) ? data.pages.filter((p) => typeof p === 'string') : [];
    const statics = Array.isArray(data.statics) ? data.statics.filter((s) => typeof s === 'string').slice(0, 300) : [];
    event.waitUntil(warm(pages, statics));
  }
});
