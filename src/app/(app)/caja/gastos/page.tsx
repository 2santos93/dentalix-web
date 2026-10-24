'use client';
import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ExpensesView } from '@/components/expenses/expenses-view';
import { ExpensesSummaryView } from '@/components/expenses/expenses-summary-view';
import {
  ExpensesTabs,
  expensesPanelId,
  expensesTabId,
  resolveExpensesTab,
  type ExpensesTabKey,
} from '@/components/expenses/expenses-tabs';

// Gastos de la sede (DX-274). Vive junto a la cartera y los descuentos (bajo
// /caja) con el mismo guard de sesión; un rol sin acceso que llegue por URL ve
// el aviso de la propia vista (la API responde 403 en español). La pestaña
// («Gastos» o «Resumen») viaja en `?tab=resumen`, como la Caja.
const copy = {
  checkingSession: 'Verificando sesión…',
};

/** `useSearchParams` exige un límite de Suspense (como la Caja). */
export default function GastosPage() {
  return (
    <Suspense fallback={null}>
      <GastosRoute />
    </Suspense>
  );
}

function GastosRoute() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = resolveExpensesTab(searchParams.get('tab'));
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) {
      router.replace('/login');
    }
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }

  if (!accessToken) {
    return null;
  }

  // Reescribe la pestaña SIN navegar (una sola entrada de historial).
  function changeTab(next: ExpensesTabKey) {
    router.replace(next === 'resumen' ? `${pathname}?tab=resumen` : pathname, {
      scroll: false,
    });
  }
  const tabs = {
    nav: <ExpensesTabs active={tab} onChange={changeTab} />,
    panelId: expensesPanelId(tab),
    tabId: expensesTabId(tab),
  };

  return tab === 'resumen' ? (
    <ExpensesSummaryView token={accessToken} tabs={tabs} />
  ) : (
    <ExpensesView token={accessToken} tabs={tabs} />
  );
}
