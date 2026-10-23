'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageCashSessions } from '@/lib/cash-sessions/cash-sessions-api';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { CashSettingsForm } from '@/components/cash-sessions/cash-settings-form';

const copy = {
  title: 'Caja',
  description: 'Cómo se abre y se cierra la caja por turno en todas las sedes de la clínica.',
  checkingSession: 'Verificando sesión…',
};

/** Ajustes de caja de la clínica (DX-027). Solo ADMIN. */
export default function CashSettingsPage() {
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
    <>
      <PageHeader back={SETTINGS_BACK} title={copy.title} description={copy.description} />
      <CashSettingsForm token={accessToken} allowed={canManageCashSessions(getTokenRole(accessToken))} />
    </>
  );
}
