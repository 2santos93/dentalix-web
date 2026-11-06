'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageAnamnesisSettings } from '@/lib/clinical/medical-alerts';
import { SettingsPage } from '@/components/settings/settings-page';
import { AnamnesisSettingsSection } from '@/components/clinical/anamnesis-settings';
import { canManageRetentionSettings } from '@/lib/patients/retention-settings-api';
import { ClinicalRecordRetentionSettingsSection } from '@/components/patients/clinical-record-retention-settings';
import { LicenseWarningSettingSection } from '@/components/clinical-notes/license-warning-setting';

const copy = {
  title: 'Historia clínica',
  description: 'Vigencia de la anamnesis, conservación de la historia clínica y aviso de registro profesional.',
  checkingSession: 'Verificando sesión…',
};

/** Ajustes de historia clínica de la clínica (DX-247, DX-540). Solo ADMIN. */
export default function ClinicalHistorySettingsPage() {
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
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <AnamnesisSettingsSection
        token={accessToken}
        allowed={canManageAnamnesisSettings(getTokenRole(accessToken))}
      />
      <ClinicalRecordRetentionSettingsSection
        token={accessToken}
        allowed={canManageRetentionSettings(getTokenRole(accessToken))}
      />
      {/* DX-540: aviso de registro profesional al firmar una evolución. */}
      <LicenseWarningSettingSection token={accessToken} allowed={getTokenRole(accessToken) === 'ADMIN'} />
    </SettingsPage>
  );
}
