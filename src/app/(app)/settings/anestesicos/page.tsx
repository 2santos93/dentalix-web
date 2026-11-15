'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageAnestheticCatalog } from '@/lib/anesthesia/anesthesia-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { AnestheticsManager } from '@/components/anesthesia/anesthetics-manager';

const copy = {
  title: 'Anestésicos',
  description:
    'Los anestésicos que se eligen al registrar una anestesia, con los valores que usa el cálculo de la dosis máxima.',
};

/**
 * Ajustes › Anestésicos (DX-408). Solo ADMIN edita el catálogo (DX-307); otro
 * rol ve un aviso y la pantalla no pide nada a la API.
 */
export default function AnestheticsSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic" width="wide">
      <AnestheticsManager token={accessToken} allowed={canManageAnestheticCatalog(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}
