import { headers } from 'next/headers';
import { fetchBranding } from '@/lib/branding';
import { parseTenantFromHost } from '@/lib/tenant';
import type { AuthClinic } from './auth-layout';

/**
 * Tenant y clínica de la petición, para las páginas de acceso (server
 * components). En el apex, o si la clínica no tiene nombre, `clinic` es
 * `null` y `AuthLayout` titula con la tarea de la página.
 */
export async function authContext(): Promise<{ tenant: string | null; clinic: AuthClinic | null }> {
  const h = await headers();
  const host = h.get('host');
  const tenant = h.get('x-tenant') ?? parseTenantFromHost(host);
  const branding = await fetchBranding(tenant, host);
  return {
    tenant,
    clinic: branding.name ? { name: branding.name, logoUrl: branding.logoUrl } : null,
  };
}
