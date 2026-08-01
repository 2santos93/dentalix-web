import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PlatformView } from '@/components/platform/platform-view';
import { parseTenantFromHost } from '@/lib/tenant';

/**
 * Área de PLATAFORMA, solo en el apex. En el host de una clínica no existe
 * (404): allí el visitante pertenece a un tenant y esta pantalla —que lista
 * TODAS las clínicas— no tiene sentido. El acceso real lo controla el backend
 * (`isPlatformAdmin` + PlatformAdminGuard); esto es solo enrutado.
 */
export default async function AdminPage() {
  const h = await headers();
  const tenant = h.get('x-tenant') ?? parseTenantFromHost(h.get('host'));
  if (tenant) notFound();
  return <PlatformView />;
}
