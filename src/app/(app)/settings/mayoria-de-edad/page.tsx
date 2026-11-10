'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManagePatientSettings } from '@/lib/patients/patient-settings-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { MajorityAgeSettingsSection } from '@/components/patients/majority-age-settings';

const copy = {
  title: 'Mayoría de edad',
  description: 'Desde qué edad un paciente recibe sus propios avisos.',
};

/** Ajustes de mayoría de edad de la clínica (DX-328). Solo ADMIN. */
export default function MajorityAgeSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <MajorityAgeSettingsSection
        token={accessToken}
        allowed={canManagePatientSettings(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}
