'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, Download, Lock, Megaphone } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { saveCsv } from '@/lib/files/save-csv';
import {
  isWithinMonths,
  PERIOD_PRESETS,
  periodFor,
  PRODUCTION_MAX_PERIOD_MONTHS,
  type PeriodPresetKey,
} from '@/lib/reports/period-presets';
import { isCivilDate } from '@/lib/reports/chair-occupancy-api';
import {
  collectedIn,
  downloadAcquisitionCsv,
  getAcquisitionReport,
  type AcquisitionAmount,
  type AcquisitionFilters,
  type AcquisitionReport,
  type AcquisitionRow,
  type AcquisitionTopReferrer,
} from '@/lib/reports/acquisition-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { notifyError } from '@/components/errors/notify';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Disclosure } from '@/components/shared/disclosure';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { cn } from '@/lib/utils';
import { HowCalculated } from './how-calculated';
import { RankedBars } from './ranked-bars';
import { Stat, StatGroup } from './stat-group';

/** Como `ACQUISITION_MAX_MONTHS` en la API: 24 meses por calendario. */
const MAX_MONTHS = PRODUCTION_MAX_PERIOD_MONTHS;
const LOCATION_TIMEZONE_REQUIRED = 'LOCATION_TIMEZONE_REQUIRED';

export const acquisitionCopy = {
  scope: 'Pacientes nuevos de la clínica',
  scopeAllLocations: 'consolidado de tus sedes',
  scopeLocation: (name: string) => `captados en la sede ${name}`,
  period: 'Período',
  dates: 'Fechas',
  from: 'Desde',
  to: 'Hasta',
  location: 'Sede de captación',
  locationAll: 'Todas tus sedes',
  inactive: '(desactivada)',
  export: 'Descargar CSV',
  exporting: 'Descargando…',
  exported: 'Informe descargado.',
  exportError: 'No pudimos descargar el informe.',
  periodLine: (from: string, to: string) =>
    from === to ? `Altas del ${from} y lo cobrado ese día` : `Altas del ${from} al ${to} y lo cobrado en esas fechas`,
  summaryTitle: 'En el período',
  newPatients: 'Pacientes nuevos',
  newPatientsHint: 'Dados de alta en el período',
  paying: 'Con abonos',
  payingHint: (pct: string) => `${pct} de los nuevos`,
  collected: 'Cobrado a los nuevos',
  collectedHint: 'Abonos no anulados, por moneda',
  nothingCollected: 'Sin abonos',
  barsTitle: 'Pacientes nuevos por fuente',
  barsCaption: 'Cuántos llegaron por cada «¿Cómo nos conoció?». «Sin dato»: dados de alta sin indicarlo.',
  tableTitle: 'Por fuente',
  tableLabel: 'Captación por fuente',
  columns: {
    source: 'Fuente',
    newPatients: 'Pacientes nuevos',
    paying: 'Con abonos',
    collected: (currency: string) => `Cobrado ${currency}`,
  },
  howColumns: {
    newPatients:
      'Pacientes dados de alta en el período (día civil de la sede de su primera cita; sin citas, el de la sede principal).',
    paying: 'De los pacientes nuevos, los que tienen algún abono no anulado en el período.',
    collected:
      'Suma de los abonos no anulados de esos pacientes en el período, en su moneda y sin convertir: cada moneda en su columna.',
  },
  noData: 'Sin dato',
  referrersTitle: 'Pacientes que más recomiendan',
  referrersCaption: 'Hasta 10: cuántos pacientes nuevos del período recomendó cada uno y lo cobrado a ellos.',
  referrersLabel: 'Pacientes que más recomiendan',
  referrerColumns: { patient: 'Paciente', referred: 'Recomendados', collected: 'Cobrado a sus recomendados' },
  referredCount: (n: number) => (n === 1 ? '1 recomendado' : `${n} recomendados`),
  howTitle: 'Cómo se calcula',
  how: [
    {
      label: 'Paciente nuevo',
      lines: [
        'Un paciente dado de alta en el período (los archivados o fusionados no cuentan).',
        'Su fuente es la que tiene hoy en «¿Cómo nos conoció?»; sin ella, cuenta en «Sin dato». Una fuente desactivada sigue saliendo si trajo pacientes.',
      ],
    },
    {
      label: 'Sede de captación',
      lines: [
        'El paciente es de la clínica, no de una sede: se le asigna la sede de su primera cita, en cualquier estado.',
        'Sin citas no es de ninguna sede: solo cuenta en «Todas tus sedes».',
      ],
    },
    {
      label: 'Cobrado',
      lines: [
        'Los abonos no anulados de esos pacientes con fecha en el período (día civil de la sede del abono) y en las sedes del filtro.',
        'Por moneda y sin convertir: un abono en VES no se suma a uno en USD.',
      ],
    },
    {
      label: 'Pacientes que más recomiendan',
      lines: [
        'Los pacientes nuevos del período que tienen a otro paciente como «Recomendado por», agrupados por ese paciente.',
      ],
    },
  ],
  loadError: 'No pudimos cargar la captación de pacientes.',
  badRequest: 'El período no es válido: elige fechas de hasta 24 meses con «Desde» anterior o igual a «Hasta».',
  forbiddenTitle: 'Tu rol no tiene acceso a la captación de pacientes.',
  forbiddenHint: 'La ven la administración y quien tenga acceso a los reportes financieros.',
  empty: 'Sin pacientes nuevos en el período',
  emptyHint: 'Nadie se dio de alta en estas fechas con este filtro. Prueba con otro período o sede.',
  loading: 'Cargando la captación de pacientes',
};

