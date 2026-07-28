'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PageHeader } from '@/components/molecules/page-header';
import { ProfileView } from '@/components/profile/profile-view';
import { ChangePasswordForm } from '@/components/profile/change-password-form';
import { Separator } from '@/components/ui/separator';

const copy = {
  title: 'Mi perfil',
  description: 'Gestiona tu nombre, tu foto y tu contraseña.',
  securityTitle: 'Seguridad',
  checkingSession: 'Verificando sesión…',
};

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
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <div className="flex flex-col gap-8">
        <ProfileView token={accessToken} />
        <div>
          <h2 className="mb-3 text-lg font-semibold text-ink">{copy.securityTitle}</h2>
          <Separator className="mb-4" />
          <ChangePasswordForm token={accessToken} />
        </div>
      </div>
    </>
  );
}
