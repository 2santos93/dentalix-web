import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ClinicEntry } from '@/components/auth/clinic-entry';
import { LandingPage } from '@/components/marketing/landing-page';
import { isClinicHost } from '@/lib/tenant';

/**
 * DX-554: ¿«/» es la entrada de una clínica? Lo es en cualquier host que no
 * sea el dominio principal (subdominio, dominio propio, `*.localhost`), o si
 * el proxy marcó el tenant (`x-tenant`, que deriva del mismo host).
 */
async function isClinicRoot(): Promise<boolean> {
  const h = await headers();
  return !!h.get('x-tenant') || isClinicHost(h.get('host'));
}

/** La puerta de la clínica no se indexa; la landing conserva los del layout. */
export async function generateMetadata(): Promise<Metadata> {
  return (await isClinicRoot()) ? { robots: { index: false, follow: false } } : {};
}

/**
 * Raíz del sitio. En el dominio principal (dentalix.app, www, localhost) el
 * visitante es un prospecto → la landing de marketing. En el host de una
 * clínica ya pertenece a ella → su entrada, que lo lleva al inicio si tiene
 * sesión o al login si no (DX-554: antes un dominio propio caía en la landing).
 */
export default async function Home() {
  if (await isClinicRoot()) return <ClinicEntry />;
  return <LandingPage />;
}
