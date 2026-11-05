'use client';
import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ReceivablesView } from '@/components/receivables/receivables-view';
import { CreditBalancesView } from '@/components/receivables/credit-balances-view';
import {
  CarteraTabs,
  carteraPanelId,
  carteraTabId,
  resolveCarteraTab,
  type CarteraTabKey,
} from '@/components/receivables/cartera-tabs';

// Cartera (DX-145): «Por cobrar» por antigüedad y, desde DX-430, «Saldo a
// favor». Mismo guard de sesión que la caja: la vista pinta su cabecera, y un
// rol sin acceso que llegue por URL ve el aviso de la propia vista (la API
// responde 403 en español). La pestaña viaja en `?tab=saldo-a-favor`, como la
// Caja y los gastos; sin ella, «Por cobrar» (la URL de siempre).
const copy = {
  checkingSession: 'Verificando sesión…',
};

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
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
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
  function changeTab(next: CarteraTabKey) {
    if (next === tab) return;
    const focused = document.activeElement;
    if (focused?.getAttribute('role') === 'tab' && focused.id.startsWith('cartera-tab-')) {
      pendingFocus.current = { tab: next, trigger: focused };
    }
    router.replace(next === 'saldo-a-favor' ? `${pathname}?tab=saldo-a-favor` : pathname, {
      scroll: false,
    });
  }
  const tabs = {
    nav: <CarteraTabs active={tab} onChange={changeTab} />,
    panelId: carteraPanelId(tab),
    tabId: carteraTabId(tab),
  };

  return tab === 'saldo-a-favor' ? (
    <CreditBalancesView token={accessToken} tabs={tabs} />
  ) : (
    <ReceivablesView token={accessToken} tabs={tabs} />
  );
}
