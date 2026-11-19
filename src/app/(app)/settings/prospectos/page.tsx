'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageLeadSettings } from '@/lib/leads/leads-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { LeadSettingsSections } from '@/components/leads/lead-settings';

const copy = {
  title: 'Prospectos',
  description: 'Los motivos de interés y de pérdida de los prospectos y cuánto se conservan los perdidos.',
};

/** Ajustes › Prospectos (DX-556). Solo ADMIN. */
export default function LeadSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return null;
  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <LeadSettingsSections token={accessToken} allowed={canManageLeadSettings(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}