/** Lo cobrado en las monedas del informe, en el formato de la sede: «150,00 USD · 3.600,00 VES». */
function collectedText(
  amounts: readonly AcquisitionAmount[],
  currencies: readonly string[],
  fmt: RegionalFormat,
): string | null {
  const parts = currencies
    .map((currency) => ({ currency, amount: collectedIn(amounts, currency) }))
    .filter((p) => p.amount !== 0)
    .map((p) => moneyWithCode(p.amount, p.currency, fmt));
  return parts.length > 0 ? parts.join(' · ') : null;
}

function rowName(row: AcquisitionRow): string {
  return row.isActive === false ? `${row.name} ${acquisitionCopy.inactive}` : row.name;
}

function HeaderWithHow({ label, text }: { label: string; text: string }) {
  return (
    <span className="inline-flex items-center justify-end gap-0.5">
      {label}
      <HowCalculated column={label} text={text} />
    </span>
  );
}

function Summary({ report, fmt }: { report: AcquisitionReport; fmt: RegionalFormat }) {
  const c = acquisitionCopy;
  const { totals } = report;
  const pct = totals.newPatients > 0 ? fmt.percent((totals.payingPatients / totals.newPatients) * 100, 0) : null;
  return (
    <StatGroup title={c.summaryTitle} className="grid-cols-2 sm:grid-cols-3">
      <Stat
        testId="acquisition-new"
        label={c.newPatients}
        value={fmt.number(totals.newPatients)}
        hint={c.newPatientsHint}
      />
      <Stat
        testId="acquisition-paying"
        label={c.paying}
        value={fmt.number(totals.payingPatients)}
        hint={pct ? c.payingHint(pct) : undefined}
      />
      <Stat
        testId="acquisition-collected"
        label={c.collected}
        className="col-span-2 sm:col-span-1"
        value={
          totals.collected.length === 0 ? (
            <span className="text-muted">{c.nothingCollected}</span>
          ) : (
            <span className="flex flex-col">
              {report.currencies.map((currency) => (
                <span key={currency} className="whitespace-nowrap">
                  {moneyWithCode(collectedIn(totals.collected, currency), currency, fmt)}
                </span>
              ))}
            </span>
          )
        }
        hint={c.collectedHint}
      />
    </StatGroup>
  );
}

function SourceBars({ report, fmt }: { report: AcquisitionReport; fmt: RegionalFormat }) {
  const c = acquisitionCopy;
  const bars = report.rows.map((row) => ({
    key: row.sourceId ?? 'none',
    name: <span className={cn(row.sourceId === null && 'text-muted')}>{rowName(row)}</span>,
    value: row.newPatients,
    display: <span data-testid={`acquisition-bar-${row.sourceId ?? 'none'}`}>{fmt.number(row.newPatients)}</span>,
  }));
  return (
    <Card className="p-4 sm:p-6">
      <RankedBars title={c.barsTitle} caption={c.barsCaption} bars={bars} className="max-w-3xl" />
    </Card>
  );
}

