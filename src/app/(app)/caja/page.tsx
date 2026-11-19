'use client';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { CashRegisterView } from '@/components/payments/cash-register-view';
import { CashShiftsView } from '@/components/cash-sessions/cash-shifts-view';
import { PaymentReportsInboxView } from '@/components/payment-links/payment-reports-inbox-view';
import { BankReconciliationView } from '@/components/bank-reconciliation/bank-reconciliation-view';
import { canReconcile } from '@/lib/bank-reconciliation/bank-reconciliation-api';
import { canHandlePaymentLinks, countPendingPaymentReports } from '@/lib/payment-links/payment-links-api';
import { getTokenRole } from '@/lib/auth/token-role';
import { onLocationChange } from '@/lib/locations/location-store';
import {
  CashTabs,
  cashPanelId,
  cashTabId,
  resolveCashTab,
  type CashTabKey,
} from '@/components/cash-sessions/cash-tabs';

// Mismo guard de sesión que Inventario/Catálogo. Título y descripción los pinta
// cada vista en su `PageHeader`; la página resuelve la sesión y la pestaña
// (`?tab=turnos`, DX-027). Un rol sin acceso que llegue por URL ve el aviso de
// la propia vista (la API responde 403): el menú ya no le enseña la entrada,
// pero la frontera es el servidor.
/** `useSearchParams` exige un límite de Suspense (como la ficha del paciente). */
export default function CajaPage() {
  return (
    <Suspense fallback={null}>
      <CajaRoute />
    </Suspense>
  );
}

function CajaRoute() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const accessToken = useAuthStore((s) => s.accessToken);
  // DX-569: «Por confirmar» solo para quien cobra (PAYMENT_ROLES); otro rol cae en «Abonos».
  const role = getTokenRole(accessToken ?? '');
  const showReports = canHandlePaymentLinks(role);
  // DX-571: «Conciliación» solo para ADMIN; otro rol cae en «Abonos».
  const showReconciliation = canReconcile(role);
  const requested = resolveCashTab(searchParams.get('tab'));
  const tab =
    (requested === 'por-confirmar' && !showReports) || (requested === 'conciliacion' && !showReconciliation)
      ? 'abonos'
      : requested;
  const pendingReports = usePendingReportsCount(showReports ? accessToken : null);

  if (!accessToken) {
    return null;
  }

  // Reescribe la pestaña SIN navegar (una sola entrada de historial).
  function changeTab(next: CashTabKey) {
    router.replace(next === 'abonos' ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }
  const tabs = {
    nav: (
      <CashTabs
        active={tab}
        onChange={changeTab}
        showReports={showReports}
        pendingReports={pendingReports.count}
        showReconciliation={showReconciliation}
      />
    ),
    panelId: cashPanelId(tab),
    tabId: cashTabId(tab),
  };

  return tab === 'turnos' ? (
    <CashShiftsView token={accessToken} tabs={tabs} />
  ) : tab === 'conciliacion' ? (
    <BankReconciliationView token={accessToken} tabs={tabs} />
  ) : tab === 'por-confirmar' ? (
    <PaymentReportsInboxView token={accessToken} tabs={tabs} onChanged={pendingReports.reload} />
  ) : (
    <CashRegisterView token={accessToken} tabs={tabs} />
  );
}

/**
 * El contador de la pestaña «Por confirmar» (`GET /payment-reports/count`), en
 * la sede activa: se relee al cambiar de sede y tras confirmar o rechazar. Si
 * falla, la pestaña va sin número (la bandeja dice lo suyo al abrirla).
 */
function usePendingReportsCount(token: string | null): { count: number | null; reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; count: number | null } | null>(null);
  const key = `${token ?? ''}|${attempt}`;
  useEffect(() => onLocationChange(() => setAttempt((n) => n + 1)), []);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    countPendingPaymentReports(token)
      .then((res) => {
        if (!cancelled) setResult({ key, count: res.pending });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, count: null });
      });
    return () => {
      cancelled = true;
    };
  }, [token, key]);
  return { count: token && result?.key === key ? result.count : null, reload: () => setAttempt((n) => n + 1) };
}
