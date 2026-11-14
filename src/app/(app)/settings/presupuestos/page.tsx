'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageQuoteSettings } from '@/lib/treatment-plans/quote-settings-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { QuoteValiditySettingsSection } from '@/components/treatment-plans/quote-validity-settings';

const copy = {
  title: 'Presupuestos',
  description: 'Hasta qué día valen los precios de un presupuesto.',
};

/**
 * Ajustes de presupuestos (DX-379): cuántos días vale un presupuesto. La leen
 * todos los roles; solo ADMIN la cambia (la API también lo exige).
 */
export default function QuoteSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <QuoteValiditySettingsSection
        token={accessToken}
        allowed={canManageQuoteSettings(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}
