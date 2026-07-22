import { NextRequest, NextResponse } from 'next/server';
import { parseTenantFromHost } from './lib/tenant';

export function middleware(req: NextRequest) {
  const tenant = parseTenantFromHost(req.headers.get('host'));
  const res = NextResponse.next();
  if (tenant) res.headers.set('x-tenant', tenant);
  return res;
}

export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
