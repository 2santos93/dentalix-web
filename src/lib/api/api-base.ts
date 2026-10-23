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

/**
 * Origen de las URL firmadas de los documentos del paciente (DX-151), que el
 * visor pinta en `<img>`/`<iframe>`, y de la subida directa (DX-259, el POST
 * prefirmado por XHR): el bucket (S3, R2, MinIO) si se configura
 * `NEXT_PUBLIC_FILES_ORIGIN`; si no (almacenamiento en disco), la propia API.
 * Un valor que no es una URL se ignora y cae en la API.
 */
export function filesOrigin(
  configured: string | undefined = process.env.NEXT_PUBLIC_FILES_ORIGIN,
  apiUrl: string = API_URL,
): string {
  if (configured?.trim()) {
    try {
      return new URL(configured.trim()).origin;
    } catch {
      /* mal configurada: la API */
    }
  }
  return apiOrigin(apiUrl);
}
