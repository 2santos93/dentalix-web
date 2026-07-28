import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LandingPage } from '@/components/marketing/landing-page';
import { parseTenantFromHost } from '@/lib/tenant';

/**
 * Raíz del sitio. En un host de tenant (`clinica.dentalix.app`) el visitante ya
 * pertenece a una clínica → va directo a /login. En el apex (dentalix.app) es
 * un prospecto → mostramos la landing de marketing.
 */
export default async function Home() {
  const h = await headers();
  const tenant = h.get('x-tenant') ?? parseTenantFromHost(h.get('host'));
  if (tenant) redirect('/login');
  return <LandingPage />;
}
