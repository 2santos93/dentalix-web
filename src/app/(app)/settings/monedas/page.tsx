'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageCurrencyTexts } from '@/lib/exchange/currency-texts-api';
import { SettingsPage } from '@/components/settings/settings-page';
import { CurrencyTextsForm } from '@/components/currency-texts/currency-texts-form';

const copy = {
  title: 'Monedas',
  description: 'Cómo se escribe cada moneda en importes, recibos y mensajes. Sin texto propio, se usa su código.',
  checkingSession: 'Verificando sesión…',
};

/** Ajustes › Monedas (DX-517). Solo ADMIN: al resto, el estado bloqueado sin llamar a la API. */
export default function CurrencyTextsPage() {
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
      <CurrencyTextsForm token={accessToken} allowed={canManageCurrencyTexts(getTokenRole(accessToken))} />
    </SettingsPage>
  );
}
