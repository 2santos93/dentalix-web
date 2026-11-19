'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageRecallTypes } from '@/lib/recall/recall-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { RecallTypesManager } from '@/components/recall-types/recall-types-manager';
import { RecallSettingsManager } from '@/components/recall/recall-settings-manager';

const copy = {
  title: 'Recall',
  description:
    'Los controles que la clínica pide a sus pacientes: cada cuánto vuelven, qué reinicia el plazo, qué se excluye y, por sede, cuántas veces se les llama.',
};

/**
 * Tipos de recall de la clínica (DX-015-bis) y, por sede, los intentos de
 * llamada (DX-465: días de ocultación y tope). Solo ADMIN.
 */
export default function RecallTypesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  const allowed = canManageRecallTypes(getTokenRole(accessToken));

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <RecallTypesManager token={accessToken} allowed={allowed} />
      {allowed ? <RecallSettingsManager token={accessToken} /> : null}
    </SettingsPage>
  );
}
