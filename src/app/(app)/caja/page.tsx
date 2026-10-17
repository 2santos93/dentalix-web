'use client';
import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { CashRegisterView } from '@/components/payments/cash-register-view';
import { CashShiftsView } from '@/components/cash-sessions/cash-shifts-view';
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
const copy = {
  checkingSession: 'Verificando sesión…',
};

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
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const tab = resolveCashTab(searchParams.get('tab'));

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
  function changeTab(next: CashTabKey) {
    router.replace(next === 'turnos' ? `${pathname}?tab=turnos` : pathname, { scroll: false });
  }
  const tabs = {
    nav: <CashTabs active={tab} onChange={changeTab} />,
    panelId: cashPanelId(tab),
    tabId: cashTabId(tab),
  };

  return tab === 'turnos' ? (
    <CashShiftsView token={accessToken} tabs={tabs} />
  ) : (
    <CashRegisterView token={accessToken} tabs={tabs} />
  );
}
