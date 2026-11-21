'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canExportClinicData } from '@/lib/clinic-exports/clinic-exports-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { ClinicExportsManager } from '@/components/clinic-exports/clinic-exports-manager';

const copy = {
  title: 'Exportar datos',
  description:
    'Descarga todos los datos de la clínica para tener una copia propia o llevarlos a otro sistema.',
};

/** Exportación de los datos de la clínica (DX-053). Solo ADMIN. */
export default function ClinicExportSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return null;
  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <ClinicExportsManager token={accessToken} allowed={canExportClinicData(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}