function SourceTable({ report, fmt }: { report: AcquisitionReport; fmt: RegionalFormat }) {
  const c = acquisitionCopy;
  const columns: DataListColumn<AcquisitionRow>[] = [
    {
      id: 'source',
      header: c.columns.source,
      mobile: 'primary',
      cell: (r) => <span className={cn('text-ink', r.sourceId === null && 'text-muted')}>{rowName(r)}</span>,
    },
    {
      id: 'newPatients',
      header: <HeaderWithHow label={c.columns.newPatients} text={c.howColumns.newPatients} />,
      numeric: true,
      mobile: 'trailing',
      cell: (r) => fmt.number(r.newPatients),
      mobileCell: (r) => `${fmt.number(r.newPatients)} ${r.newPatients === 1 ? 'nuevo' : 'nuevos'}`,
    },
    {
      id: 'paying',
      header: <HeaderWithHow label={c.columns.paying} text={c.howColumns.paying} />,
      numeric: true,
      cell: (r) => fmt.number(r.payingPatients),
      mobileCell: (r) => (r.payingPatients > 0 ? `${fmt.number(r.payingPatients)} con abonos` : null),
    },
    ...report.currencies.map((currency, i): DataListColumn<AcquisitionRow> => ({
      id: `collected-${currency}`,
      header:
        i === 0 ? (
          <HeaderWithHow label={c.columns.collected(currency)} text={c.howColumns.collected} />
        ) : (
          c.columns.collected(currency)
        ),
      numeric: true,
      cell: (r) => (
        <span className="whitespace-nowrap">{moneyWithCode(collectedIn(r.collected, currency), currency, fmt)}</span>
      ),
      // En la tarjeta, una sola línea con todas las monedas (nunca se oculta dinero).
      mobileCell: (r) => (i === 0 ? collectedText(r.collected, report.currencies, fmt) : null),
    })),
  ];
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={c.tableTitle}>
      <h3 className="t-label text-ink">{c.tableTitle}</h3>
      <DataList label={c.tableLabel} rows={report.rows} columns={columns} getRowKey={(r) => r.sourceId ?? 'none'} />
    </section>
  );
}

function TopReferrers({ report, fmt }: { report: AcquisitionReport; fmt: RegionalFormat }) {
  const c = acquisitionCopy;
  if (report.topReferrers.length === 0) return null;
  const columns: DataListColumn<AcquisitionTopReferrer>[] = [
    { id: 'patient', header: c.referrerColumns.patient, mobile: 'primary', cell: (r) => r.fullName },
    {
      id: 'referred',
      header: c.referrerColumns.referred,
      numeric: true,
      mobile: 'trailing',
      cell: (r) => fmt.number(r.referred),
      mobileCell: (r) => c.referredCount(r.referred),
    },
    {
      id: 'collected',
      header: c.referrerColumns.collected,
      numeric: true,
      cell: (r) => collectedText(r.collected, report.currencies, fmt) ?? <span className="text-muted">—</span>,
      mobileCell: (r) => collectedText(r.collected, report.currencies, fmt),
    },
  ];
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label={c.referrersTitle}>
      <div className="flex flex-col gap-0.5">
        <h3 className="t-label text-ink">{c.referrersTitle}</h3>
        <p className="t-caption">{c.referrersCaption}</p>
      </div>
      <DataList
        label={c.referrersLabel}
        rows={report.topReferrers}
        columns={columns}
        getRowKey={(r) => r.patientId}
        getRowHref={(r) => `/patients/${r.patientId}`}
      />
    </section>
  );
}

function AcquisitionSkeleton() {
  return (
    <div role="status" aria-label={acquisitionCopy.loading} className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4 sm:p-6">
        <Skeleton className="h-3 w-40" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </Card>
      <TableSkeleton rows={4} />
    </div>
  );
}

/**
 * «Captación» (DX-172), pestaña de Reportes: los pacientes dados de alta en el
 * período por «¿Cómo nos conoció?», cuántos tienen abonos y lo cobrado a ellos
 * por moneda (sin convertir), una barra por fuente, «Sin dato» para los que no
 * lo dijeron y los pacientes que más recomiendan (enlace a su ficha). La sede
 * es la de CAPTACIÓN (la de la primera cita). Período y sede en la URL
 * (`?periodo=`, `?desde=`, `?hasta=`, `?sede=`). El CSV, solo ADMIN.
 */
