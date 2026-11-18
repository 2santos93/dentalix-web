'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { SettingsPage, SettingsSection } from '@/components/settings/settings-page';
import { ProfileView } from '@/components/profile/profile-view';
import { ChangePasswordForm } from '@/components/profile/change-password-form';
import { MfaSettings } from '@/components/profile/mfa-settings';
import { SessionList } from '@/components/sessions/session-list';
import { useLogout } from '@/components/profile/user-menu';

const copy = {
  title: 'Mi perfil',
  description: 'Tu nombre, tu foto, tu contraseña, la verificación en dos pasos y tus sesiones.',
  securityTitle: 'Seguridad',
  sessionsTitle: 'Sesiones',
  sessionsHelp:
    'Dónde tienes la sesión abierta en esta clínica. Si no reconoces un dispositivo, ciérralo y cambia tu contraseña.',
};

/**
 * Mi perfil (B6): en Ajustes → «Tu cuenta», con la plantilla de Ajustes. Una
 * sola acción primaria: el «Guardar» de la barra, que solo aparece cuando el
 * nombre cambió; la contraseña se cambia en su diálogo.
 */
export default function ProfilePage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { logout } = useLogout();

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description}>
      <ProfileView token={accessToken} />
      <SettingsSection title={copy.securityTitle}>
        <ChangePasswordForm token={accessToken} />
        <MfaSettings token={accessToken} />
      </SettingsSection>
      {/* DX-137: dónde está abierta la sesión, con «Este dispositivo» marcado. */}
      <SettingsSection title={copy.sessionsTitle} description={copy.sessionsHelp}>
        <SessionList mode="self" token={accessToken} onCloseCurrent={() => void logout()} />
      </SettingsSection>
    </SettingsPage>
  );
}
