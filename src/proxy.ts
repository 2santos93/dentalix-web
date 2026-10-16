import { NextRequest, NextResponse } from 'next/server';
import { parseTenantFromHost } from './lib/tenant';
import { buildCsp, generateNonce } from './lib/security/csp';
import { apiOrigin } from './lib/api/api-base';

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
  const tenant = parseTenantFromHost(req.headers.get('host'));
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    apiOrigin: apiOrigin(),
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

// Todo salvo `/api` (se reescribe tal cual hacia la API), los estáticos de Next
// y el favicon.
export const config = {
  matcher: [{ source: '/((?!api/|_next/static|_next/image|favicon.ico).*)' }],
};
