'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageQuoteSettings } from '@/lib/treatment-plans/quote-settings-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { QuoteValiditySettingsSection } from '@/components/treatment-plans/quote-validity-settings';

const copy = {
  title: 'Presupuestos',
  description: 'Hasta qué día valen los precios de un presupuesto.',
  checkingSession: 'Verificando sesión…',
};

/**
 * Ajustes de presupuestos (DX-379): cuántos días vale un presupuesto. La leen
 * todos los roles; solo ADMIN la cambia (la API también lo exige).
 */
export default function QuoteSettingsPage() {
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
      <QuoteValiditySettingsSection
        token={accessToken}
        allowed={canManageQuoteSettings(getTokenRole(accessToken))}
      />
    </SettingsPage>
  );
}
