'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManagePatientSources } from '@/lib/patients/patient-sources-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { PatientSourcesManager } from '@/components/patients/patient-sources-manager';

const copy = {
  title: 'Origen de pacientes',
  description:
    'Las opciones de «¿Cómo nos conoció?» al dar de alta un paciente, para saber qué canales traen pacientes.',
};

/** Ajustes › Origen de pacientes (DX-172). Solo ADMIN. */
export default function PatientSourcesSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return null;
  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <PatientSourcesManager token={accessToken} allowed={canManagePatientSources(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}
