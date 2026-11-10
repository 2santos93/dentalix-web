'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canSearchImplantLots } from '@/lib/implants/implants-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { ImplantLotSearch } from '@/components/implants/implant-lot-search';

const copy = {
  title: 'Implantes',
  description:
    'Trazabilidad de los implantes colocados en la clínica: a quién llamar cuando un fabricante retira un lote.',
};

/** Ajustes → Implantes (DX-191): búsqueda por lote/REF y CSV. Solo ADMIN. */
export default function ImplantSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic" width="wide">
      <ImplantLotSearch
        token={accessToken}
        allowed={canSearchImplantLots(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}
