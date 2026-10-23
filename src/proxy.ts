import { NextRequest, NextResponse } from 'next/server';
import { parseTenantFromHost } from './lib/tenant';
import { buildCsp, generateNonce } from './lib/security/csp';
import { API_PROXY_MAX_BODY_BYTES, API_PROXY_PATH, apiOrigin, filesOrigin } from './lib/api/api-base';

/** Cuerpo del 413 con el formato de errores de la API (DX-259). */
export const API_BODY_TOO_LARGE = {
  statusCode: 413,
  error: 'Payload Too Large',
  message: 'La petición es demasiado grande.',
};

/**
 * DX-259 (OPS-038): una petición a `/api/v1/*` con más cuerpo del que el
 * rewrite copia (`API_PROXY_MAX_BODY_BYTES`, 1 MB) se rechaza aquí con 413,
 * antes de llamar a la API y por su `Content-Length`, sin leer el cuerpo. Sin
 * esto Next copiaba el primer MB, lo reenviaba con el `Content-Length`
 * original, la API cortaba la conexión al ver el tamaño y el cliente recibía
 * un 500. Un cuerpo sin `Content-Length` (chunked) no pasa por aquí: Next
 * copia como mucho 1 MB y la API lo rechaza igual.
 */
function guardApiBody(req: NextRequest): NextResponse {
  const length = Number(req.headers.get('content-length'));
  if (Number.isFinite(length) && length > API_PROXY_MAX_BODY_BYTES) {
    return NextResponse.json(API_BODY_TOO_LARGE, { status: 413, headers: { Connection: 'close' } });
  }
  return NextResponse.next();
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
  if (req.nextUrl.pathname.startsWith(`${API_PROXY_PATH}/`)) return guardApiBody(req);
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
  return res;
}

// Las páginas: todo salvo `/api` (se reescribe tal cual hacia la API, y
// `/api/import-upload/*`, la subida de la importación de pacientes, que NO
// debe pasar por aquí: Next copiaría su cuerpo en memoria y lo cortaría en
// 1 MB; ver `import-upload-proxy.ts`), los
// estáticos de Next y el favicon. Y (DX-259) `/api/v1/*` solo cuando la
// petición trae cuerpo (`Content-Length`), para el tope de 1 MB: los GET a la
// API no pasan por aquí.
export const config = {
  matcher: [
    { source: '/((?!api/|_next/static|_next/image|favicon.ico).*)' },
    { source: '/api/v1/:path*', has: [{ type: 'header', key: 'content-length' }] },
  ],
};
