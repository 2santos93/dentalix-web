'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, CalendarCheck, Download, Lock, UserRound } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { saveCsv } from '@/lib/files/save-csv';
import { CANCELLATION_REASON_LABELS, formatNotice } from '@/lib/cancellations/cancellation';
import { appointmentHref } from '@/lib/reports/scheduled-production-api';
import {
  downloadNoShowsCsv,
  getNoShows,
  type MissedAppointment,
  type NoShowsReport,
  type ProfessionalReportFilters,
} from '@/lib/reports/professional-reports-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { HowCalculated } from './how-calculated';
import { Stat, StatGroup } from './stat-group';
import {
  ProfessionalReportFilterBar,
  professionalFiltersCopy,
  useProfessionalReportFilters,
} from './professional-report-filters';

export const noShowsCopy = {
  scopeClinic: 'Agenda de la clínica',
  scopeOwn: 'Solo tu agenda',
  periodLine: (from: string, to: string) => (from === to ? `Citas del ${from}` : `Citas del ${from} al ${to}`),
  summaryTitle: 'Asistencia del período',
  rate: 'No-show',
  completed: 'Atendidas',
  noShows: 'No asistió',
  late: 'Canceladas tarde',
  listTitle: 'Citas no asistidas y canceladas tarde',
  listCaption: 'De la más reciente a la más antigua. Cada una abre la cita en la agenda.',
  listLabel: 'Citas no asistidas y canceladas tarde',
  columns: {
    when: 'Cita',
    patient: 'Paciente',
    kind: 'Qué pasó',
    professional: 'Profesional',
    location: 'Sede',
    reason: 'Motivo',
    open: 'Agenda',
  },
  kind: { NO_SHOW: 'No asistió', LATE_CANCELLATION: 'Cancelada tarde' } as const,
  notice: (text: string) => `Aviso de ${text}`,
  archived: (patient: string) => `${patient} (archivado)`,
  openAppointment: 'Abrir la cita',
  openAppointmentFor: (patient: string) => `Abrir la cita de ${patient} en la agenda`,
  noValue: '—',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exported: 'Reporte exportado.',
  exportError: 'No pudimos exportar las inasistencias.',
  exportAdminOnly: 'Lleva nombres de pacientes: solo la administración lo exporta.',
  loadError: 'No pudimos cargar las inasistencias.',
  forbiddenTitle: 'Tu rol no tiene acceso a las inasistencias.',
  forbiddenHint:
    'Las ven la administración, los odontólogos (cada uno, las de su agenda) y quien tenga acceso a los reportes financieros.',
  empty: 'Sin citas en el período',
  emptyHint: 'No hay citas atendidas, no asistidas ni canceladas tarde en estas fechas. Prueba con otro período o sede.',
  listEmpty: 'Nadie faltó ni canceló tarde en el período.',
};

const LOCATION_TIMEZONE_REQUIRED = 'LOCATION_TIMEZONE_REQUIRED';
export const NO_SHOWS_PAGE_SIZE = 25;

