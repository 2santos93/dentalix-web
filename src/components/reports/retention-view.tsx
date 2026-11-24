'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, Download, Lock, UsersRound } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { saveCsv } from '@/lib/files/save-csv';
import { isWithinMonths, PERIOD_PRESETS, periodFor, type PeriodPresetKey } from '@/lib/reports/period-presets';
import { isCivilDate } from '@/lib/reports/chair-occupancy-api';
import {
  downloadRetentionCsv,
  getRetentionReport,
  isActiveMonths,
  RETENTION_ACTIVE_MONTHS,
  RETENTION_DEFAULT_ACTIVE_MONTHS,
  RETENTION_MAX_PERIOD_MONTHS,
  type RetentionDefinition,
  type RetentionFigures,
  type RetentionFilters,
  type RetentionLocationTotal,
  type RetentionReport,
  type RetentionRow,
  type RetentionSegment,
} from '@/lib/reports/retention-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { notifyError } from '@/components/errors/notify';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { cn } from '@/lib/utils';
import { HowCalculated } from './how-calculated';
import { Stat, StatGroup } from './stat-group';
import { RetentionPatientsDialog, type RetentionListTarget } from './retention-patients-dialog';

const LOCATION_TIMEZONE_REQUIRED = 'LOCATION_TIMEZONE_REQUIRED';
const DEFAULT_PRESET: PeriodPresetKey = 'this_year';

export const retentionCopy = {
  scopeClinic: 'Pacientes de tus sedes',
  scopeLocation: (name: string) => `Pacientes de la sede ${name}`,
  scopeProfessional: (name: string) => `de ${name}`,
  period: 'Período',
  dates: 'Fechas',
  from: 'Desde',
  to: 'Hasta',
  location: 'Sede',
  locationAll: 'Todas tus sedes',
  professional: 'Profesional',
  professionalAll: 'Todo el equipo',
  inactive: '(desactivada)',
  activeMonths: 'Activo si vino en',
  activeMonthsOption: (n: number) => `Los últimos ${n} meses`,
  export: 'Descargar CSV',
  exporting: 'Descargando…',
  exported: 'Informe descargado.',
  exportError: 'No pudimos descargar el informe.',
  periodLine: (from: string, to: string, months: number) =>
    `Del ${from} al ${to} · activo: alguna cita atendida en ${months} meses`,
  summaryTitle: 'En el período',
  openList: (label: string, value: string) => `${label}: ${value}. Ver la lista de pacientes`,
  openListIn: (label: string, value: string, where: string) =>
    `${label} de ${where}: ${value}. Ver la lista de pacientes`,
  noValue: '—',
  tableTitle: 'Por sede y profesional',
  tableCaption:
    'Cada paciente cuenta en la sede y el profesional de su última cita atendida. Toca una cifra para ver sus pacientes.',
  tableLabel: 'Retención por sede y profesional',
  locationsTitle: 'Por sede',
  locationsLabel: 'Retención por sede',
  columns: { professional: 'Profesional', location: 'Sede' },
  loadError: 'No pudimos cargar la retención de pacientes.',
  badRequest: 'El período no es válido: «Desde» no puede ser posterior a «Hasta» y caben como mucho 12 meses.',
  forbiddenTitle: 'Tu rol no tiene acceso a la retención de pacientes.',
  forbiddenHint: 'La ven la administración y quien tenga acceso a los reportes financieros.',
  empty: 'Sin datos en el periodo',
  emptyHint:
    'Ningún paciente con citas atendidas cuenta con estos filtros. Prueba con otro período, sede o profesional.',
  loading: 'Cargando la retención de pacientes',
};

type Param = 'periodo' | 'desde' | 'hasta' | 'sede' | 'profesional' | 'meses';
type CountKey = Exclude<keyof RetentionFigures, 'retentionRate'>;
type ListDefinition = RetentionDefinition & { segment: RetentionSegment };

const isPreset = (value: string | null): value is PeriodPresetKey => PERIOD_PRESETS.some((p) => p.key === value);
const hasList = (d: RetentionDefinition): d is ListDefinition => d.segment !== null;

function figureText(figures: RetentionFigures, key: RetentionDefinition['key'], fmt: RegionalFormat): string {
  if (key === 'retentionRate') {
    return figures.retentionRate === null ? retentionCopy.noValue : fmt.percent(figures.retentionRate, 2);
  }
  return fmt.number(figures[key]);
}

/**
 * Una cifra que abre su lista. Con 0 no hay lista que ver: texto. En pantallas
 * táctiles el área crece por fuera (`::after`) hasta 44 px sin mover la tabla.
 */
