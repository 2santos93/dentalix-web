'use client';
import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PageHeader } from '@/components/shared/page-header';
import { getTokenRole } from '@/lib/auth/token-role';
import { LocationsComparisonView } from '@/components/reports/locations-comparison-view';
import { ProductionByProcedureView } from '@/components/reports/production-by-procedure-view';
import {
  ReportsTabs,
  reportPanelId,
  reportTabId,
  reportTabsFor,
  resolveReportTab,
  type ReportTabKey,
} from '@/components/reports/reports-tabs';

// «Reportes» (DX-014). Mismo guard de sesión que la Caja; la pestaña va en
// `?tab=` (la primera del rol, sin parámetro). Cada rol ve las pestañas que
// su API le deja abrir (DX-423: el odontólogo, solo «Producción por
// procedimiento»). Un rol sin acceso que llegue por URL ve el aviso de la
// propia vista (la API responde 403): la frontera es el servidor.
const copy = {
  checkingSession: 'Verificando sesión…',
  title: 'Reportes',
  description: 'Cómo van tus sedes: producción, cobros, citas y ocupación, y qué procedimientos sostienen la clínica.',
  descriptionOwn: 'Tu producción: qué procedimientos realizaste y a qué honorario frente al de catálogo.',
};

/** `useSearchParams` exige un límite de Suspense (como la Caja). */
export default function ReportesPage() {
  return (
    <Suspense fallback={null}>
      <ReportesRoute />
    </Suspense>
  );
}

function ReportesRoute() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const tabs = reportTabsFor(getTokenRole(accessToken));
  const tab = resolveReportTab(searchParams.get('tab'), tabs);

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
  function changeTab(next: ReportTabKey) {
    router.replace(next === tabs[0].key ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }

  const ownOnly = tabs.length === 1 && tabs[0].key === 'produccion';
  return (
    <>
      <PageHeader title={copy.title} description={ownOnly ? copy.descriptionOwn : copy.description} />
      <ReportsTabs active={tab} onChange={changeTab} tabs={tabs} />
      <div role="tabpanel" id={reportPanelId(tab)} aria-labelledby={reportTabId(tab)}>
        {tab === 'produccion' ? (
          <ProductionByProcedureView token={accessToken} />
        ) : (
          <LocationsComparisonView token={accessToken} />
        )}
      </div>
    </>
  );
}
