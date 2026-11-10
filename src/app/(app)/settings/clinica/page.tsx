'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageClinicSettings } from '@/lib/clinic/clinic-settings-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { ClinicSettingsForm } from '@/components/clinic-settings/clinic-settings-form';

const copy = {
  title: 'Datos de la clínica',
  description: 'Cómo se ve tu clínica en Dentalix y qué datos salen en recibos, presupuestos, recetas y estados de cuenta.',
};

/** Ajustes › Datos de la clínica (DX-019). Solo ADMIN: al resto, el estado bloqueado sin llamar a la API. */
export default function ClinicSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <ClinicSettingsForm token={accessToken} allowed={canManageClinicSettings(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}
