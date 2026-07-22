import { NextRequest, NextResponse } from 'next/server';
import { parseTenantFromHost } from './lib/tenant';

export function middleware(req: NextRequest) {
  const tenant = parseTenantFromHost(req.headers.get('host'));
  // Forward on the REQUEST headers (not the response) so Server Components
  // downstream (e.g. layout.tsx via `headers()`) can read `x-tenant`.
  // Setting it on the response only reaches the browser/client, never RSC.
  const requestHeaders = new Headers(req.headers);
  // Strip any client-supplied x-tenant first (trust boundary): only the value we
  // derive from the host is trustworthy. Then set ours when the host has a tenant.
  requestHeaders.delete('x-tenant');
  if (tenant) requestHeaders.set('x-tenant', tenant);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
