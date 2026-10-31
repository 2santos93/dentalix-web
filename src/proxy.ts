import { NextRequest, NextResponse } from 'next/server';
import { parseTenantFromHost } from './lib/tenant';
import { buildCsp, generateNonce } from './lib/security/csp';
import {
  API_PROXY_MAX_BODY_BYTES,
  API_PROXY_PATH,
  apiOrigin,
  apiProxyDestination,
  apiUrl,
  filesOrigin,
} from './lib/api/api-base';

/** Cuerpo del 413 con el formato de errores de la API (DX-259). */
export const API_BODY_TOO_LARGE = {
  statusCode: 413,
  error: 'Payload Too Large',
  message: 'La petición es demasiado grande.',
};

/**
 * `/api/v1/*` del host de la clínica → la API (DX-062). Aquí y no en
 * `rewrites()` de next.config (DX-083, OPS-041): esas reglas se fijan al
 * compilar (routes-manifest), y así la URL de la API (`API_URL`) se lee en
 * RUNTIME y la misma imagen sirve contra cualquier API. Next reenvía la
 * reescritura externa igual que un rewrite (mismo proxy, `X-Forwarded-Host`
 * con el host de la clínica, tope de cuerpo `proxyClientMaxBodySize`).
 *
 * DX-259 (OPS-038): una petición con más cuerpo del que Next copia
 * (`API_PROXY_MAX_BODY_BYTES`, 1 MB) se rechaza antes con 413, por su
 * `Content-Length` y sin leer el cuerpo. Sin esto Next copiaba el primer MB,
 * lo reenviaba con el `Content-Length` original, la API cortaba la conexión
 * al ver el tamaño y el cliente recibía un 500. Un cuerpo sin
 * `Content-Length` (chunked) no se rechaza aquí: Next copia como mucho 1 MB y
 * la API lo rechaza igual.
 */
function proxyToApi(req: NextRequest): NextResponse {
  const length = Number(req.headers.get('content-length'));
  if (Number.isFinite(length) && length > API_PROXY_MAX_BODY_BYTES) {
    return NextResponse.json(API_BODY_TOO_LARGE, { status: 413, headers: { Connection: 'close' } });
  }
  return NextResponse.rewrite(apiProxyDestination(req.nextUrl, apiUrl()));
}

/**
 * DX-099: el cuestionario de salud del paciente (`/anamnesis/<token>`) lleva el
 * token en la URL y datos de salud en la página: ni se manda el Referer a
 * terceros (el logo de la clínica en otro dominio), ni se guarda en cachés, ni
 * se indexa. Van en la respuesta, además de los metadatos de la página.
 * DX-243: lo mismo para la firma a distancia (`/firmar/<token>`), que tras el
 * código muestra el consentimiento.
 */
export const HEALTH_FORM_HEADERS: Record<string, string> = {
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

const HEALTH_FORM_PREFIXES = ['/anamnesis', '/firmar'];

function isHealthFormPath(pathname: string): boolean {
  return HEALTH_FORM_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Proxy de Next 16 (antes `middleware.ts`). En cada página:
 *
 * 1. `x-tenant`: el tenant derivado del host, para los Server Components
 *    (layout.tsx vía `headers()`). Se descarta el que mande el cliente.
 * 2. CSP con un nonce nuevo por petición (DX-062). Va en la RESPUESTA (la
 *    aplica el navegador) y en la PETICIÓN (Next extrae el nonce de ahí y lo
 *    pone en sus scripts); `x-nonce` lo expone a quien lo necesite (el script
 *    de next-themes en el layout).
 */
export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith(`${API_PROXY_PATH}/`)) return proxyToApi(req);
  const tenant = parseTenantFromHost(req.headers.get('host'));
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    apiOrigin: apiOrigin(),
    filesOrigin: filesOrigin(),
  });

  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete('x-tenant');
  if (tenant) requestHeaders.set('x-tenant', tenant);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('content-security-policy', csp);
  if (isHealthFormPath(req.nextUrl.pathname)) {
    for (const [key, value] of Object.entries(HEALTH_FORM_HEADERS)) res.headers.set(key, value);
  }
  return res;
}

// Las páginas: todo salvo `/api` (la API va por la segunda regla, y
// `/api/import-upload/*`, la subida de la importación de pacientes, NO debe
// pasar por aquí: Next copiaría su cuerpo en memoria y lo cortaría en 1 MB;
// ver `import-upload-proxy.ts`), los estáticos de Next y el favicon. Y
// `/api/v1/*` entero (DX-083): aquí se reescribe hacia la API en runtime.
export const config = {
  matcher: [
    { source: '/((?!api/|_next/static|_next/image|favicon.ico).*)' },
    { source: '/api/v1/:path*' },
  ],
};
