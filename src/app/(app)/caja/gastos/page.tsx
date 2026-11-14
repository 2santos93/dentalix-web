'use client';
import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ExpensesView } from '@/components/expenses/expenses-view';
import { ExpensesSummaryView } from '@/components/expenses/expenses-summary-view';
import { ExpensesPayablesView } from '@/components/expenses/expenses-payables-view';
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
// («Gastos», «Por proveedor» o «Resumen») viaja en `?tab=`, como la Caja.
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
  const pendingFocus = useRef<{ tab: ExpensesTabKey; trigger: Element } | null>(null);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || pending.tab !== tab) return;
    pendingFocus.current = null;
    // Las dos vistas tienen cabeceras distintas y desmontan sus pestañas al
    // cambiar. Devuelve el foco solo si seguía en el disparador desmontado;
    // una persona que ya avanzó a otro control conserva su foco.
    if (document.activeElement === document.body || document.activeElement === pending.trigger) {
      document.getElementById(expensesTabId(tab))?.focus();
    }
  }, [tab]);

  if (!accessToken) {
    return null;
  }

  // Reescribe la pestaña SIN navegar (una sola entrada de historial).
  function changeTab(next: ExpensesTabKey) {
    if (next === tab) return;
    const focused = document.activeElement;
    if (focused?.getAttribute('role') === 'tab' && focused.id.startsWith('expenses-tab-')) {
      pendingFocus.current = { tab: next, trigger: focused };
    }
    router.replace(next === 'gastos' ? pathname : `${pathname}?tab=${next}`, {
      scroll: false,
    });
  }
  const tabs = {
    nav: <ExpensesTabs active={tab} onChange={changeTab} />,
    panelId: expensesPanelId(tab),
    tabId: expensesTabId(tab),
  };

  if (tab === 'resumen') return <ExpensesSummaryView token={accessToken} tabs={tabs} />;
  if (tab === 'proveedores') return <ExpensesPayablesView token={accessToken} tabs={tabs} />;
  return <ExpensesView token={accessToken} tabs={tabs} onShowPayables={() => changeTab('proveedores')} />;
}
