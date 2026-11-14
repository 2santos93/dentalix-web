import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PlatformView } from '@/components/platform/platform-view';
import { isClinicHost } from '@/lib/tenant';

/**
 * Área de PLATAFORMA, solo en el apex. En el host de una clínica no existe
 * (404): allí el visitante pertenece a un tenant y esta pantalla —que lista
 * TODAS las clínicas— no tiene sentido. El acceso real lo controla el backend
 * (`isPlatformAdmin` + PlatformAdminGuard); esto es solo enrutado.
 * DX-554-bis: host de clínica por la misma regla que «/» (`isClinicHost`):
 * también un dominio propio, que `parseTenantFromHost` no reconocía.
 */
export default async function AdminPage() {
  const h = await headers();
  if (h.get('x-tenant') || isClinicHost(h.get('host'))) notFound();
  return <PlatformView />;
}
