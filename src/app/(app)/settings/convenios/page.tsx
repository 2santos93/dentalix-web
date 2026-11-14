'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageAgreements } from '@/lib/agreements/agreements-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { AgreementsManager } from '@/components/agreements/agreements-manager';

const copy = {
  title: 'Convenios',
  description:
    'Condiciones pactadas con un pagador: un descuento porcentual o una lista de precios propia. Se asignan al paciente desde su ficha y fijan el precio al añadir un procedimiento a su plan.',
};

/** Gestión de convenios con pagadores (DX-105). Solo ADMIN. */
export default function AgreementsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic" width="wide">
      <AgreementsManager
        token={accessToken}
        allowed={canManageAgreements(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}
