'use client';
import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PageHeader } from '@/components/shared/page-header';
import { LocationsComparisonView } from '@/components/reports/locations-comparison-view';
import {
  ReportsTabs,
  REPORT_TABS,
  reportPanelId,
  reportTabId,
  resolveReportTab,
  type ReportTabKey,
} from '@/components/reports/reports-tabs';

// «Reportes» (DX-014). Mismo guard de sesión que la Caja; la pestaña va en
// `?tab=` (la primera, sin parámetro). Un rol sin acceso que llegue por URL ve
// el aviso de la propia vista (la API responde 403): el menú solo enseña la
// entrada a la administración, pero la frontera es el servidor.
const copy = {
  checkingSession: 'Verificando sesión…',
  title: 'Reportes',
  description:
    'Cómo van tus sedes: producción, cobros, citas y ocupación de cada una frente a otro período.',
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
  const tab = resolveReportTab(searchParams.get('tab'));

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
    router.replace(next === REPORT_TABS[0].key ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <ReportsTabs active={tab} onChange={changeTab} />
      <div role="tabpanel" id={reportPanelId(tab)} aria-labelledby={reportTabId(tab)}>
        <LocationsComparisonView token={accessToken} />
      </div>
    </>
  );
}
