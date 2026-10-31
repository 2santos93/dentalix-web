'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { SettingsPage, SettingsSection } from '@/components/settings/settings-page';
import { ProfileView } from '@/components/profile/profile-view';
import { ChangePasswordForm } from '@/components/profile/change-password-form';

const copy = {
  title: 'Mi perfil',
  description: 'Tu nombre, tu foto y tu contraseña.',
  securityTitle: 'Seguridad',
  checkingSession: 'Verificando sesión…',
};

/**
 * Mi perfil (B6): en Ajustes → «Tu cuenta», con la plantilla de Ajustes. Una
 * sola acción primaria: el «Guardar» de la barra, que solo aparece cuando el
 * nombre cambió; la contraseña se cambia en su diálogo.
 */
export default function ProfilePage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) router.replace('/login');
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return <p role="status" className="text-sm text-muted">{copy.checkingSession}</p>;
  }
  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description}>
      <ProfileView token={accessToken} />
      <SettingsSection title={copy.securityTitle}>
        <ChangePasswordForm token={accessToken} />
      </SettingsSection>
    </SettingsPage>
  );
}
