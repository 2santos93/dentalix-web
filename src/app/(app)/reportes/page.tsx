'use client';
import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PageHeader } from '@/components/shared/page-header';
import { getTokenRole } from '@/lib/auth/token-role';
import { LocationsComparisonView } from '@/components/reports/locations-comparison-view';
import { ProductionByProcedureView } from '@/components/reports/production-by-procedure-view';
import { RecoveredSlotsView } from '@/components/reports/recovered-slots-view';
import { ChairOccupancyView } from '@/components/reports/chair-occupancy-view';
import { UnallocatedPaymentsView } from '@/components/reports/unallocated-payments-view';
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
// procedimiento»; DX-399: recepción, solo «Cobrado sin imputar»). Un rol sin acceso que llegue por URL ve el aviso de la
// propia vista (la API responde 403): la frontera es el servidor.
const copy = {
  title: 'Reportes',
  description: 'Cómo van tus sedes: producción, cobros, citas y ocupación, y qué procedimientos sostienen la clínica.',
  descriptionOwn: 'Tu producción: qué procedimientos realizaste y a qué honorario frente al de catálogo.',
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
  const tabs = reportTabsFor(role);
  const tab = resolveReportTab(searchParams.get('tab'), tabs);

  if (!accessToken) {
    return null;
  }

  // Reescribe la pestaña SIN navegar (una sola entrada de historial).
  function changeTab(next: ReportTabKey) {
    // Los filtros de una pestaña (`?mes=`…) no viajan a otra.
    router.replace(next === tabs[0].key ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }

  const ownOnly = tabs.length === 1 && tabs[0].key === 'produccion';
  const collectionsOnly = tabs.length === 1 && tabs[0].key === 'sin-imputar';
  const view =
    tab === 'produccion' ? (
      <ProductionByProcedureView token={accessToken} />
    ) : tab === 'huecos-recuperados' ? (
      <RecoveredSlotsView token={accessToken} isAdmin={role === 'ADMIN'} />
    ) : tab === 'ocupacion-sillones' ? (
      <ChairOccupancyView token={accessToken} isAdmin={role === 'ADMIN'} />
    ) : tab === 'sin-imputar' ? (
      <UnallocatedPaymentsView token={accessToken} />
    ) : (
      <LocationsComparisonView token={accessToken} />
    );
  return (
    <>
      <PageHeader title={copy.title} description={ownOnly ? copy.descriptionOwn : collectionsOnly ? copy.descriptionCollections : copy.description} />
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
