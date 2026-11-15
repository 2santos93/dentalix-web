'use client';
import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ReceivablesView } from '@/components/receivables/receivables-view';
import { CreditBalancesView } from '@/components/receivables/credit-balances-view';
import { BalanceRemindersView } from '@/components/receivables/balance-reminders-view';
import {
  CarteraTabs,
  carteraPanelId,
  carteraTabHref,
  carteraTabId,
  resolveCarteraTab,
  type CarteraTabKey,
} from '@/components/receivables/cartera-tabs';

// Cartera (DX-145): «Por cobrar» por antigüedad, «Por avisar hoy» (DX-146) y,
// desde DX-430, «Saldo a favor». Mismo guard de sesión que la caja: la vista
// pinta su cabecera, y un rol sin acceso que llegue por URL ve el aviso de la
// propia vista (la API responde 403 en español). La pestaña viaja en
// `?tab=por-avisar` o `?tab=saldo-a-favor`, como la Caja y los gastos; sin
// ella, «Por cobrar» (la URL de siempre).
/** `useSearchParams` exige un límite de Suspense (como la Caja). */
export default function CarteraPage() {
  return (
    <Suspense fallback={null}>
      <CarteraRoute />
    </Suspense>
  );
}

function CarteraRoute() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = resolveCarteraTab(searchParams.get('tab'));
  const accessToken = useAuthStore((s) => s.accessToken);
  const pendingFocus = useRef<{ tab: CarteraTabKey; trigger: Element } | null>(null);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || pending.tab !== tab) return;
    pendingFocus.current = null;
    // Las dos vistas desmontan sus pestañas al cambiar: devuelve el foco solo
    // si seguía en el disparador desmontado; quien ya avanzó conserva el suyo.
    if (document.activeElement === document.body || document.activeElement === pending.trigger) {
      document.getElementById(carteraTabId(tab))?.focus();
    }
  }, [tab]);

  if (!accessToken) {
    return null;
  }

  // Reescribe la pestaña SIN navegar (una sola entrada de historial).
  function changeTab(next: CarteraTabKey) {
    if (next === tab) return;
    const focused = document.activeElement;
    if (focused?.getAttribute('role') === 'tab' && focused.id.startsWith('cartera-tab-')) {
      pendingFocus.current = { tab: next, trigger: focused };
    }
    router.replace(carteraTabHref(pathname, next), { scroll: false });
  }
  const tabs = {
    nav: <CarteraTabs active={tab} onChange={changeTab} />,
    panelId: carteraPanelId(tab),
    tabId: carteraTabId(tab),
  };

  if (tab === 'saldo-a-favor') return <CreditBalancesView token={accessToken} tabs={tabs} />;
  if (tab === 'por-avisar') return <BalanceRemindersView token={accessToken} tabs={tabs} />;
  return <ReceivablesView token={accessToken} tabs={tabs} />;
}
