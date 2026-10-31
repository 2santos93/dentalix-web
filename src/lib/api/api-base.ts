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

/**
 * Tope del cuerpo que el proxy de Next copia en memoria al reenviar
 * `/api/v1/*` a la API (DX-259, OPS-038): 1 MB. Vale para TODAS las peticiones
 * del rewrite, también las anónimas (el JWT y el rate limit están en la API,
 * detrás), así que tiene que ser pequeño: con 25 MB (DX-151), unas decenas de
 * POST anónimos grandes llevaban el proceso de la web a OOM.
 *
 * Next no rechaza lo que pasa del tope: lo corta y reenvía solo el primer MB
 * con el `Content-Length` original, y la API lo rechaza (413) sin leerlo.
 * Nada legítimo se acerca: los documentos del paciente van directos al bucket
 * (POST prefirmado, `patient-documents-api.ts`), el avatar se reduce en el
 * navegador (`me-api.ts`), el archivo de la importación de pacientes (hasta
 * 5 MB, DX-107) va por su propia ruta de la web, fuera de este rewrite, en
 * streaming (`import-upload-proxy.ts`), y el cuerpo más grande que queda, la
 * firma de un consentimiento, son 700 KB. Este tope es GLOBAL en Next (no hay
 * uno por ruta): no se sube para una ruta concreta.
 */
export const API_PROXY_MAX_BODY_BYTES = 1024 * 1024;

/** API de desarrollo (`npm run start:dev` de dentalix-api), si no hay `API_URL`. */
export const DEV_API_URL = 'http://localhost:3000/api/v1';

/**
 * URL absoluta de la API, leída en RUNTIME de la variable de SERVIDOR `API_URL`
 * (DX-083, OPS-041): la misma imagen de la web sirve en staging y en
 * producción cambiando solo esa variable. No es `NEXT_PUBLIC_*` a propósito:
 * esas se incrustan al compilar. La usan el proxy `/api/v1` (`proxy.ts`), el
 * SSR (branding) y la subida de la importación; el navegador nunca la ve.
 * Fuera de producción, sin variable, la API local; en producción la web no
 * arranca sin una URL válida (`assertRuntimeConfig`, desde instrumentation.ts).
 */
export function apiUrl(env: Partial<Record<string, string>> = process.env): string {
  return env.API_URL?.trim() || DEV_API_URL;
}

/** Base de las peticiones: el proxy del mismo origen en el navegador. */
export function apiBaseUrl(): string {
  return typeof window === 'undefined' ? apiUrl() : API_PROXY_PATH;
}

/**
 * Destino en la API de una petición a `/api/v1/*` del host de la clínica
 * (lo que antes hacía `rewrites()` de next.config, que se fija al compilar).
 * Conserva la ruta y la query; tolera una barra final en la URL de la API.
 */
export function apiProxyDestination(url: URL, base: string = apiUrl()): URL {
  const rest = url.pathname.slice(API_PROXY_PATH.length);
  return new URL(`${base.replace(/\/+$/, '')}${rest}${url.search}`);
}

/** Origen de la API: sirve los logos y avatares (`img-src` de la CSP). */
export function apiOrigin(base: string = apiUrl()): string {
  return new URL(base).origin;
}

/**
 * Origen de las URL firmadas de los documentos del paciente (DX-151), que el
 * visor pinta en `<img>`/`<iframe>`, y de la subida directa (DX-259, el POST
 * prefirmado por XHR): el bucket (S3, R2, MinIO) si se configura la variable
 * de servidor `FILES_ORIGIN` (en runtime, DX-083); si no (almacenamiento en
 * disco), la propia API. Un valor que no es una URL se ignora y cae en la API.
 */
export function filesOrigin(
  configured: string | undefined = process.env.FILES_ORIGIN,
  base: string = apiUrl(),
): string {
  if (configured?.trim()) {
    try {
      return new URL(configured.trim()).origin;
    } catch {
      /* mal configurada: la API */
    }
  }
  return apiOrigin(base);
}

/** URL http(s) absoluta, o null. */
function httpUrl(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * OPS-024: en producción la web NO arranca sin `API_URL` válida (http/https
 * absoluta), ni con un `FILES_ORIGIN` que no sea una URL: sin esto, un
 * despliegue mal configurado servía páginas que llamaban a `localhost`. Fuera
 * de producción no exige nada (defaults de desarrollo).
 */
export function assertRuntimeConfig(env: Partial<Record<string, string>> = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  if (!httpUrl(env.API_URL)) {
    throw new Error(
      'Falta API_URL o no es una URL http(s) válida (p. ej. https://api.dentalix.app/api/v1). La web no arranca en producción sin ella.',
    );
  }
  if (env.FILES_ORIGIN?.trim() && !httpUrl(env.FILES_ORIGIN)) {
    throw new Error('FILES_ORIGIN no es una URL http(s) válida (p. ej. https://archivos.dentalix.app).');
  }
}
