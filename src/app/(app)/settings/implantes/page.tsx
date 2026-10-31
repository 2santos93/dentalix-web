'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canSearchImplantLots } from '@/lib/implants/implants-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { ImplantLotSearch } from '@/components/implants/implant-lot-search';

const copy = {
  title: 'Implantes',
  description:
    'Trazabilidad de los implantes colocados en la clínica: a quién llamar cuando un fabricante retira un lote.',
  checkingSession: 'Verificando sesión…',
};

/** Ajustes → Implantes (DX-191): búsqueda por lote/REF y CSV. Solo ADMIN. */
export default function ImplantSettingsPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) router.replace('/login');
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }
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