function FigureButton({
  text,
  label,
  onOpen,
  testId,
  className,
}: {
  text: string;
  label: string;
  onOpen: () => void;
  testId?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      data-testid={testId}
      className={cn(
        'relative inline-flex min-h-8 min-w-8 items-center justify-end rounded-md px-1 font-semibold text-primary-text tabular-nums underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text pointer-coarse:after:absolute pointer-coarse:after:-inset-2',
        className,
      )}
    >
      {text}
    </button>
  );
}

function HeaderWithHow({ label, text }: { label: string; text: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-0.5">
      {label}
      <HowCalculated column={label} text={text} />
    </span>
  );
}

function figureColumns<T extends RetentionFigures>(
  definitions: readonly RetentionDefinition[],
  fmt: RegionalFormat,
  where: (row: T) => string,
  open: (row: T, definition: ListDefinition) => void,
  testIdOf: (row: T, key: string) => string,
): DataListColumn<T>[] {
  return definitions.map((d): DataListColumn<T> => ({
    id: d.key,
    header: <HeaderWithHow label={d.label} text={d.howItIsCalculated} />,
    numeric: true,
    mobile: d.key === 'retentionRate' ? 'trailing' : 'meta',
    cell: (row) => {
      const text = figureText(row, d.key, fmt);
      if (!hasList(d) || row[d.key as CountKey] === 0) {
        return <span data-testid={testIdOf(row, d.key)}>{text}</span>;
      }
      return (
        <FigureButton
          text={text}
          label={retentionCopy.openListIn(d.label, text, where(row))}
          onOpen={() => open(row, d)}
          testId={testIdOf(row, d.key)}
        />
      );
    },
    mobileCell: (row) =>
      d.key === 'retentionRate' ? figureText(row, d.key, fmt) : `${d.label} ${figureText(row, d.key, fmt)}`,
  }));
}

function Summary({
  report,
  fmt,
  onOpen,
}: {
  report: RetentionReport;
  fmt: RegionalFormat;
  onOpen: (target: RetentionListTarget) => void;
}) {
  const c = retentionCopy;
  return (
    <StatGroup as="h2" title={c.summaryTitle} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {report.definitions.map((d) => {
        const text = figureText(report.totals, d.key, fmt);
        const count = d.key === 'retentionRate' ? null : report.totals[d.key];
        return (
          <Stat
            key={d.key}
            testId={`retention-figure-${d.key}`}
            label={d.label}
            value={
              <span className="inline-flex items-center gap-1">
                {hasList(d) && count !== null && count > 0 ? (
                  <FigureButton
                    text={text}
                    label={c.openList(d.label, text)}
                    onOpen={() => onOpen({ definition: d, scope: null })}
                    testId={`retention-open-${d.segment}`}
                    className="-ml-1 justify-start"
                  />
                ) : (
                  <span data-testid={`retention-value-${d.key}`}>{text}</span>
                )}
                <HowCalculated column={d.label} text={d.howItIsCalculated} />
              </span>
            }
          />
        );
      })}
    </StatGroup>
  );
}

function ByProfessional({
  report,
  fmt,
  onOpen,
}: {
  report: RetentionReport;
  fmt: RegionalFormat;
  onOpen: (target: RetentionListTarget) => void;
}) {
  const c = retentionCopy;
  const where = (r: RetentionRow) => `${r.locationName} · ${r.providerName}`;
  const columns: DataListColumn<RetentionRow>[] = [
    { id: 'professional', header: c.columns.professional, mobile: 'primary', cell: (r) => r.providerName },
    {
      id: 'location',
      header: c.columns.location,
      cell: (r) => <span className="whitespace-nowrap">{r.locationName}</span>,
      mobileCell: (r) => r.locationName,
    },
    ...figureColumns<RetentionRow>(
      report.definitions,
      fmt,
      where,
      (r, d) => onOpen({ definition: d, scope: where(r), locationId: r.locationId, providerId: r.providerId }),
      (r, key) => `retention-cell-${r.locationId}-${r.providerId}-${key}`,
    ),
  ];
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={c.tableTitle}>
      <div className="flex flex-col gap-0.5">
        <h2 className="t-label text-ink">{c.tableTitle}</h2>
        <p className="t-caption max-w-[80ch]">{c.tableCaption}</p>
      </div>
      <DataList
        label={c.tableLabel}
        rows={report.rows}
        columns={columns}
        getRowKey={(r) => `${r.locationId}:${r.providerId}`}
      />
    </section>
  );
}

