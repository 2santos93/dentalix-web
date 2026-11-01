'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageSecurityPolicy } from '@/lib/auth/mfa-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { ClinicSecuritySettings } from '@/components/settings/clinic-security-settings';

const copy = {
  title: 'Seguridad de la clínica',
  description: 'Qué se exige para entrar a los datos de la clínica.',
  checkingSession: 'Verificando sesión…',
};

/** Política de seguridad de la clínica (DX-021): solo ADMIN (lo exige la API). */
export default function ClinicSecurityPage() {
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
      <ClinicSecuritySettings
        token={accessToken}
        allowed={canManageSecurityPolicy(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}
