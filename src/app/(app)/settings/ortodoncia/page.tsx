'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageOrthoSettings } from '@/lib/ortho/ortho-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { OrthoSettingsSection } from '@/components/ortho/ortho-settings-section';

const copy = {
  title: 'Ortodoncia',
  description: 'Activar el caso de ortodoncia en la ficha y los calibres de arco del control.',
};

/** Ajustes de ortodoncia de la clínica (DX-190). Solo ADMIN. */
export default function OrthoSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;
  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <OrthoSettingsSection token={accessToken} allowed={canManageOrthoSettings(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}
