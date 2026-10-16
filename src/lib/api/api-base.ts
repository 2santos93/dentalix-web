/**
 * Dónde está la API (DX-062).
 *
 * El NAVEGADOR la llama siempre por el MISMO origen de la web (`/api/v1` en el
 * host de la clínica), que `next.config.ts` reescribe hacia la API real. Así la
 * cookie HttpOnly del refresh es del host de la clínica: SameSite=Strict
 * funciona en cualquier despliegue (también con dominios propios de clínica,
 * que son otro "site" que la API) y la cookie de una clínica nunca viaja a
 * otra. El SERVIDOR (branding en el layout) la llama directamente.
 */
export const API_PROXY_PATH = '/api/v1';

/** URL absoluta de la API (`NEXT_PUBLIC_API_URL`), para el servidor y el proxy. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

/** Base de las peticiones: el proxy del mismo origen en el navegador. */
export function apiBaseUrl(): string {
  return typeof window === 'undefined' ? API_URL : API_PROXY_PATH;
}

/** Reglas de `rewrites()`: `/api/v1/*` del host de la clínica → la API. */
export function apiRewrites(apiUrl: string = API_URL): { source: string; destination: string }[] {
  return [{ source: `${API_PROXY_PATH}/:path*`, destination: `${apiUrl.replace(/\/+$/, '')}/:path*` }];
}

/** Origen de la API: sirve los logos y avatares (`img-src` de la CSP). */
export function apiOrigin(apiUrl: string = API_URL): string {
  return new URL(apiUrl).origin;
}
