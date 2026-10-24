'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, Download, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatCivilDate } from '@/lib/format/date';
import { sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { saveCsv } from '@/lib/patient-imports/patient-imports-api';
import { isValidPeriod, PERIOD_PRESETS, periodFor, type PeriodPresetKey } from '@/lib/reports/period-presets';
import { metricValues, nextSort, sortRows, type SortKey, type SortState } from '@/lib/reports/comparison-table';
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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { toolbarFieldClass } from '@/components/shared/list-toolbar';
import { HowCalculated } from './how-calculated';
import { MetricValue } from './metric-value';
import { cn } from '@/lib/utils';

export const locationsComparisonCopy = {
  period: 'Período',
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
  scope: 'Todas tus sedes · importes por moneda, sin convertir',
  periodLine: (from: string, to: string) => `Del ${from} al ${to}`,
  comparedWith: (from: string, to: string) => `comparado con ${from} – ${to}`,
  legend:
    'Verde: mejora · rojo: empeora frente al período comparado. La flecha dice si el valor subió o bajó. En los porcentajes, la variación va en puntos (p.p.).',
  // BE-045: una línea junto a la tabla cuando el período comparado no tiene
  // toda su producción atribuida a una sede.
  unattributedNote:
    '«Producción» y «% de cobro» no se comparan donde dice «Sin comparar»: el período comparado tiene procedimientos realizados antes de registrar su sede («Sin atribuir») o cobros sin producción.',
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

const COMPARE_MODES: CompareMode[] = ['previous', 'previous_year', 'none'];

/** Indicadores que dependen de la producción atribuida (BE-045). */
const ATTRIBUTION_SENSITIVE: ReadonlySet<string> = new Set(['production', 'collectionRate']);

/**
 * «*» junto a «Producción» y «% de cobro» cuando llega la bandera (BE-045). Es
 * solo visual: el aviso (`role="note"`) y cada celda «Sin comparar» lo dicen en
 * texto.
 */
function UnattributedMark() {
  return (
    <span aria-hidden data-testid="unattributed-mark" className="font-semibold text-warning">
      *
    </span>
  );
}

type SortOption = { value: string; label: string; sort: SortState | null };

function ariaSort(sort: SortState | null, key: SortKey): 'ascending' | 'descending' | 'none' {
  return sort?.key === key ? sort.direction : 'none';
}

function SortIcon({ sort, column }: { sort: SortState | null; column: SortKey }) {
  if (sort?.key !== column) return <ArrowUpDown aria-hidden className="size-3.5 shrink-0 opacity-60" />;
  return sort.direction === 'ascending' ? (
    <ArrowUp aria-hidden className="size-3.5 shrink-0" />
  ) : (
    <ArrowDown aria-hidden className="size-3.5 shrink-0" />
  );
}

/** Las monedas de una celda de dinero: una línea por moneda, nunca sumadas. */
function MetricCell({ def, row, compare }: { def: KpiDefinition; row: ComparisonRow; compare: boolean }) {
  const values = metricValues(row, def.key as KpiKey);
  if (values.length === 0) {
    return <span className="text-muted">{locationsComparisonCopy.noCurrency}</span>;
  }
  return (
    <span className="flex flex-col items-end gap-2">
      {values.map((m) => (
        <MetricValue
          key={m.currency ?? def.key}
          unit={def.unit}
          changeUnit={def.changeUnit}
          metric={compare ? m : { ...m, trend: null }}
          currency={m.currency}
        />
      ))}
    </span>
  );
}

function ComparisonSkeleton() {
  return (
    <div
      role="status"
      aria-label={locationsComparisonCopy.loading}
      className="overflow-hidden rounded-xl border border-border"
    >
      <div className="border-b border-border bg-surface-2 px-4 py-3">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="divide-y divide-hairline">
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
 * «Comparar sedes» (DX-014, solo ADMIN): una fila por sede y el «Total
 * clínica», con los ocho indicadores de la API (`kpis`, su definición y su
 * dirección «mejor») frente al período anterior o al del año anterior. Cada
 * columna explica cómo se calcula y se puede ordenar (`aria-sort`); el CSV sale
 * con los mismos filtros. En escritorio es una tabla; bajo `sm`, una tarjeta
 * por sede, sin scroll lateral.
 */
export function LocationsComparisonView({ token }: { token: string }) {
  const timeZone = useSedeTimeZone(token);
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
  const periodErrorId = React.useId();

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
            fallback: locationsComparisonCopy.loadError,
            byStatus: { 400: locationsComparisonCopy.badRequest },
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
      saveCsv(text, `comparar-sedes-${query.from}-${query.to}.csv`);
      setNotice(locationsComparisonCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: locationsComparisonCopy.exportError }), {
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
  const rows = data ? sortRows(data, sort) : [];
  const sortOptions: SortOption[] = [
    { value: '', label: locationsComparisonCopy.sortDefault, sort: null },
    { value: 'name', label: locationsComparisonCopy.sortByName, sort: { key: 'name', direction: 'ascending' } },
    ...kpis.map((k) => ({
      value: k.key,
      label: locationsComparisonCopy.sortByMetric(k.label),
      sort: nextSort(null, k.key as KpiKey),
    })),
  ];

  if (forbidden) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={locationsComparisonCopy.forbiddenTitle}
        description={locationsComparisonCopy.forbiddenHint}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="inline-flex max-w-[68ch] items-center gap-2 self-start rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-ink">
        <Building2 aria-hidden className="size-4 shrink-0 text-muted/80" />
        <span>{locationsComparisonCopy.scope}</span>
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <label className="col-span-2 flex min-w-0 flex-col gap-1 text-sm text-muted sm:col-span-1">
            {locationsComparisonCopy.period}
            <select
              aria-label={locationsComparisonCopy.period}
              value={preset}
              onChange={(e) => choosePreset(e.target.value as PeriodPresetKey)}
              className={cn(toolbarFieldClass, 'sm:w-48')}
            >
              {PERIOD_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {preset === 'custom' && period ? (
            <>
              <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
                {locationsComparisonCopy.from}
                <Input
                  type="date"
                  value={period.from}
                  max={period.to}
                  onChange={(e) => {
                    if (e.target.value) setCustom({ from: e.target.value, to: period.to });
                  }}
                  className="tabular-nums sm:w-44"
                  aria-invalid={invalidPeriod || undefined}
                  aria-describedby={invalidPeriod ? periodErrorId : undefined}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
                {locationsComparisonCopy.to}
                <Input
                  type="date"
                  value={period.to}
                  min={period.from}
                  onChange={(e) => {
                    if (e.target.value) setCustom({ from: period.from, to: e.target.value });
                  }}
                  className="tabular-nums sm:w-44"
                  aria-invalid={invalidPeriod || undefined}
                  aria-describedby={invalidPeriod ? periodErrorId : undefined}
                />
              </label>
            </>
          ) : null}
          <label className="col-span-2 flex min-w-0 flex-col gap-1 text-sm text-muted sm:col-span-1">
            {locationsComparisonCopy.compare}
            <select
              aria-label={locationsComparisonCopy.compare}
              value={compare}
              onChange={(e) => setCompare(e.target.value as CompareMode)}
              className={cn(toolbarFieldClass, 'sm:w-64')}
            >
              {COMPARE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {locationsComparisonCopy.compareOptions[mode]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button
          type="button"
          onClick={() => void exportCsv()}
          disabled={exporting || showLoading || invalidPeriod || Boolean(loadError)}
          className="shrink-0"
        >
          <Download aria-hidden />
          {exporting ? locationsComparisonCopy.exporting : locationsComparisonCopy.export}
        </Button>
      </div>

      <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
        {notice}
      </p>

      {invalidPeriod ? <InlineError id={periodErrorId}>{locationsComparisonCopy.badRequest}</InlineError> : null}

      {data && !invalidPeriod && !showLoading && !loadError ? (
        <p className="text-sm text-muted tabular-nums">
          {locationsComparisonCopy.periodLine(formatCivilDate(data.from), formatCivilDate(data.to))}
          {data.previousFrom && data.previousTo
            ? `, ${locationsComparisonCopy.comparedWith(formatCivilDate(data.previousFrom), formatCivilDate(data.previousTo))}`
            : ''}
        </p>
      ) : null}

      {invalidPeriod ? null : (
        <AsyncSection
          loading={showLoading}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={!data?.hasActivity}
          emptyTitle={locationsComparisonCopy.empty}
          emptyDescription={locationsComparisonCopy.emptyHint}
          skeleton={<ComparisonSkeleton />}
        >
          {data ? (
            <>
              {compared ? <p className="text-xs text-muted">{locationsComparisonCopy.legend}</p> : null}
              {unattributed ? (
                <p
                  role="note"
                  className="flex max-w-[80ch] items-start gap-1.5 self-start rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
                >
                  <span aria-hidden className="font-semibold">
                    *
                  </span>
                  <span>{locationsComparisonCopy.unattributedNote}</span>
                </p>
              ) : null}

              {/* Escritorio: una tabla con cabeceras ordenables. */}
              <Card className="overflow-hidden p-0 max-sm:hidden">
                <Table aria-label={locationsComparisonCopy.tableLabel}>
                  <caption className="sr-only">{locationsComparisonCopy.tableLabel}</caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" aria-sort={ariaSort(sort, 'name')} className="px-4 py-2 text-left align-bottom">
                        <button
                          type="button"
                          onClick={() => setSort((s) => nextSort(s, 'name'))}
                          className="t-label inline-flex min-h-8 items-center gap-1 rounded text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          {locationsComparisonCopy.location}
                          <SortIcon sort={sort} column="name" />
                        </button>
                      </th>
                      {kpis.map((k) => (
                        <th
                          key={k.key}
                          scope="col"
                          aria-sort={ariaSort(sort, k.key as KpiKey)}
                          className="px-3 py-2 text-right align-bottom"
                        >
                          <span className="inline-flex items-center justify-end gap-0.5">
                            <button
                              type="button"
                              onClick={() => setSort((s) => nextSort(s, k.key as KpiKey))}
                              className="t-label inline-flex min-h-8 items-center gap-1 rounded text-right text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            >
                              {k.label}
                              {marked(k.key) ? <UnattributedMark /> : null}
                              <SortIcon sort={sort} column={k.key as KpiKey} />
                            </button>
                            <HowCalculated column={k.label} text={k.howItIsCalculated} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {rows.map((row) => (
                      <tr key={row.locationId} data-testid="comparison-row" className="align-top hover:bg-bg">
                        <th scope="row" className="px-4 py-3 text-left font-medium text-ink">
                          {row.name}
                          {!row.isActive ? (
                            <span className="block text-xs font-normal text-muted">
                              {locationsComparisonCopy.inactive}
                            </span>
                          ) : null}
                        </th>
                        {kpis.map((k) => (
                          <td key={k.key} className="px-3 py-3 text-right">
                            <MetricCell def={k} row={row} compare={compared} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-bg">
                    <tr data-testid="comparison-total" className="align-top">
                      <th scope="row" className="px-4 py-3 text-left font-semibold text-ink">
                        {data.total.name}
                      </th>
                      {kpis.map((k) => (
                        <td key={k.key} className="px-3 py-3 text-right">
                          <MetricCell def={k} row={data.total} compare={compared} />
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </Table>
              </Card>

              {/* Móvil: una tarjeta por sede (y el total al final), sin scroll lateral. */}
              <div className="flex flex-col gap-3 sm:hidden">
                <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
                  {locationsComparisonCopy.sortBy}
                  <select
                    aria-label={locationsComparisonCopy.sortBy}
                    value={sort?.key ?? ''}
                    onChange={(e) => {
                      const option = sortOptions.find((o) => o.value === e.target.value);
                      if (option) setSort(option.sort);
                    }}
                    className={toolbarFieldClass}
                  >
                    {sortOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <ul aria-label={locationsComparisonCopy.cardsLabel} className="flex flex-col gap-3">
                  {[...rows, data.total].map((row) => (
                    <li
                      key={row.locationId ?? 'total'}
                      data-testid={row.locationId ? 'comparison-card' : 'comparison-total-card'}
                      className={cn(
                        'rounded-xl border border-border p-4',
                        row.locationId ? 'bg-surface' : 'bg-bg',
                      )}
                    >
                      <h2 className="t-title text-ink">
                        {row.name}
                        {!row.isActive ? (
                          <span className="ml-2 text-xs font-normal text-muted">{locationsComparisonCopy.inactive}</span>
                        ) : null}
                      </h2>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                        {kpis.map((k) => (
                          <div key={k.key} className="min-w-0">
                            <dt className="t-label flex items-center gap-0.5 text-muted">
                              <span className="min-w-0">
                                {k.label}
                                {marked(k.key) ? <UnattributedMark /> : null}
                              </span>
                              <HowCalculated column={k.label} text={k.howItIsCalculated} />
                            </dt>
                            <dd className="mt-1">
                              <MobileMetric def={k} row={row} compare={compared} />
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

function MobileMetric({ def, row, compare }: { def: KpiDefinition; row: ComparisonRow; compare: boolean }) {
  const values = metricValues(row, def.key as KpiKey);
  if (values.length === 0) return <span className="text-muted">{locationsComparisonCopy.noCurrency}</span>;
  return (
    <span className="flex flex-col gap-1.5">
      {values.map((m) => (
        <MetricValue
          key={m.currency ?? def.key}
          unit={def.unit}
          changeUnit={def.changeUnit}
          metric={compare ? m : { ...m, trend: null }}
          currency={m.currency}
          align="start"
        />
      ))}
    </span>
  );
}