function ByLocation({
  report,
  fmt,
  onOpen,
}: {
  report: RetentionReport;
  fmt: RegionalFormat;
  onOpen: (target: RetentionListTarget) => void;
}) {
  const c = retentionCopy;
  if (report.locations.length < 2) return null;
  const columns: DataListColumn<RetentionLocationTotal>[] = [
    { id: 'location', header: c.columns.location, mobile: 'primary', cell: (r) => r.locationName },
    ...figureColumns<RetentionLocationTotal>(
      report.definitions,
      fmt,
      (r) => r.locationName,
      (r, d) => onOpen({ definition: d, scope: r.locationName, locationId: r.locationId }),
      (r, key) => `retention-location-${r.locationId}-${key}`,
    ),
  ];
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={c.locationsTitle}>
      <h2 className="t-label text-ink">{c.locationsTitle}</h2>
      <DataList label={c.locationsLabel} rows={report.locations} columns={columns} getRowKey={(r) => r.locationId} />
    </section>
  );
}

/**
 * «Retención» (DX-260), pestaña de Reportes: cuántos pacientes estaban activos
 * al inicio, cuántos llegaron, cuántos se perdieron, los recuperados, la
 * retención y los nuevos que no volvieron, en total y por sede y profesional
 * (el de la última cita atendida). Las definiciones las da la API y se
 * enseñan tal cual («Cómo se calcula»). Cada cifra abre su lista de pacientes
 * con «Agendar» y WhatsApp. Período (hasta 12 meses), sede, profesional y
 * ventana de actividad en la URL (`?periodo=`, `?desde=`, `?hasta=`,
 * `?sede=`, `?profesional=`, `?meses=`). El CSV del informe es de quien lo ve;
 * el de cada lista, solo ADMIN.
 */
