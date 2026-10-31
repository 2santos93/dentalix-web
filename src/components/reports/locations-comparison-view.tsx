'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, Download, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { saveCsv } from '@/lib/files/save-csv';
import { isValidPeriod, PERIOD_PRESETS, periodFor, type PeriodPresetKey } from '@/lib/reports/period-presets';
import {
  formatMetric,
  metricValues,
  nextSort,
  sortCurrency,
  sortRows,
  type SortKey,
  type SortState,
} from '@/lib/reports/comparison-table';
import {
  downloadLocationsComparisonCsv,
  getLocationsComparison,
  type CompareMode,
  type ComparisonRow,
  type KpiDefinition,
  type KpiKey,
  type LocationsComparison,
  type LocationsComparisonFilters,
} from '@/lib/reports/reports-api';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { AsyncSection } from '@/components/shared/async-section';
import { Disclosure } from '@/components/shared/disclosure';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { activeValues, previousSample } from './active-values';
import { HowCalculated } from './how-calculated';
import { MetricValue } from './metric-value';
import { RankedBars, type RankedBar } from './ranked-bars';
import { cn } from '@/lib/utils';

export const locationsComparisonCopy = {
  period: 'Período',
  dates: 'Fechas',
  from: 'Desde',
  to: 'Hasta',
  compare: 'Comparar con',
  compareOptions: {
    previous: 'Período anterior',
    previous_year: 'Mismo período del año anterior',
    none: 'Sin comparación',
  } satisfies Record<CompareMode, string>,
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exported: 'Reporte exportado.',
  exportError: 'No pudimos exportar el reporte.',
  scope: 'Todas tus sedes · por moneda, sin convertir',
  periodLine: (from: string, to: string) => `Del ${from} al ${to}`,
  comparedWith: (from: string, to: string) => `comparado con ${from} – ${to}`,
  // BE-045: una línea plegada junto a la tabla cuando el período comparado no
  // tiene toda su producción atribuida a una sede.
  unattributedSummary: (n: number) => `${n} indicadores sin comparar · ¿por qué?`,
  unattributedNote:
    '«Producción» y «% de cobro» no se comparan donde dice «—»: el período comparado tiene procedimientos realizados antes de registrar su sede («Sin atribuir») o cobros sin producción.',
  unattributedHow:
    'En este período no se compara: el período comparado tiene producción «Sin atribuir» o cobros sin producción.',
  charts: 'Producción y cobrado por sede',
  chartProduction: 'Producción por sede',
  chartCollected: 'Cobrado por sede',
  chartCaption: (currency: string, others: boolean) =>
    others ? `En ${currency}; las demás monedas, en la tabla.` : `En ${currency}.`,
  tableLabel: 'Indicadores por sede y total de la clínica',
  cardsLabel: 'Indicadores por sede',
  location: 'Sede',
  inactive: 'Desactivada',
  sortBy: 'Ordenar por',
  sortDefault: 'Orden de las sedes',
  sortByName: 'Sede (A–Z)',
  sortByMetric: (column: string) => `${column} (de mayor a menor)`,
  noCurrency: '—',
  loadError: 'No pudimos cargar la comparación de sedes.',
  badRequest: 'El período no es válido: «Desde» no puede ser posterior a «Hasta» y caben como mucho 366 días.',
  forbiddenTitle: 'Tu rol no tiene acceso a los reportes.',
  forbiddenHint: 'Los reportes son para la administración de la clínica.',
  empty: 'No hay actividad en este período',
  emptyHint: 'No hubo citas, procedimientos realizados ni cobros en ninguna de tus sedes. Prueba con otro período.',
  loading: 'Cargando la comparación',
};
const copy = locationsComparisonCopy;

const COMPARE_MODES: CompareMode[] = ['previous', 'previous_year', 'none'];

/** Indicadores que dependen de la producción atribuida (BE-045). */
const ATTRIBUTION_SENSITIVE: ReadonlySet<string> = new Set(['production', 'collectionRate']);

