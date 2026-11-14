'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManagePatientLanguages } from '@/lib/patients/patient-languages';
import { SettingsPage } from '@/components/settings/settings-page';
import { PatientLanguagesSettingsSection } from '@/components/patients/patient-languages-settings';

const copy = {
  title: 'Idiomas de los pacientes',
  description: 'En qué idiomas se puede escribir a cada paciente.',
};

/** Ajustes › Idiomas de los pacientes (DX-497). Solo ADMIN. */
export default function PatientLanguagesSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <PatientLanguagesSettingsSection
        token={accessToken}
        allowed={canManagePatientLanguages(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}
