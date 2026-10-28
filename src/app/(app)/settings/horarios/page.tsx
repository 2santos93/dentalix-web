'use client';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';
import { canEditProviderSchedules } from '@/lib/locations/provider-schedule-api';
import { localDateString } from '@/lib/locations/provider-schedule';
import { PageHeader } from '@/components/shared/page-header';
import { SETTINGS_BACK } from '@/components/settings/settings-sections';
import { BusinessHoursForm } from '@/components/locations/business-hours-form';
import { ProviderSchedulesPanel } from '@/components/locations/provider-schedules-panel';
import { ScheduleRoster } from '@/components/locations/schedule-roster';
import {
  ScheduleTabs,
  resolveScheduleTab,
  schedulePanelId,
  scheduleTabId,
  type ScheduleTabKey,
} from '@/components/locations/schedule-tabs';

const copy = {
  title: 'Horarios',
  description: {
    sede: 'Define los días y tramos en que la sede atiende. Las citas fuera de ese horario se rechazan. Para los plazos en días hábiles, mira Calendario de la sede.',
    profesionales:
      'En qué sede atiende cada profesional cada día, y las fechas con un horario distinto.',
    cuadrante: 'La semana de cada profesional, con la sede en la que está cada día.',
  } satisfies Record<ScheduleTabKey, string>,
  checkingSession: 'Verificando sesión…',
};

/** `useSearchParams` exige un límite de Suspense (como la Caja). */
export default function BusinessHoursPage() {
  return (
    <Suspense fallback={null}>
      <SchedulesRoute />
    </Suspense>
  );
}

/**
 * Horarios (DX-233): «Sede» configura el horario de la sede ACTIVA (el
 * selector de sede del shell decide cuál); «Profesionales», el de cada
 * profesional por sede; «Cuadrante», la semana de todos. Escribir requiere
 * ADMIN (lo exige la API); los profesionales y el cuadrante se ven en solo
 * lectura con los demás roles.
 */
function SchedulesRoute() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const tab = resolveScheduleTab(searchParams.get('tab'));
  const [today] = useState(() => localDateString(new Date()));

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) router.replace('/login');
  }, [accessToken, router, hasHydrated]);

  if (!hasHydrated) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.checkingSession}
      </p>
    );
  }
  if (!accessToken) return null;

  function changeTab(next: ScheduleTabKey) {
    router.replace(next === 'sede' ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  }
  const canEdit = canEditProviderSchedules(getTokenRole(accessToken));

  return (
    <>
      <PageHeader back={SETTINGS_BACK} title={copy.title} description={copy.description[tab]} />
      <ScheduleTabs active={tab} onChange={changeTab} />
      <div role="tabpanel" id={schedulePanelId(tab)} aria-labelledby={scheduleTabId(tab)}>
        {tab === 'sede' ? <BusinessHoursForm token={accessToken} /> : null}
        {tab === 'profesionales' ? <ProviderSchedulesPanel token={accessToken} canEdit={canEdit} /> : null}
        {tab === 'cuadrante' ? <ScheduleRoster token={accessToken} today={today} /> : null}
      </div>
    </>
  );
}
