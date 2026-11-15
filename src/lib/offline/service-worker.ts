/**
 * Service worker propio y mínimo (DX-405, `public/sw.js`). Solo hace dos
 * cosas: guardar los estáticos de Next (`/_next/static/*`, con hash: no
 * cambian) y la página `/agenda` (red primero, la guardada sin red), para que
 * la agenda abra sin conexión. Nunca toca `/api/*`: los datos de la agenda van
 * cifrados aparte (`offline-vault.ts`), no en la caché HTTP.
 *
 * Solo se registra en producción (`next build` + `next start`, lo que corre la
 * E2E de la CI): con `next dev` guardaría trozos de desarrollo que cambian en
 * cada edición.
 */
export const SW_URL = '/sw.js';
/** Mismo nombre que `PAGES_CACHE` de `public/sw.js` (lo comprueba su test). */
export const SW_PAGES_CACHE = 'dentalix-pages-v1';
/** Páginas que se guardan para abrir sin conexión. */
export const OFFLINE_PAGES = ['/agenda'] as const;

function supported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext;
}

export function serviceWorkerEnabled(): boolean {
  return process.env.NODE_ENV === 'production' && supported();
}

export async function registerServiceWorker(): Promise<void> {
  if (!serviceWorkerEnabled()) return;
  try {
    await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  } catch {
    // Sin service worker la app funciona igual; solo no abre sin conexión.
  }
}

/**
 * Pide al service worker que guarde ya lo que hace falta para abrir la agenda
 * sin red: los estáticos que esta página cargó antes de que él la
 * controlara, y `/agenda` (aunque se llegara por navegación del cliente).
 */
export async function warmOfflinePages(): Promise<void> {
  if (!serviceWorkerEnabled()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const statics = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((name) => {
        try {
          const url = new URL(name);
          return url.origin === location.origin && url.pathname.startsWith('/_next/static/');
        } catch {
          return false;
        }
      });
    registration.active?.postMessage({ type: 'warm', pages: [...OFFLINE_PAGES], statics });
  } catch {
    // Mejor esfuerzo.
  }
}

/** Al cerrar sesión: fuera las páginas guardadas. */
export async function forgetOfflinePages(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(SW_PAGES_CACHE);
  } catch {
    // Nada que borrar.
  }
}
