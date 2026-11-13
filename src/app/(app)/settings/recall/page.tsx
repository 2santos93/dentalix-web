'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageRecallTypes } from '@/lib/recall/recall-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { RecallTypesManager } from '@/components/recall-types/recall-types-manager';

const copy = {
  title: 'Recall',
  description:
    'Los controles que la clínica pide a sus pacientes: cada cuánto vuelven, qué procedimientos reinician el plazo y cuáles se excluyen entre sí.',
};

/** Tipos de recall de la clínica (DX-015-bis). Solo ADMIN. */
export default function RecallTypesPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <RecallTypesManager token={accessToken} allowed={canManageRecallTypes(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}
