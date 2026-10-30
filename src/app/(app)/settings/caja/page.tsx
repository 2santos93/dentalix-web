'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageCashSessions } from '@/lib/cash-sessions/cash-sessions-api';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { CashSettingsForm } from '@/components/cash-sessions/cash-settings-form';
import { PaymentMethodsManager } from '@/components/payment-methods/payment-methods-manager';
import { canManagePaymentMethods } from '@/lib/payments/payment-methods-api';

const copy = {
  title: 'Caja',
  description:
    'Cómo se abre y se cierra la caja por turno en todas las sedes de la clínica, y con qué medios de pago se cobra.',
  checkingSession: 'Verificando sesión…',
};

/** Ajustes de caja de la clínica (DX-027) y sus medios de pago (DX-377). Solo ADMIN. */
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
      <div className="flex flex-col gap-8">
        <CashSettingsForm token={accessToken} allowed={canManageCashSessions(getTokenRole(accessToken))} />
        {/* DX-377: catálogo de medios de pago de la clínica. */}
        <PaymentMethodsManager token={accessToken} allowed={canManagePaymentMethods(getTokenRole(accessToken))} />
      </div>
    </>
  );
}
