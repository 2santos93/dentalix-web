'use client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageCashSessions } from '@/lib/cash-sessions/cash-sessions-api';
import { SettingsPage, SettingsSection } from '@/components/settings/settings-page';
import { CashSettingsForm } from '@/components/cash-sessions/cash-settings-form';
import { PaymentMethodsManager } from '@/components/payment-methods/payment-methods-manager';
import { canManagePaymentMethods, canReadPaymentMethods } from '@/lib/payments/payment-methods-api';
import { ReceiptSettingsForm } from '@/components/payments/receipt-settings-form';
import { CreditPolicyForm } from '@/components/patient-credit/credit-policy-form';
import { canManageCreditPolicy } from '@/lib/patient-credit/patient-credit-api';
import { canManageReceiptSettings } from '@/lib/payments/receipt-settings-api';
import { FinancialLockForm } from '@/components/financial-lock/financial-lock-form';
import { canManageFinancialLock } from '@/lib/financial-lock/financial-lock-api';

const copy = {
  title: 'Caja',
  description:
    'Cómo se abre y se cierra la caja por turno, con qué medios se cobra, qué dice el recibo y hasta qué día está cerrado el período contable.',
  sessionsTitle: 'Turnos de caja',
  sessionsHint: 'Cada cambio se aplica al momento.',
};

/** Ajustes de caja de la clínica (DX-027), sus medios de pago (DX-377) su recibo (DX-515), el tope de recepción del saldo a favor (DX-432) y el cierre contable (DX-091). Solo ADMIN. */
export default function CashSettingsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) return null;

  return (
    <SettingsPage title={copy.title} description={copy.description} scope="clinic">
      <SettingsSection id="cash-settings-title" title={copy.sessionsTitle} description={copy.sessionsHint}>
        <CashSettingsForm token={accessToken} allowed={canManageCashSessions(getTokenRole(accessToken))} />
      </SettingsSection>
      {/* DX-377: catálogo de medios de pago de la clínica. */}
      <PaymentMethodsManager
        token={accessToken}
        allowed={canReadPaymentMethods(getTokenRole(accessToken))}
        canEdit={canManagePaymentMethods(getTokenRole(accessToken))}
      />
      {/* DX-515: título y leyenda del recibo de caja (solo ADMIN). */}
      {canManageReceiptSettings(getTokenRole(accessToken)) ? <ReceiptSettingsForm token={accessToken} /> : null}
      {/* DX-432: tope de recepción del saldo a favor (solo ADMIN). */}
      {canManageCreditPolicy(getTokenRole(accessToken)) ? <CreditPolicyForm token={accessToken} /> : null}
      {/* DX-091: cierre contable de abonos, anulaciones y planes de cuotas (solo ADMIN). */}
      {canManageFinancialLock(getTokenRole(accessToken)) ? <FinancialLockForm token={accessToken} /> : null}
    </SettingsPage>
  );
}
