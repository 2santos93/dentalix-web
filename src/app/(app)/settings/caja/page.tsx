'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageCashSessions } from '@/lib/cash-sessions/cash-sessions-api';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from '@/components/ui/section-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { CashSettingsForm } from '@/components/cash-sessions/cash-settings-form';
import { PaymentMethodsManager } from '@/components/payment-methods/payment-methods-manager';
import { canManagePaymentMethods } from '@/lib/payments/payment-methods-api';

const copy = {
  title: 'Caja',
  description:
    'Cómo se abre y se cierra la caja por turno en todas las sedes de la clínica, y con qué medios de pago se cobra.',
  sessionsTitle: 'Turnos de caja',
  sessionsHint: 'Cada cambio se aplica al momento en todas las sedes.',
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
      {/* Columna de formulario de ajustes: 720px, alineada a la izquierda (no centrada). */}
      <div className="flex max-w-[720px] flex-col gap-10">
        <section aria-labelledby="cash-settings-title" className="flex flex-col gap-3">
          <SectionHeader titleId="cash-settings-title" title={copy.sessionsTitle} description={copy.sessionsHint} />
          <CashSettingsForm token={accessToken} allowed={canManageCashSessions(getTokenRole(accessToken))} />
        </section>
        {/* DX-377: catálogo de medios de pago de la clínica. */}
        <PaymentMethodsManager token={accessToken} allowed={canManagePaymentMethods(getTokenRole(accessToken))} />
      </div>
    </>
  );
}