export function RetentionView({ token, isAdmin }: { token: string; isAdmin: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const today = timeZone ? sedeToday(timeZone) : null;
  const ids = React.useId();
  const periodErrorId = `${ids}-period-error`;
  const c = retentionCopy;

  const presetParam = searchParams.get('periodo');
  const preset: PeriodPresetKey = isPreset(presetParam) ? presetParam : DEFAULT_PRESET;
  const fromParam = searchParams.get('desde');
  const toParam = searchParams.get('hasta');
  const locationId = searchParams.get('sede') ?? '';
  const providerId = searchParams.get('profesional') ?? '';
  const monthsParam = searchParams.get('meses');
  const activeMonths = isActiveMonths(monthsParam) ? Number(monthsParam) : RETENTION_DEFAULT_ACTIVE_MONTHS;
  const customPeriod =
    isCivilDate(fromParam) && isCivilDate(toParam)
      ? { from: fromParam, to: toParam }
      : today
        ? periodFor(DEFAULT_PRESET, today)
        : null;
  const period = preset === 'custom' ? customPeriod : today ? periodFor(preset, today) : null;
  const invalidPeriod = preset === 'custom' && period !== null && !isWithinMonths(period, RETENTION_MAX_PERIOD_MONTHS);

  const [data, setData] = useState<RetentionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoneError, setZoneError] = useState<{ message: string; locationId: string | null } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [list, setList] = useState<RetentionListTarget | null>(null);

  const filters: RetentionFilters | null =
    period && !invalidPeriod
      ? {
          ...period,
          ...(locationId ? { locationId } : {}),
          ...(providerId ? { providerId } : {}),
          activeMonths: activeMonths as RetentionFilters['activeMonths'],
        }
      : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as RetentionFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getRetentionReport(token, query);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setZoneError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403 && !query.locationId);
        const message = apiErrorMessage(err, { fallback: c.loadError, byStatus: { 400: c.badRequest } });
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
  }, [token, filterKey, reloadKey, c.loadError, c.badRequest]);

  /** Reescribe filtros en la URL sin navegar (conserva `?tab=`). */
  function setParams(values: Partial<Record<Param, string>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function choosePreset(next: PeriodPresetKey) {
    if (next === 'custom' && period) setParams({ periodo: next, desde: period.from, hasta: period.to });
    else setParams({ periodo: next === DEFAULT_PRESET ? '' : next, desde: '', hasta: '' });
  }

  async function exportCsv() {
    if (!filterKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const query = JSON.parse(filterKey) as RetentionFilters;
      const text = await downloadRetentionCsv(token, query);
      saveCsv(text, `retencion-de-pacientes-${query.from}-${query.to}.csv`, { bom: true });
      setNotice(c.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: c.exportError }), { onRetry: () => void exportCsv() });
    } finally {
      setExporting(false);
    }
  }

  if (forbidden) {
    return (
      <EmptyState role="status" icon={<Lock aria-hidden />} title={c.forbiddenTitle} description={c.forbiddenHint} />
    );
  }

  const showLoading = !invalidPeriod && (loading || !filters) && !data;
  const refreshing = loading && Boolean(data);
  const ready = Boolean(data && fmt && !invalidPeriod && !showLoading && !loadError && !zoneError);
  const options = data?.options;
  const locationName = locationId ? options?.locations.find((l) => l.id === locationId)?.name : null;
  const providerName = providerId ? options?.professionals.find((p) => p.userId === providerId)?.fullName : null;
  const scopeText = [
    locationName ? c.scopeLocation(locationName) : c.scopeClinic,
    providerName ? c.scopeProfessional(providerName) : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p data-testid="retention-scope" className="t-caption inline-flex items-center gap-1.5 text-muted">
        <Building2 aria-hidden className="size-4 shrink-0" />
        <span>{scopeText}</span>
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <FormField htmlFor={`${ids}-period`} label={c.period} className="sm:w-44">
            <NativeSelect
              id={`${ids}-period`}
              value={preset}
              onChange={(e) => choosePreset(e.target.value as PeriodPresetKey)}
            >
              {PERIOD_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {preset === 'custom' && period ? (
            <FormField htmlFor={`${ids}-dates`} label={c.dates} className="sm:w-72">
              <DateRangePicker
                id={`${ids}-dates`}
                value={period}
                onChange={(range) => {
                  if (range) setParams({ periodo: 'custom', desde: range.from, hasta: range.to });
                }}
                startLabel={c.from}
                endLabel={c.to}
                isInvalid={invalidPeriod}
                aria-describedby={invalidPeriod ? periodErrorId : undefined}
              />
            </FormField>
          ) : null}
          <FormField htmlFor={`${ids}-location`} label={c.location} className="min-w-0 sm:w-52">
            <NativeSelect
              id={`${ids}-location`}
              value={locationId}
              onChange={(e) => setParams({ sede: e.target.value })}
              disabled={!options}
            >
              <option value="">{c.locationAll}</option>
              {options?.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.isActive ? l.name : `${l.name} ${c.inactive}`}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor={`${ids}-professional`} label={c.professional} className="min-w-0 sm:w-52">
            <NativeSelect
              id={`${ids}-professional`}
              value={providerId}
              onChange={(e) => setParams({ profesional: e.target.value })}
              disabled={!options}
            >
              <option value="">{c.professionalAll}</option>
              {options?.professionals.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.fullName}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField htmlFor={`${ids}-months`} label={c.activeMonths} className="min-w-0 sm:w-48">
            <NativeSelect
              id={`${ids}-months`}
              value={String(activeMonths)}
              onChange={(e) =>
                setParams({ meses: Number(e.target.value) === RETENTION_DEFAULT_ACTIVE_MONTHS ? '' : e.target.value })
              }
            >
              {RETENTION_ACTIVE_MONTHS.map((n) => (
                <option key={n} value={String(n)}>
                  {c.activeMonthsOption(n)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void exportCsv()}
          disabled={exporting || showLoading || invalidPeriod || Boolean(loadError) || Boolean(zoneError)}
          className="shrink-0 self-start max-sm:min-h-11 lg:self-auto"
          data-testid="retention-export"
        >
          <Download aria-hidden />
          {exporting ? c.exporting : c.export}
        </Button>
      </div>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {invalidPeriod ? <InlineError id={periodErrorId}>{c.badRequest}</InlineError> : null}

      {ready && data && fmt ? (
        <p className="text-sm text-muted tabular-nums">
          {c.periodLine(fmt.civilDate(data.from), fmt.civilDate(data.to), data.filters.activeMonths)}
        </p>
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
        <SedeConfigError
          kind="locale"
          description={sedeFormat.message}
          onRetry={sedeFormat.retry}
          locationId={sedeFormat.locationId}
        />
      ) : (
        <AsyncSection
          loading={showLoading || sedeFormat.status === 'loading'}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={!data || !data.hasData}
          emptyTitle={c.empty}
          emptyDescription={c.emptyHint}
          emptyIcon={<UsersRound aria-hidden />}
          skeleton={<TableSkeleton rows={4} />}
        >
          {data && fmt ? (
            <div className="flex min-w-0 flex-col gap-6" aria-busy={refreshing}>
              <Summary report={data} fmt={fmt} onOpen={setList} />
              <ByLocation report={data} fmt={fmt} onOpen={setList} />
              <ByProfessional report={data} fmt={fmt} onOpen={setList} />
            </div>
          ) : null}
        </AsyncSection>
      )}

      {list && filters && fmt ? (
        <RetentionPatientsDialog
          token={token}
          filters={filters}
          target={list}
          fmt={fmt}
          isAdmin={isAdmin}
          onClose={() => setList(null)}
        />
      ) : null}
    </div>
  );
}
