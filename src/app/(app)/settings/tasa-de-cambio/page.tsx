'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageExchangeRates } from '@/lib/exchange/exchange-settings-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { ExchangeRateSettingsView } from '@/components/exchange/exchange-rate-settings';

const copy = {
  title: 'Tasa de cambio',
  description:
    'De dónde sale la tasa con la que se convierten los abonos en otra moneda.',
};

/**
 * Ajustes › Tasa de cambio (DX-374). Solo ADMIN: al resto se le enseña el
 * estado bloqueado sin llamar a la API, como en Mayoría de edad.
 */
export default function ExchangeRateSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <ExchangeRateSettingsView token={accessToken} allowed={canManageExchangeRates(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}