function columnsFor(fmt: RegionalFormat): DataListColumn<MissedAppointment>[] {
  const c = noShowsCopy;
  return [
    {
      id: 'when',
      header: c.columns.when,
      mobile: 'primary',
      cell: (r) => (
        <span className="whitespace-nowrap tabular-nums text-ink">{fmt.dateTime(new Date(r.start), r.timeZone)}</span>
      ),
    },
    {
      id: 'patient',
      header: c.columns.patient,
      cell: (r) => (r.patientArchived ? c.archived(r.patientName) : r.patientName),
      mobileCell: (r) => (r.patientArchived ? c.archived(r.patientName) : r.patientName),
    },
    {
      id: 'kind',
      header: c.columns.kind,
      mobile: 'trailing',
      cell: (r) => (
        <Badge variant={r.kind === 'NO_SHOW' ? 'danger' : 'warning'} dot data-testid="no-show-kind">
          {c.kind[r.kind]}
        </Badge>
      ),
    },
    {
      id: 'reason',
      header: c.columns.reason,
      showFrom: 'lg',
      cell: (r) =>
        r.cancelReasonCode ? (
          <span>
            {CANCELLATION_REASON_LABELS[r.cancelReasonCode]}
            {r.noticeMinutes !== null ? (
              <span className="block text-xs text-muted">{c.notice(formatNotice(r.noticeMinutes))}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-muted">{c.noValue}</span>
        ),
      mobileCell: (r) => (r.cancelReasonCode ? CANCELLATION_REASON_LABELS[r.cancelReasonCode] : null),
    },
    {
      id: 'professional',
      header: c.columns.professional,
      cell: (r) => r.professionalName ?? c.noValue,
      mobileCell: (r) => r.professionalName,
    },
    { id: 'location', header: c.columns.location, cell: (r) => r.locationName, showFrom: 'md' },
    {
      id: 'open',
      header: c.columns.open,
      align: 'end',
      mobile: 'meta',
      cell: (r) => (
        <Link
          href={appointmentHref(r.appointmentId)}
          aria-label={c.openAppointmentFor(r.patientName)}
          data-testid="no-show-open-appointment"
          className="inline-flex min-h-8 items-center whitespace-nowrap font-medium text-primary-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary-text max-sm:min-h-11"
        >
          {c.openAppointment}
        </Link>
      ),
    },
  ];
}

/**
 * «Inasistencias» (DX-304), pestaña de Reportes: el no-show % del período con
 * la definición de kpi-definitions (la misma de «Comparar sedes») y la lista
 * de citas no asistidas y canceladas tarde (DX-279), cada una con su enlace a
 * la agenda. Un odontólogo ve solo las de su agenda. El CSV lleva nombres de
 * pacientes: solo ADMIN (la API lo audita). Filtros en la URL.
 */
export function NoShowsView({
  token,
  isAdmin = false,
  ownByRole = false,
}: {
  token: string;
  isAdmin?: boolean;
  ownByRole?: boolean;
}) {
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const periodErrorId = `${React.useId()}-period-error`;
  const [data, setData] = useState<NoShowsReport | null>(null);
  const own = data?.scope === 'OWN' || ownByRole;
  const state = useProfessionalReportFilters(token, own);
  const { filterKey, invalidPeriod, period, zone } = state;
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoneError, setZoneError] = useState<{ message: string; locationId: string | null } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Otros filtros: la lista vuelve a su primera página.
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as ProfessionalReportFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getNoShows(token, query, page, NO_SHOWS_PAGE_SIZE);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setZoneError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403 && !query.locationId && !query.professionalId);
        const message = apiErrorMessage(err, {
          fallback: noShowsCopy.loadError,
          byStatus: { 400: professionalFiltersCopy.badRequest },
        });
        if (err instanceof ApiError && err.code === LOCATION_TIMEZONE_REQUIRED) {
          setZoneError({ message, locationId: err.locationId });
          setLoadError(null);
        } else {
          setZoneError(null);
          setLoadError(message);
        }
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, page, reloadKey]);

  async function exportCsv() {
    if (!filterKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const query = JSON.parse(filterKey) as ProfessionalReportFilters;
      const text = await downloadNoShowsCsv(token, query);
      saveCsv(text, `inasistencias-${query.from}-${query.to}.csv`, { bom: true });
      setNotice(noShowsCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: noShowsCopy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  const c = noShowsCopy;
  if (forbidden) {
    return <EmptyState role="status" icon={<Lock aria-hidden />} title={c.forbiddenTitle} description={c.forbiddenHint} />;
  }

  const showLoading = !invalidPeriod && (loading || !filterKey) && !data;
  const refreshing = loading && Boolean(data);
  const ready = Boolean(data && fmt && !showLoading && !loadError && !zoneError && !invalidPeriod);
  const s = data?.summary;
  const counted = s ? s.completedAppointments + s.noShows + s.lateCancellations : 0;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p data-testid="no-shows-scope" className="t-caption inline-flex items-center gap-1.5 text-muted">
        {own ? <UserRound aria-hidden className="size-4 shrink-0" /> : <Building2 aria-hidden className="size-4 shrink-0" />}
        <span>{own ? c.scopeOwn : c.scopeClinic}</span>
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <ProfessionalReportFilterBar state={state} own={own} options={data?.options} periodErrorId={periodErrorId} />
        {isAdmin ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void exportCsv()}
            disabled={exporting || loading || invalidPeriod || Boolean(loadError) || Boolean(zoneError)}
            className="shrink-0 self-start lg:self-auto"
            title={c.exportAdminOnly}
          >
            <Download aria-hidden />
            {exporting ? c.exporting : c.export}
          </Button>
        ) : null}
      </div>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {invalidPeriod ? <InlineError id={periodErrorId}>{professionalFiltersCopy.badRequest}</InlineError> : null}

      {ready && data && fmt ? (
        <p className="text-sm text-muted tabular-nums">{c.periodLine(fmt.civilDate(data.from), fmt.civilDate(data.to))}</p>
      ) : null}

      {invalidPeriod ? null : zoneError ? (
        <SedeConfigError
          kind="timeZone"
          description={zoneError.message}
          locationId={zoneError.locationId}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : zone.status === 'error' && !period ? (
        <SedeConfigError kind="timeZone" description={zone.message} onRetry={zone.retry} />
      ) : sedeFormat.status === 'error' ? (
        <SedeConfigError kind="locale" description={sedeFormat.message} onRetry={sedeFormat.retry} locationId={sedeFormat.locationId} />
      ) : (
        <AsyncSection
          loading={showLoading || sedeFormat.status === 'loading'}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={counted === 0 && (data?.total ?? 0) === 0}
          emptyTitle={c.empty}
          emptyDescription={c.emptyHint}
          skeleton={<TableSkeleton rows={4} />}
        >
          {data && s && fmt ? (
            <div className="flex min-w-0 flex-col gap-6" aria-busy={refreshing}>
              <StatGroup title={c.summaryTitle} className="grid-cols-2 lg:grid-cols-4">
                <Stat
                  testId="no-shows-rate"
                  label={c.rate}
                  value={
                    <span className="inline-flex items-center gap-1">
                      {s.noShowRate === null ? c.noValue : fmt.percent(s.noShowRate, 1)}
                      <HowCalculated column={c.rate} text={data.definition.howItIsCalculated} />
                    </span>
                  }
                />
                <Stat label={c.completed} value={fmt.number(s.completedAppointments)} />
                <Stat label={c.noShows} value={fmt.number(s.noShows)} />
                <Stat label={c.late} value={fmt.number(s.lateCancellations)} />
              </StatGroup>
              <section className="flex min-w-0 flex-col gap-2" aria-label={c.listTitle} data-testid="no-shows-list">
                <h3 className="t-label text-ink">
                  {c.listTitle} <span className="tabular-nums text-muted">({fmt.number(data.total)})</span>
                </h3>
                <p className="t-caption max-w-[80ch] text-muted">{c.listCaption}</p>
                {data.items.length === 0 ? (
                  <EmptyState icon={<CalendarCheck aria-hidden />} title={c.listEmpty} />
                ) : (
                  <div className="flex min-w-0 flex-col gap-3">
                    <DataList
                      label={c.listLabel}
                      rows={data.items}
                      columns={columnsFor(fmt)}
                      getRowKey={(r) => r.appointmentId}
                    />
                    <Pagination
                      page={data.page}
                      pageSize={data.pageSize}
                      total={data.total}
                      onPageChange={setPage}
                      disabled={loading}
                    />
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </AsyncSection>
      )}
    </div>
  );
}