/** Indicadores calculados por cita: su base son las citas atendidas del período comparado (ver `deltaBase`). */
const APPOINTMENT_RATES: ReadonlySet<string> = new Set(['noShowRate', 'occupancy', 'averageTicket']);

type SortOption = { value: string; label: string; sort: SortState | null };

function ariaSort(sort: SortState | null, key: SortKey): 'ascending' | 'descending' | 'none' {
  return sort?.key === key ? sort.direction : 'none';
}

/**
 * La flecha del orden. En reposo solo se ve la de la columna ordenada; las demás
 * aparecen al pasar o enfocar (siempre en táctil). En las columnas de cifras
 * (`overlay`) flota a la izquierda del texto, en el hueco que deja la
 * alineación a la derecha: no ensancha la columna.
 */
function SortIcon({ sort, column, overlay = false }: { sort: SortState | null; column: SortKey; overlay?: boolean }) {
  const place = overlay ? 'absolute top-1/2 right-full mr-0.5 -translate-y-1/2' : '';
  if (sort?.key !== column) {
    return (
      <ArrowUpDown
        aria-hidden
        className={cn(
          'size-3.5 shrink-0 opacity-0 transition-opacity group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60 pointer-coarse:opacity-60',
          place,
        )}
      />
    );
  }
  const Icon = sort.direction === 'ascending' ? ArrowUp : ArrowDown;
  return <Icon aria-hidden className={cn('size-3.5 shrink-0', place)} />;
}

/**
 * La cabecera se parte solo entre palabras: «No-show %» no se rompe por el
 * guion ni deja el «%» solo en una línea (critique-ops §11: «No- / show / %»).
 * El texto (y el nombre accesible) no cambia.
 */
function HeaderLabel({ label }: { label: string }) {
  const words = label.split(' ');
  if (words.length > 1 && words[words.length - 1] === '%') {
    words.splice(-2, 2, `${words[words.length - 2]} %`);
  }
  return (
    <span>
      {words.map((word, i) => (
        <React.Fragment key={i}>
          {i > 0 ? ' ' : null}
          <span className="whitespace-nowrap">{word}</span>
        </React.Fragment>
      ))}
    </span>
  );
}

/**
 * Las monedas de una celda: una línea por moneda, nunca sumadas, y sin las
 * monedas en las que no hubo nada ni antes ni ahora (`activeValues`).
 */
function MetricCell({
  def,
  row,
  compare,
  fmt,
  align = 'end',
  strong = false,
}: {
  def: KpiDefinition;
  row: ComparisonRow;
  compare: boolean;
  fmt: RegionalFormat;
  align?: 'start' | 'end';
  strong?: boolean;
}) {
  const values = activeValues(row, def.key as KpiKey);
  if (values.length === 0) {
    return <span className="text-muted">{copy.noCurrency}</span>;
  }
  const sample = APPOINTMENT_RATES.has(def.key) ? previousSample(row) : undefined;
  return (
    <span className={cn('flex flex-col', align === 'end' ? 'items-end gap-2' : 'gap-1.5')}>
      {values.map((m) => (
        <MetricValue
          key={m.currency ?? def.key}
          unit={def.unit}
          changeUnit={def.changeUnit}
          metric={compare ? m : { ...m, trend: null }}
          currency={m.currency}
          fmt={fmt}
          align={align}
          sample={sample}
          strong={strong}
        />
      ))}
    </span>
  );
}

function ComparisonSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-surface-sunken px-4 py-3">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="divide-y divide-border-subtle">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="grid grid-cols-3 gap-4 px-4 py-4 sm:grid-cols-9">
            {Array.from({ length: 9 }, (_, j) => (
              <Skeleton key={j} className={cn('h-4', j > 2 && 'max-sm:hidden')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Producción y Cobrado por sede en la moneda principal (la primera del total),
 * con la misma escala para poder compararlos. Solo con dos sedes o más y algo
 * que pintar: una barra sola no es un gráfico.
 */
function SedeCharts({ data, fmt }: { data: LocationsComparison; fmt: RegionalFormat }) {
  const currency = sortCurrency(data, 'production') ?? sortCurrency(data, 'collected');
  if (!currency || data.locations.length < 2) return null;
  const barsOf = (key: KpiKey): RankedBar[] =>
    data.locations.map((row) => {
      const value = metricValues(row, key).find((m) => m.currency === currency)?.value ?? 0;
      return {
        key: row.locationId ?? row.name,
        name: row.name,
        value,
        display: formatMetric('MONEY', value, fmt, currency),
      };
    });
  const production = barsOf('production');
  const collected = barsOf('collected');
  const all = [...production, ...collected];
  if (all.every((b) => b.value <= 0)) return null;
  const max = Math.max(...all.map((b) => b.value));
  const others = (['production', 'collected'] as KpiKey[]).some((key) =>
    activeValues(data.total, key).some((m) => m.currency && m.currency !== currency),
  );
  const caption = copy.chartCaption(currency, others);
  return (
    <section aria-label={copy.charts}>
      <Card className="grid gap-6 p-4 sm:p-6 md:grid-cols-2 md:gap-8">
        <RankedBars title={copy.chartProduction} caption={caption} bars={production} max={max} />
        <RankedBars title={copy.chartCollected} caption={caption} bars={collected} max={max} />
      </Card>
    </section>
  );
}

/**
 * «Comparar sedes» (DX-014, solo ADMIN): una fila por sede y el «Total
 * clínica», con los ocho indicadores de la API (`kpis`, su definición y su
 * dirección «mejor») frente al período anterior o al del año anterior. Cada
 * columna explica cómo se calcula y se puede ordenar (`aria-sort`); el CSV sale
 * con los mismos filtros. Encima, Producción y Cobrado por sede en barras.
 *
 * Por qué no `DataList`: la tabla necesita un pie («Total clínica», que no se
 * ordena) y `aria-sort` en cada cabecera, que la primitiva no ofrece (pedido en
 * el informe B5). En el teléfono, una tarjeta por sede con los indicadores en
 * rejilla 2×N (critique-ops §11: «el mejor colapso de tabla del producto»).
 */
export function LocationsComparisonView({ token }: { token: string }) {
  // Sin zona de la sede no hay «hoy» ni período por defecto: `SedeConfigError`.
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  // DX-378 (FE-078): cifras, % y fechas con el formato de la sede, no con «es».
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const today = timeZone ? sedeToday(timeZone) : null;
  const [preset, setPreset] = useState<PeriodPresetKey>('this_month');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [compare, setCompare] = useState<CompareMode>('previous');
  const [sort, setSort] = useState<SortState | null>(null);
  const [data, setData] = useState<LocationsComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const ids = React.useId();
  const periodErrorId = `${ids}-period-error`;

  const presetPeriod = today ? periodFor(preset, today) : null;
  const period = preset === 'custom' ? (custom ?? (today ? periodFor('this_month', today) : null)) : presetPeriod;
  // Un personalizado inválido se dice junto a las fechas (escalón 4), sin pedir
  // a la API un 400 que solo podría «Reintentarse» igual.
  const invalidPeriod = preset === 'custom' && period !== null && !isValidPeriod(period);
  const filters: LocationsComparisonFilters | null = period && !invalidPeriod ? { ...period, compare } : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as LocationsComparisonFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getLocationsComparison(token, query);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setLoadError(
          apiErrorMessage(err, {
            fallback: copy.loadError,
            byStatus: { 400: copy.badRequest },
          }),
        );
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, reloadKey]);

  async function exportCsv() {
    if (!filterKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const query = JSON.parse(filterKey) as LocationsComparisonFilters;
      const text = await downloadLocationsComparisonCsv(token, query);
      saveCsv(text, `comparar-sedes-${query.from}-${query.to}.csv`, { bom: true });
      setNotice(copy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: copy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  function choosePreset(next: PeriodPresetKey) {
    if (next === 'custom' && period) setCustom(period);
    setPreset(next);
  }

  const showLoading = !invalidPeriod && (loading || !filters);
  const compared = Boolean(data && data.compare !== 'none');
  const unattributed = compared && Boolean(data?.previousPeriodUnattributed);
  const marked = (key: string) => unattributed && ATTRIBUTION_SENSITIVE.has(key);
  const kpis = data?.kpis ?? [];
  const markedCount = kpis.filter((k) => marked(k.key)).length;
  const howOf = (k: KpiDefinition) => (marked(k.key) ? `${k.howItIsCalculated} ${copy.unattributedHow}` : k.howItIsCalculated);
  const rows = data ? sortRows(data, sort) : [];
  const sortOptions: SortOption[] = [
    { value: '', label: copy.sortDefault, sort: null },
    { value: 'name', label: copy.sortByName, sort: { key: 'name', direction: 'ascending' } },
    ...kpis.map((k) => ({
      value: k.key,
      label: copy.sortByMetric(k.label),
      sort: nextSort(null, k.key as KpiKey),
    })),
  ];

  if (forbidden) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="t-caption inline-flex items-center gap-1.5 text-muted">
        <Building2 aria-hidden className="size-4 shrink-0" />
        <span>{copy.scope}</span>
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <FormField htmlFor={`${ids}-period`} label={copy.period} className="sm:w-48">
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
            <FormField htmlFor={`${ids}-dates`} label={copy.dates} className="sm:w-72">
              <DateRangePicker
                id={`${ids}-dates`}
                value={period}
                onChange={(range) => {
                  if (range) setCustom(range);
                }}
                startLabel={copy.from}
                endLabel={copy.to}
                isInvalid={invalidPeriod}
                aria-describedby={invalidPeriod ? periodErrorId : undefined}
              />
            </FormField>
          ) : null}
          <FormField htmlFor={`${ids}-compare`} label={copy.compare} className="sm:w-64">
            <NativeSelect
              id={`${ids}-compare`}
              value={compare}
              onChange={(e) => setCompare(e.target.value as CompareMode)}
            >
              {COMPARE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {copy.compareOptions[mode]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void exportCsv()}
          disabled={exporting || showLoading || invalidPeriod || Boolean(loadError)}
          className="shrink-0 self-start sm:self-auto"
        >
          <Download aria-hidden />
          {exporting ? copy.exporting : copy.export}
        </Button>
      </div>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {invalidPeriod ? <InlineError id={periodErrorId}>{copy.badRequest}</InlineError> : null}

      {data && fmt && !invalidPeriod && !showLoading && !loadError ? (
        <p className="text-sm text-muted tabular-nums">
          {copy.periodLine(fmt.civilDate(data.from), fmt.civilDate(data.to))}
          {data.previousFrom && data.previousTo
            ? `, ${copy.comparedWith(fmt.civilDate(data.previousFrom), fmt.civilDate(data.previousTo))}`
            : ''}
        </p>
      ) : null}

      {invalidPeriod ? null : zone.status === 'error' && !period ? (
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
          isEmpty={!data?.hasActivity}
          emptyTitle={copy.empty}
          emptyDescription={copy.emptyHint}
          skeleton={<ComparisonSkeleton />}
        >
          {data && fmt ? (
            <>
              {unattributed && markedCount > 0 ? (
                <div role="note" className="-mx-2 max-w-[80ch] self-start">
                  <Disclosure summary={copy.unattributedSummary(markedCount)}>
                    <p className="text-sm text-muted">{copy.unattributedNote}</p>
                  </Disclosure>
                </div>
              ) : null}

              <SedeCharts data={data} fmt={fmt} />

              {/* Tablet y escritorio: una tabla con cabeceras ordenables y el total al pie. */}
              <Card className="overflow-hidden p-0 max-sm:hidden">
                <Table aria-label={copy.tableLabel} stack={false}>
                  <caption className="sr-only">{copy.tableLabel}</caption>
                  <thead>
                    <tr className="border-b border-border bg-surface-sunken">
                      <th
                        scope="col"
                        aria-sort={ariaSort(sort, 'name')}
                        className="min-w-32 px-4 py-2 text-left align-bottom"
                      >
                        <button
                          type="button"
                          onClick={() => setSort((s) => nextSort(s, 'name'))}
                          className="group/sort t-label inline-flex min-h-8 items-center gap-1 rounded text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          {copy.location}
                          <SortIcon sort={sort} column="name" />
                        </button>
                      </th>
                      {kpis.map((k) => (
                        <th
                          key={k.key}
                          scope="col"
                          aria-sort={ariaSort(sort, k.key as KpiKey)}
                          className="px-2.5 py-2 text-right align-bottom"
                        >
                          <span className="inline-flex items-center justify-end gap-0.5">
                            <button
                              type="button"
                              onClick={() => setSort((s) => nextSort(s, k.key as KpiKey))}
                              className="group/sort t-label relative inline-flex min-h-8 items-center gap-1 rounded text-right text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              <HeaderLabel label={k.label} />
                              <SortIcon sort={sort} column={k.key as KpiKey} overlay />
                            </button>
                            <HowCalculated column={k.label} text={howOf(k)} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {rows.map((row) => (
                      <tr key={row.locationId} data-testid="comparison-row" className="align-top hover:bg-surface-sunken">
                        <th scope="row" className="px-4 py-3 text-left font-medium text-ink">
                          {row.name}
                          {!row.isActive ? (
                            <span className="block text-xs font-normal text-muted">{copy.inactive}</span>
                          ) : null}
                        </th>
                        {kpis.map((k) => (
                          <td key={k.key} className="px-2.5 py-3 text-right">
                            <MetricCell def={k} row={row} compare={compared} fmt={fmt} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-surface-sunken">
                    <tr data-testid="comparison-total" className="align-top">
                      <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                        {data.total.name}
                      </th>
                      {kpis.map((k) => (
                        <td key={k.key} className="px-2.5 py-3 text-right">
                          <MetricCell def={k} row={data.total} compare={compared} fmt={fmt} strong />
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </Table>
              </Card>

              {/* Teléfono: una tarjeta por sede (y el total al final), sin scroll lateral. */}
              <div className="flex flex-col gap-3 sm:hidden">
                <FormField htmlFor={`${ids}-sort`} label={copy.sortBy}>
                  <NativeSelect
                    id={`${ids}-sort`}
                    value={sort?.key ?? ''}
                    onChange={(e) => {
                      const option = sortOptions.find((o) => o.value === e.target.value);
                      if (option) setSort(option.sort);
                    }}
                  >
                    {sortOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <ul aria-label={copy.cardsLabel} className="flex flex-col gap-3">
                  {[...rows, data.total].map((row) => (
                    <li
                      key={row.locationId ?? 'total'}
                      data-testid={row.locationId ? 'comparison-card' : 'comparison-total-card'}
                      className={cn(
                        'rounded-xl border border-border p-4',
                        row.locationId ? 'bg-surface' : 'bg-surface-sunken',
                      )}
                    >
                      <h2 className="t-title text-ink">
                        {row.name}
                        {!row.isActive ? (
                          <span className="ml-2 text-xs font-normal text-muted">{copy.inactive}</span>
                        ) : null}
                      </h2>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                        {kpis.map((k) => (
                          <div key={k.key} className="min-w-0">
                            <dt className="t-label flex items-center gap-0.5 text-muted">
                              <span className="min-w-0">{k.label}</span>
                              <HowCalculated column={k.label} text={howOf(k)} />
                            </dt>
                            <dd className="mt-1">
                              <MetricCell def={k} row={row} compare={compared} fmt={fmt} align="start" strong={!row.locationId} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </AsyncSection>
      )}
    </div>
  );
}
