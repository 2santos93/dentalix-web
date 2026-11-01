'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getTokenRole, getTokenUserId } from '@/lib/auth/token-role';
import { listStaff } from '@/lib/appointments/staff-api';
import { useLocationsState } from '@/lib/locations/use-locations-state';
import { sedeZoneNoteCopy, useDashboardCurrency, useSedeZoneNote } from '@/lib/locations/sede-regional-summary';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { RegionalReviewNotice } from '@/components/locations/regional-review-notice';
import { RateBacklogNotice } from '@/components/payments/rate-backlog-notice';
import { ClinicFiscalNotice } from '@/components/clinic-settings/clinic-fiscal-notice';
import { AgingSection } from './aging-section';
import { LowStockSection } from './dashboard-sections';
import { canSeeBlock, INICIO_DESCRIPTION, INICIO_DESCRIPTION_FALLBACK } from './inicio-roles';
import { MyProductionSection } from './my-production-section';
import { PendingSection } from './pending-section';
import { PeriodResultsSection } from './period-results-section';
import { TodaySection } from './today-section';

export const dashboardCopy = {
  title: 'Inicio',
  allSedes: 'Todas las sedes',
  allSedesLower: 'todas las sedes',
  scopeLabel: 'Alcance',
  loading: 'Cargando Inicio…',
};
const copy = dashboardCopy;

interface DashboardViewProps {
  token: string;
}

/**
 * «Inicio» v2 (I1): el día de la clínica para los CUATRO roles. Lo de hoy (las
 * citas del día con sus alertas), lo que espera una acción (cada fila abre
 * donde se resuelve) y, solo para quien puede verlo, el período: resultados y
 * cartera para ADMIN, la producción propia para el odontólogo, lo que hay que
 * reponer para la asistente. Cada bloque pide su endpoint con su propio ciclo
 * de carga y error, y solo si el rol lo puede leer (`inicio-roles.ts`): un rol
 * sin permiso no dispara un 403, ni siquiera de fondo.
 *
 * El día es el de la sede (DX-097): la zona viene de la API; sin zona
 * utilizable, `SedeConfigError` y nada más (nunca otra zona).
 */
export function DashboardView({ token }: DashboardViewProps) {
  const role = getTokenRole(token);
  const userId = getTokenUserId(token);
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const fmt = readyFormat(useSedeFormat(token));
  const locations = useLocationsState(token);
  // R1: la nota de zona y la moneda del período salen de los helpers comunes
  // (`sede-regional-summary.ts`), no de reglas locales de Inicio.
  const zoneNote = useSedeZoneNote(token);
  const currency = useDashboardCurrency(token);

  // Nombres del personal para la columna «Profesional» (best-effort: sin ellos
  // la fila no lo nombra, nunca enseña un UUID).
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (role === 'DENTIST') return;
    let cancelled = false;
    listStaff(token)
      .then((data) => {
        if (!cancelled) setStaffNames(Object.fromEntries(data.map((s) => [s.userId, s.fullName])));
      })
      .catch(() => {
        /* best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [token, role]);

  const ready = locations.status === 'ready' ? locations : null;
  const activeLocationId = ready?.activeLocationId ?? null;
  const activeSede = ready && activeLocationId ? ready.locations.find((l) => l.id === activeLocationId) : undefined;
  const scopeName = activeSede?.name ?? copy.allSedes;
  const scopeKey = activeLocationId ?? 'all';

  const description = role ? INICIO_DESCRIPTION[role] : INICIO_DESCRIPTION_FALLBACK;
  const note = zoneNote.status === 'ready' ? zoneNote : null;
  const meta = (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted" data-testid="dashboard-scope">
      <span className="font-medium text-ink">{scopeName}</span>
      {note ? (
        <>
          <span aria-hidden>·</span>
          <span data-testid="dashboard-zone-note">{note.text}</span>
          {/* Solo ADMIN puede cambiar la zona de una sede: para el resto es texto. */}
          {role === 'ADMIN' ? (
            <Link
              href={note.settingsHref}
              className="rounded-sm text-primary-text hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center"
            >
              {sedeZoneNoteCopy.change}
            </Link>
          ) : null}
        </>
      ) : null}
    </p>
  );

  const header = <PageHeader title={copy.title} description={description} meta={meta} />;

  if (zone.status === 'error') {
    return (
      <>
        {header}
        <SedeConfigError kind="timeZone" description={zone.message} onRetry={zone.retry} />
      </>
    );
  }
  if (!timeZone || !role) {
    return (
      <>
        {header}
        <div role="status" aria-label={copy.loading} className="flex flex-col gap-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </>
    );
  }

  const today = sedeToday(timeZone);

  return (
    <>
      {header}
      <div className="flex flex-col gap-10">
        {/* Avisos D5 (G1 §7) y DX-380: se pintan solos y solo para ADMIN. */}
        <RegionalReviewNotice token={token} />
        <RateBacklogNotice token={token} />
        {/* DX-019: datos fiscales pendientes (solo ADMIN). */}
        <ClinicFiscalNotice token={token} />

        {/* Hoy (8) + Pendientes (4) desde xl; una columna debajo, Hoy primero. */}
        <div className="grid items-start gap-10 xl:grid-cols-12 xl:gap-6">
          <div className="min-w-0 xl:col-span-8">
            <TodaySection
              token={token}
              role={role}
              userId={userId}
              timeZone={timeZone}
              today={today}
              scopeLabel={activeSede?.name ?? copy.allSedesLower}
              scopeKey={scopeKey}
              fmt={fmt}
              staffNames={staffNames}
            />
          </div>
          <div className="min-w-0 xl:col-span-4">
            <PendingSection
              token={token}
              role={role}
              activeLocationId={activeLocationId}
              timeZone={timeZone}
              fmt={fmt}
            />
          </div>
        </div>

        {canSeeBlock('periodResults', role) ? (
          currency.status === 'error' ? (
            <SedeConfigError kind="currency" onRetry={currency.retry} />
          ) : (
            <PeriodResultsSection
              key={scopeKey}
              token={token}
              timeZone={timeZone}
              scopeKey={scopeKey}
              currency={currency.status === 'ready' ? currency : null}
              fmt={fmt}
            />
          )
        ) : null}
        {canSeeBlock('aging', role) ? <AgingSection token={token} scopeKey={scopeKey} fmt={fmt} /> : null}
        {canSeeBlock('myProduction', role) ? (
          <MyProductionSection token={token} timeZone={timeZone} scopeKey={scopeKey} fmt={fmt} />
        ) : null}
        {canSeeBlock('lowStockList', role) ? <LowStockSection token={token} scopeKey={scopeKey} fmt={fmt} /> : null}
      </div>
    </>
  );
}
