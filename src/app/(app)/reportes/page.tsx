'use client';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Percent } from 'lucide-react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { COMMISSIONS_HREF, canViewCommissions } from '@/lib/commissions/commissions-api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { getTokenRole } from '@/lib/auth/token-role';
import { canViewFinancialReports, useEffectivePermissions } from '@/lib/auth/permissions';
import { LocationsComparisonView } from '@/components/reports/locations-comparison-view';
import { ProductionByProcedureView } from '@/components/reports/production-by-procedure-view';
import { RecoveredSlotsView } from '@/components/reports/recovered-slots-view';
import { ChairOccupancyView } from '@/components/reports/chair-occupancy-view';
import { PatientLinksView } from '@/components/reports/patient-links-view';
import { ProfitabilityView } from '@/components/reports/profitability-view';
import { UnallocatedPaymentsView } from '@/components/reports/unallocated-payments-view';
import { SectionSkeleton } from '@/components/shared/async-section';
import {
  ReportsTabs,
  reportPanelId,
  reportTabId,
  reportTabsFor,
  resolveReportTab,
  type ReportTabKey,
} from '@/components/reports/reports-tabs';

// DX-558: «Presupuestos» llega en su propio trozo de JS al abrir la pestaña
// (patrón de `patient-lazy-tabs`); las demás vistas siguen en la carga de la página.
const QuoteFunnelView = dynamic(
  () => import('@/components/reports/quote-funnel-view').then((m) => m.QuoteFunnelView),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

// DX-567: «Previsión», igual.
const ScheduledProductionView = dynamic(
  () => import('@/components/reports/scheduled-production-view').then((m) => m.ScheduledProductionView),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

// DX-172: «Captación», igual.
const AcquisitionView = dynamic(
  () => import('@/components/reports/acquisition-view').then((m) => m.AcquisitionView),
  { ssr: false, loading: () => <SectionSkeleton /> },
);

// «Reportes» (DX-014). Mismo guard de sesión que la Caja; la pestaña va en
// `?tab=` (la primera del rol, sin parámetro). Cada rol ve las pestañas que
// su API le deja abrir (DX-423 y DX-558: el odontólogo, «Producción por
// procedimiento» y «Presupuestos», los dos solo con lo suyo; DX-399: recepción, solo «Cobrado sin imputar»). Un rol sin acceso que llegue por URL ve el aviso de la
// propia vista (la API responde 403): la frontera es el servidor.
const copy = {
  title: 'Reportes',
  description: 'Cómo van tus sedes: producción, cobros, rentabilidad, citas y ocupación, y qué procedimientos sostienen la clínica.',
  descriptionOwn:
    'Solo lo tuyo: qué procedimientos realizaste y a qué honorario frente al de catálogo, qué pasó con los presupuestos que elaboraste y cuánto tienes agendado.',
  // DX-018: los honorarios viven en su pantalla; aquí, el enlace.
  commissions: 'Honorarios',
  descriptionCollections: 'Los abonos con algo sin imputar a ítems del plan: cuánto está imputado y cuánto queda a cuenta, descontado lo ya devuelto o traspasado.',
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
  const role = getTokenRole(accessToken);
  // DX-090: FINANCIAL_REPORTS_VIEW suma las pestañas financieras.
  const permissions = useEffectivePermissions();
  const tabs = reportTabsFor(role, permissions);
  const tab = resolveReportTab(searchParams.get('tab'), tabs);

  if (!accessToken) {
    return null;
  }

  // Reescribe la pestaña SIN navegar (una sola entrada de historial).
  function changeTab(next: ReportTabKey) {
    // Los filtros de una pestaña (`?mes=`…) no viajan a otra.
    router.replace(next === tabs[0].key ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }

  // El odontólogo sin FINANCIAL_REPORTS_VIEW: solo pestañas con «lo suyo» (scope OWN en la API).
  const ownOnly = tabs.every((t) => t.key === 'produccion' || t.key === 'presupuestos' || t.key === 'prevision');
  const collectionsOnly = tabs.length === 1 && tabs[0].key === 'sin-imputar';
  const view =
    tab === 'produccion' ? (
      <ProductionByProcedureView token={accessToken} />
    ) : tab === 'huecos-recuperados' ? (
      <RecoveredSlotsView token={accessToken} isAdmin={role === 'ADMIN'} />
    ) : tab === 'ocupacion-sillones' ? (
      <ChairOccupancyView token={accessToken} isAdmin={role === 'ADMIN'} />
    ) : tab === 'enlaces-paciente' ? (
      <PatientLinksView token={accessToken} />
    ) : tab === 'rentabilidad' ? (
      <ProfitabilityView token={accessToken} />
    ) : tab === 'presupuestos' ? (
      <QuoteFunnelView
        token={accessToken}
        isAdmin={role === 'ADMIN'}
        ownByRole={role === 'DENTIST' && !canViewFinancialReports(role, permissions)}
      />
    ) : tab === 'prevision' ? (
      <ScheduledProductionView
        token={accessToken}
        ownByRole={role === 'DENTIST' && !canViewFinancialReports(role, permissions)}
      />
    ) : tab === 'captacion' ? (
      <AcquisitionView token={accessToken} isAdmin={role === 'ADMIN'} />
    ) : tab === 'sin-imputar' ? (
      <UnallocatedPaymentsView token={accessToken} />
    ) : (
      <LocationsComparisonView token={accessToken} />
    );
  return (
    <>
      <PageHeader
        title={copy.title}
        description={ownOnly ? copy.descriptionOwn : collectionsOnly ? copy.descriptionCollections : copy.description}
        actions={
          canViewCommissions(role) ? (
            <Button asChild variant="secondary">
              <Link href={COMMISSIONS_HREF}>
                <Percent aria-hidden />
                {copy.commissions}
              </Link>
            </Button>
          ) : undefined
        }
      />
      {/* Una barra con una sola pestaña promete secciones que no hay (critique-ops §11): sin ella si el rol ve un informe. */}
      {tabs.length > 1 ? (
        <>
          <ReportsTabs active={tab} onChange={changeTab} tabs={tabs} />
          <div role="tabpanel" id={reportPanelId(tab)} aria-labelledby={reportTabId(tab)}>
            {view}
          </div>
        </>
      ) : (
        view
      )}
    </>
  );
}
