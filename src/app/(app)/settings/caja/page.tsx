'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageCashSessions } from '@/lib/cash-sessions/cash-sessions-api';
import { SettingsPage, SettingsSection } from '@/components/settings/settings-page';
import { CashSettingsForm } from '@/components/cash-sessions/cash-settings-form';
import { PaymentMethodsManager } from '@/components/payment-methods/payment-methods-manager';
import { canManagePaymentMethods } from '@/lib/payments/payment-methods-api';
import { ReceiptSettingsForm } from '@/components/payments/receipt-settings-form';
import { canManageReceiptSettings } from '@/lib/payments/receipt-settings-api';

const copy = {
  title: 'Caja',
  description:
    'Cómo se abre y se cierra la caja por turno, con qué medios se cobra y qué dice el recibo.',
  sessionsTitle: 'Turnos de caja',
  sessionsHint: 'Cada cambio se aplica al momento.',
  checkingSession: 'Verificando sesión…',
};

/** Ajustes de caja de la clínica (DX-027), sus medios de pago (DX-377) y su recibo (DX-515). Solo ADMIN. */
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
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <SettingsSection id="cash-settings-title" title={copy.sessionsTitle} description={copy.sessionsHint}>
        <CashSettingsForm token={accessToken} allowed={canManageCashSessions(getTokenRole(accessToken))} />
      </SettingsSection>
      {/* DX-377: catálogo de medios de pago de la clínica. */}
      <PaymentMethodsManager token={accessToken} allowed={canManagePaymentMethods(getTokenRole(accessToken))} />
      {/* DX-515: título y leyenda del recibo de caja (solo ADMIN). */}
      {canManageReceiptSettings(getTokenRole(accessToken)) ? <ReceiptSettingsForm token={accessToken} /> : null}
    </SettingsPage>
  );
}