export function AcquisitionView({ token, isAdmin }: { token: string; isAdmin: boolean }) {
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
  const c = acquisitionCopy;

  const presetParam = searchParams.get('periodo');
  const preset: PeriodPresetKey = PERIOD_PRESETS.some((p) => p.key === presetParam)
    ? (presetParam as PeriodPresetKey)
    : 'this_month';
  const fromParam = searchParams.get('desde');
  const toParam = searchParams.get('hasta');
  const locationId = searchParams.get('sede') ?? '';
  const customPeriod =
    isCivilDate(fromParam) && isCivilDate(toParam)
      ? { from: fromParam, to: toParam }
      : today
        ? periodFor('this_month', today)
        : null;
  const period = preset === 'custom' ? customPeriod : today ? periodFor(preset, today) : null;
  const invalidPeriod = preset === 'custom' && period !== null && !isWithinMonths(period, MAX_MONTHS);

  const [data, setData] = useState<AcquisitionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoneError, setZoneError] = useState<{ message: string; locationId: string | null } | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filters: AcquisitionFilters | null =
    period && !invalidPeriod ? { ...period, ...(locationId ? { locationId } : {}) } : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as AcquisitionFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getAcquisitionReport(token, query);
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
  function setParams(values: Partial<Record<'periodo' | 'desde' | 'hasta' | 'sede', string>>) {
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
    else setParams({ periodo: next === 'this_month' ? '' : next, desde: '', hasta: '' });
  }

  async function exportCsv() {
    if (!filterKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const query = JSON.parse(filterKey) as AcquisitionFilters;
      const text = await downloadAcquisitionCsv(token, query);
      saveCsv(text, `captacion-de-pacientes-${query.from}-${query.to}.csv`, { bom: true });
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

  const showLoading = !invalidPeriod && (loading || !filters);
  const ready = Boolean(data && fmt && !invalidPeriod && !showLoading && !loadError && !zoneError);
  const options = data?.options;
  const locationName = locationId ? options?.locations.find((l) => l.id === locationId)?.name : null;
  const scopeText = [c.scope, locationName ? c.scopeLocation(locationName) : locationId ? null : c.scopeAllLocations]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p data-testid="acquisition-scope" className="t-caption inline-flex items-center gap-1.5 text-muted">
        <Building2 aria-hidden className="size-4 shrink-0" />
        <span>{scopeText}</span>
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <FormField htmlFor={`${ids}-period`} label={c.period} className="sm:w-48">
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
          <FormField htmlFor={`${ids}-location`} label={c.location} className="min-w-0 sm:w-56">
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
        </div>
        {isAdmin ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => void exportCsv()}
            disabled={exporting || showLoading || invalidPeriod || Boolean(loadError) || Boolean(zoneError)}
            className="shrink-0 self-start max-sm:min-h-11 lg:self-auto"
          >
            <Download aria-hidden />
            {exporting ? c.exporting : c.export}
          </Button>
        ) : null}
      </div>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {invalidPeriod ? <InlineError id={periodErrorId}>{c.badRequest}</InlineError> : null}

      {ready && data && fmt ? (
        <p className="text-sm text-muted tabular-nums">
          {c.periodLine(fmt.civilDate(data.period.from), fmt.civilDate(data.period.to))}
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
          isEmpty={!data || !data.hasActivity}
          emptyTitle={c.empty}
          emptyDescription={c.emptyHint}
          emptyIcon={<Megaphone aria-hidden />}
          skeleton={<AcquisitionSkeleton />}
        >
          {data && fmt ? (
            <div className="flex min-w-0 flex-col gap-6">
              <Summary report={data} fmt={fmt} />
              <SourceBars report={data} fmt={fmt} />
              <SourceTable report={data} fmt={fmt} />
              <TopReferrers report={data} fmt={fmt} />
              <div className="-mx-2 max-w-[80ch] self-start" data-testid="acquisition-how">
                <Disclosure summary={c.howTitle}>
                  <dl className="flex flex-col gap-3 px-2 text-sm">
                    {c.how.map((d) => (
                      <div key={d.label} className="flex flex-col gap-1">
                        <dt className="font-medium text-ink">{d.label}</dt>
                        <dd>
                          <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
                            {d.lines.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Disclosure>
              </div>
            </div>
          ) : null}
        </AsyncSection>
      )}
    </div>
  );
}
