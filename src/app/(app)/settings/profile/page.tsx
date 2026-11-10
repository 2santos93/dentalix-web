'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { SettingsPage, SettingsSection } from '@/components/settings/settings-page';
import { ProfileView } from '@/components/profile/profile-view';
import { ChangePasswordForm } from '@/components/profile/change-password-form';
import { MfaSettings } from '@/components/profile/mfa-settings';

const copy = {
  title: 'Mi perfil',
  description: 'Tu nombre, tu foto, tu contraseña y la verificación en dos pasos.',
  securityTitle: 'Seguridad',
};

/**
 * Mi perfil (B6): en Ajustes → «Tu cuenta», con la plantilla de Ajustes. Una
 * sola acción primaria: el «Guardar» de la barra, que solo aparece cuando el
 * nombre cambió; la contraseña se cambia en su diálogo.
 */
export default function ProfilePage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description}>
      <ProfileView token={accessToken} />
      <SettingsSection title={copy.securityTitle}>
        <ChangePasswordForm token={accessToken} />
        <MfaSettings token={accessToken} />
      </SettingsSection>
    </SettingsPage>
  );
}
