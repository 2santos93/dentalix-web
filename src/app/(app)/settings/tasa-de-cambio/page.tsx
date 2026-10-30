'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageExchangeRates } from '@/lib/exchange/exchange-settings-api';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { ExchangeRateSettingsView } from '@/components/exchange/exchange-rate-settings';

const copy = {
  title: 'Tasa de cambio',
  description:
    'De dónde sale la tasa con la que se convierten los abonos en otra moneda, en todas las sedes de la clínica.',
  checkingSession: 'Verificando sesión…',
};

/**
 * Ajustes › Tasa de cambio (DX-374). Solo ADMIN: al resto se le enseña el
 * estado bloqueado sin llamar a la API, como en Mayoría de edad.
 */
export default function ExchangeRateSettingsPage() {
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
      <ExchangeRateSettingsView token={accessToken} allowed={canManageExchangeRates(getTokenRole(accessToken))} />
    </>
  );
}
