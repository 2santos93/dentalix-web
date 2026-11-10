'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageCurrencyTexts } from '@/lib/exchange/currency-texts-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { CurrencyTextsForm } from '@/components/currency-texts/currency-texts-form';
import { CatalogCurrencySetting } from '@/components/catalog-currency/catalog-currency-setting';

const copy = {
  title: 'Monedas',
  description: 'Cómo se escribe cada moneda en importes, recibos y mensajes, y en qué moneda está el catálogo de precios.',
};

/**
 * Ajustes › Monedas (DX-517) y la moneda del catálogo (DX-502-bis). Solo
 * ADMIN: al resto, el estado bloqueado sin llamar a la API.
 */
export default function CurrencyTextsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  const allowed = canManageCurrencyTexts(getTokenRole(accessToken));
  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <CurrencyTextsForm token={accessToken} allowed={allowed} />
      {allowed ? <CatalogCurrencySetting token={accessToken} /> : null}
    </SettingsPage>
  );
}
