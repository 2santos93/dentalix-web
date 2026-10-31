'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Building2, Download, Lock, UserRound } from 'lucide-react';
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
import { productionLines, type ProductionLine } from '@/lib/reports/production-table';
import {
  downloadProductionByProcedureCsv,
  getProductionByProcedure,
  type ProcedureRow,
  type ProductionAmounts,
  type ProductionByProcedure,
  type ProductionFilters,
} from '@/lib/reports/reports-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { InlineError } from '@/components/errors/inline-error';
import { notifyError } from '@/components/errors/notify';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DatePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncSection } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { Card } from '@/components/ui/card';
import { HowCalculated } from './how-calculated';
import { RankedBars } from './ranked-bars';
import { ProductionItemsDialog } from './production-items-dialog';
import { cn } from '@/lib/utils';

export const productionCopy = {
  period: 'Período',
  from: 'Desde',
  to: 'Hasta',
  location: 'Sede de realización',
  locationAll: 'Todas tus sedes',
  professional: 'Profesional',
  professionalAll: 'Todo el equipo',
  category: 'Categoría',
  categoryAll: 'Todas',
  inactive: '(desactivada)',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exported: 'Reporte exportado.',
  exportError: 'No pudimos exportar el reporte.',
  scopeClinic: 'Sede donde se realizó cada procedimiento · importes por moneda, sin convertir',
  scopeOwn: 'Solo tu producción · importes por moneda, sin convertir',
  periodLine: (from: string, to: string) => `Realizados del ${from} al ${to}`,
  tableLabel: 'Producción por procedimiento y categoría',
  columns: {
    procedure: 'Procedimiento',
    currency: 'Moneda',
    count: 'Cantidad',
    gross: 'Bruto',
    discounts: 'Descuentos',
    net: 'Neto',
    averageNet: 'Honorario medio',
    catalogAverage: 'Medio de catálogo',
    difference: 'Diferencia',
  },
  howAverage: 'Neto (bruto − descuentos) ÷ cantidad de procedimientos realizados.',
  howCatalog:
    'El precio de catálogo que quedó guardado en cada procedimiento al presupuestarlo, en promedio. «—» si ninguno lo tiene (anteriores a las listas de precios).',
  howDifference:
    'Cuánto se cobró de más o de menos frente al catálogo, en los procedimientos que lo tienen: (neto − catálogo) ÷ catálogo. Negativo = por debajo del catálogo (convenios, descuentos o rebajas).',
  openRow: (code: string, label: string, currency: string) =>
    `Ver los procedimientos de ${code} ${label} en ${currency}`,
  subtotal: (category: string) => `Subtotal ${category}`,
  total: 'Total',
  unattributed: 'Sin atribuir',
  unattributedNote:
    '«Sin atribuir»: procedimientos realizados en el período sin sede de realización (anteriores a registrarla). Van en su propia línea, fuera de las categorías; se atribuyen desde el plan del paciente.',
  undatedNote: (count: number, amounts: string) =>
    `Además hay ${count} ${count === 1 ? 'procedimiento realizado' : 'procedimientos realizados'} sin fecha («Sin atribuir»: ${amounts}). No son de ningún período, así que no entran en la tabla; se atribuyen desde el plan del paciente.`,
  noValue: '—',
  chartTitle: 'Neto por categoría',
  chartCaption: (currency: string, others: boolean) =>
    others ? `En ${currency}; las demás monedas, en la tabla.` : `En ${currency}.`,
  uncategorized: 'Sin categoría',
  loadError: 'No pudimos cargar la producción por procedimiento.',
  badRequest: 'El período no es válido: «Desde» no puede ser posterior a «Hasta» y caben como mucho 24 meses.',
  forbiddenTitle: 'Tu rol no tiene acceso a la producción.',
  forbiddenHint: 'La ven la administración y los odontólogos (cada uno, la suya).',
  empty: 'No hay procedimientos realizados en este período',
  emptyHint: 'Prueba con otro período o quita algún filtro.',
  loading: 'Cargando la producción',
};

function ProductionSkeleton() {
  return (
    <div role="status" aria-label={productionCopy.loading} className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-surface-sunken px-4 py-3">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="divide-y divide-border-subtle">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="grid grid-cols-4 gap-4 px-4 py-4 sm:grid-cols-9">
            {Array.from({ length: 9 }, (_, j) => (
              <Skeleton key={j} className={cn('h-4', j > 3 && 'max-sm:hidden')} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** ¿El marco tiene contenido escondido (a un lado o abajo)? Entonces es una región con foco. */
function useScrollable<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = React.useRef<T>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScrollable(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return [ref, scrollable];
}

const num = 'whitespace-nowrap px-3 py-2 text-right tabular-nums';
/** Primera columna fija al desplazar de lado (390 px). */
const firstCol = 'sticky left-0 z-[1] px-3 py-2 text-left';

function AmountCells({
  totals,
  average,
  fmt,
}: {
  totals: ProductionAmounts & { averageNet?: number };
  average: boolean;
  fmt: RegionalFormat;
}) {
  return (
    <>
      <td className={num}>{fmt.number(totals.count)}</td>
      <td className={num}>{moneyWithCode(totals.gross, totals.currency, fmt)}</td>
      <td className={num}>{moneyWithCode(totals.discounts, totals.currency, fmt)}</td>
      <td className={cn(num, 'font-medium')}>{moneyWithCode(totals.net, totals.currency, fmt)}</td>
      <td className={num}>
        {average && totals.averageNet !== undefined
          ? moneyWithCode(totals.averageNet, totals.currency, fmt)
          : productionCopy.noValue}
      </td>
    </>
  );
}

function DifferenceValue({ value, fmt }: { value: number | null; fmt: RegionalFormat }) {
  if (value === null) return <span className="text-muted">{productionCopy.noValue}</span>;
  const text = `${value > 0 ? '+' : ''}${fmt.percent(value, 1)}`;
  return <span className={cn('font-medium', value < 0 ? 'text-danger-text' : 'text-ink')}>{text}</span>;
}

function LineRow({
  line,
  fmt,
  onOpen,
}: {
  line: ProductionLine;
  fmt: RegionalFormat;
  onOpen: (row: ProcedureRow) => void;
}) {
  switch (line.kind) {
    case 'category':
      return (
        // Una celda fija a la izquierda (como la primera columna) y el resto
        // vacío con el mismo fondo: con colSpan sobre todo el ancho, el nombre
        // se iba con el scroll lateral a 390 px.
        <tr className="bg-canvas">
          <th scope="colgroup" className={cn(firstCol, 'whitespace-nowrap bg-canvas t-label pt-4 text-ink')}>
            {line.category}
          </th>
          <td colSpan={8} aria-hidden="true" className="bg-canvas" />
        </tr>
      );
    case 'procedure': {
      const { row } = line;
      return (
        <tr
          data-testid="production-row"
          className="h-11 cursor-pointer text-ink hover:bg-surface-sunken"
          onClick={() => onOpen(row)}
        >
          <th scope="row" className={cn(firstCol, 'bg-surface font-normal')}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(row);
              }}
              aria-label={productionCopy.openRow(row.code, row.label, row.currency)}
              className="flex min-h-8 flex-col items-start rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="text-xs tabular-nums text-muted">{row.code}</span>
              <span className="font-medium text-primary-text underline-offset-2 hover:underline">{row.label}</span>
            </button>
          </th>
          <td className="px-3 py-2">{row.currency}</td>
          <AmountCells totals={row} average fmt={fmt} />
          <td className={num}>
            {row.catalogAverage === null ? (
              <span className="text-muted">{productionCopy.noValue}</span>
            ) : (
              moneyWithCode(row.catalogAverage, row.currency, fmt)
            )}
          </td>
          <td className={num}>
            <DifferenceValue value={row.differencePercent} fmt={fmt} />
          </td>
        </tr>
      );
    }
    case 'subtotal':
      return (
        <tr data-testid="production-subtotal" className="h-11 bg-canvas text-ink">
          <th scope="row" className={cn(firstCol, 'bg-canvas font-medium')}>
            {productionCopy.subtotal(line.category)}
          </th>
          <td className="px-3 py-2">{line.currency}</td>
          <AmountCells totals={line.totals} average fmt={fmt} />
          <td className={num} />
          <td className={num} />
        </tr>
      );
    case 'total':
      return (
        <tr data-testid="production-total" className="h-11 border-t border-border bg-surface-sunken font-semibold text-ink">
          <th scope="row" className={cn(firstCol, 'bg-surface-sunken')}>
            {productionCopy.total}
          </th>
          <td className="px-3 py-2">{line.currency}</td>
          <AmountCells totals={line.totals} average fmt={fmt} />
          <td className={num} />
          <td className={num} />
        </tr>
      );
    case 'unattributed':
      return (
        <tr data-testid="production-unattributed" className="h-11 bg-surface text-ink">
          <th scope="row" className={cn(firstCol, 'bg-surface font-medium')}>
            {productionCopy.unattributed}
            <span aria-hidden className="font-semibold text-warning-text">
              *
            </span>
          </th>
          <td className="px-3 py-2">{line.currency}</td>
          <AmountCells totals={line.totals} average={false} fmt={fmt} />
          <td className={num} />
          <td className={num} />
        </tr>
      );
  }
}

/**
 * La tabla en su marco: se desplaza dentro de él (de lado y hacia abajo) con
 * la cabecera y la primera columna fijas. Monta con los datos, así mide el
 * marco ya pintado; solo si hay algo escondido es una región con nombre y
 * parada de tabulador (DESIGN.md, «Tables · Wider than its slot»).
 */
function ProductionTable({
  lines,
  fmt,
  onOpen,
}: {
  lines: ProductionLine[];
  fmt: RegionalFormat;
  onOpen: (row: ProcedureRow) => void;
}) {
  const [frame, scrollable] = useScrollable<HTMLDivElement>();
  const c = productionCopy.columns;
  const headers: { label: string; how?: string; align: 'left' | 'right' }[] = [
    { label: c.currency, align: 'left' },
    { label: c.count, align: 'right' },
    { label: c.gross, align: 'right' },
    { label: c.discounts, align: 'right' },
    { label: c.net, align: 'right' },
    { label: c.averageNet, how: productionCopy.howAverage, align: 'right' },
    { label: c.catalogAverage, how: productionCopy.howCatalog, align: 'right' },
    { label: c.difference, how: productionCopy.howDifference, align: 'right' },
  ];
  return (
    <div
      ref={frame}
      className={cn(
        'max-h-[70vh] min-w-0 max-w-full overflow-auto rounded-xl border border-border bg-surface',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
      )}
      {...(scrollable
        ? {
            role: 'region',
            tabIndex: 0,
            'aria-label': productionCopy.tableLabel,
          }
        : {})}
    >
      <table className="w-full min-w-[60rem] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{productionCopy.tableLabel}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="t-label sticky left-0 top-0 z-[3] border-b border-border bg-surface-sunken px-3 py-2 text-left align-bottom text-ink"
            >
              {c.procedure}
            </th>
            {headers.map((h) => (
              <th
                key={h.label}
                scope="col"
                className={cn(
                  't-label sticky top-0 z-[2] border-b border-border bg-surface-sunken px-3 py-2 align-bottom text-ink',
                  h.align === 'right' ? 'text-right' : 'text-left',
                )}
              >
                <span className={cn('inline-flex items-center gap-0.5', h.align === 'right' && 'justify-end')}>
                  {h.label}
                  {h.how ? <HowCalculated column={h.label} text={h.how} /> : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-b [&_td]:border-border-subtle [&_th]:border-b [&_th]:border-border-subtle">
          {lines.map((line) => (
            <LineRow key={line.key} line={line} fmt={fmt} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Neto por categoría en la moneda principal (la primera del total): qué
 * categorías sostienen la producción, de un vistazo y antes del detalle. Solo
 * con dos categorías o más (una barra sola no es un gráfico).
 */
function CategoryChart({ data, fmt }: { data: ProductionByProcedure; fmt: RegionalFormat }) {
  const currency = data.totals[0]?.currency;
  if (!currency) return null;
  const bars = data.categoryTotals
    .filter((c) => c.currency === currency)
    .map((c) => ({
      key: c.category ?? '',
      name: c.category ?? productionCopy.uncategorized,
      value: c.net,
      display: moneyWithCode(c.net, currency, fmt),
    }));
  if (bars.length < 2 || bars.every((b) => b.value <= 0)) return null;
  const others = data.totals.some((t) => t.currency !== currency);
  return (
    <Card className="p-4 sm:p-6">
      <RankedBars
        title={productionCopy.chartTitle}
        caption={productionCopy.chartCaption(currency, others)}
        bars={bars}
        className="max-w-3xl"
      />
    </Card>
  );
}

/**
 * «Producción por procedimiento» (DX-423): lo realizado en el período, en la
 * sede donde se hizo, agrupado por categoría y código del catálogo, con el
 * honorario medio frente al de catálogo. Por moneda: cada categoría y el total
 * tienen una línea por moneda, nunca mezcladas. Filtros de sede, profesional
 * (solo ADMIN: un odontólogo ve la suya) y categoría; el CSV sale con las
 * mismas filas. La tabla se desplaza dentro de su marco con la cabecera y la
 * primera columna fijas (también a 390 px). Un clic en una fila abre sus
 * procedimientos con el paciente.
 */
export function ProductionByProcedureView({ token }: { token: string }) {
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const today = timeZone ? sedeToday(timeZone) : null;
  const [preset, setPreset] = useState<PeriodPresetKey>('this_month');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [locationId, setLocationId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [category, setCategory] = useState('');
  const [data, setData] = useState<ProductionByProcedure | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<ProcedureRow | null>(null);
  const periodErrorId = React.useId();

  const presetPeriod = today ? periodFor(preset, today) : null;
  const period = preset === 'custom' ? (custom ?? (today ? periodFor('this_month', today) : null)) : presetPeriod;
  const invalidPeriod = preset === 'custom' && period !== null && !isWithinMonths(period, PRODUCTION_MAX_PERIOD_MONTHS);
  const filters: ProductionFilters | null =
    period && !invalidPeriod
      ? {
          ...period,
          ...(locationId ? { locationId } : {}),
          ...(professionalId ? { professionalId } : {}),
          ...(category ? { category } : {}),
        }
      : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as ProductionFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getProductionByProcedure(token, query);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403 && !query.locationId && !query.professionalId);
        setLoadError(
          apiErrorMessage(err, {
            fallback: productionCopy.loadError,
            byStatus: { 400: productionCopy.badRequest },
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
      const query = JSON.parse(filterKey) as ProductionFilters;
      const text = await downloadProductionByProcedureCsv(token, query);
      saveCsv(text, `produccion-por-procedimiento-${query.from}-${query.to}.csv`, { bom: true });
      setNotice(productionCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: productionCopy.exportError }), {
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

  if (forbidden) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={productionCopy.forbiddenTitle}
        description={productionCopy.forbiddenHint}
      />
    );
  }

  const showLoading = !invalidPeriod && (loading || !filters);
  const own = data?.scope === 'OWN';
  const lines = data ? productionLines(data) : [];
  const options = data?.options;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="t-caption inline-flex items-center gap-1.5 text-muted">
        {own ? (
          <UserRound aria-hidden className="size-4 shrink-0" />
        ) : (
          <Building2 aria-hidden className="size-4 shrink-0" />
        )}
        <span>{own ? productionCopy.scopeOwn : productionCopy.scopeClinic}</span>
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <FormField htmlFor={`${periodErrorId}-period`} label={productionCopy.period} className="col-span-2 sm:col-span-1 sm:w-44">
            <NativeSelect
              id={`${periodErrorId}-period`}
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
            <>
              {/* Dos días sueltos (no un periodo en un campo): cada extremo tiene su
                  propio límite y su nombre («Desde», «Hasta»), como antes. Un
                  extremo a medio escribir no cambia el periodo. */}
              <div className="flex min-w-0 flex-col gap-1.5">
                <span id={`${periodErrorId}-from`} className="text-sm font-medium text-ink">
                  {productionCopy.from}
                </span>
                <DatePicker
                  aria-labelledby={`${periodErrorId}-from`}
                  value={period.from}
                  max={period.to}
                  onChange={(value) => {
                    if (value) setCustom({ from: value, to: period.to });
                  }}
                  className="sm:w-48"
                  isInvalid={invalidPeriod}
                  aria-describedby={invalidPeriod ? periodErrorId : undefined}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span id={`${periodErrorId}-to`} className="text-sm font-medium text-ink">
                  {productionCopy.to}
                </span>
                <DatePicker
                  aria-labelledby={`${periodErrorId}-to`}
                  value={period.to}
                  min={period.from}
                  onChange={(value) => {
                    if (value) setCustom({ from: period.from, to: value });
                  }}
                  className="sm:w-48"
                  isInvalid={invalidPeriod}
                  aria-describedby={invalidPeriod ? periodErrorId : undefined}
                />
              </div>
            </>
          ) : null}
          <FormField htmlFor={`${periodErrorId}-location`} label={productionCopy.location} className="min-w-0 sm:w-48">
            <NativeSelect
              id={`${periodErrorId}-location`}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={!options}
            >
              <option value="">{productionCopy.locationAll}</option>
              {options?.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.isActive ? l.name : `${l.name} ${productionCopy.inactive}`}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {own ? null : (
            <FormField htmlFor={`${periodErrorId}-professional`} label={productionCopy.professional} className="min-w-0 sm:w-48">
              <NativeSelect
                id={`${periodErrorId}-professional`}
                value={professionalId}
                onChange={(e) => setProfessionalId(e.target.value)}
                disabled={!options}
              >
                <option value="">{productionCopy.professionalAll}</option>
                {options?.professionals.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.fullName}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}
          <FormField htmlFor={`${periodErrorId}-category`} label={productionCopy.category} className="min-w-0 sm:w-44">
            <NativeSelect
              id={`${periodErrorId}-category`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={!options}
            >
              <option value="">{productionCopy.categoryAll}</option>
              {options?.categories.map((name) => (
                <option key={name} value={name}>
                  {name}
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
          className="shrink-0 self-start lg:self-auto"
        >
          <Download aria-hidden />
          {exporting ? productionCopy.exporting : productionCopy.export}
        </Button>
      </div>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {invalidPeriod ? <InlineError id={periodErrorId}>{productionCopy.badRequest}</InlineError> : null}

      {data && fmt && !invalidPeriod && !showLoading && !loadError ? (
        <p className="text-sm text-muted tabular-nums">
          {productionCopy.periodLine(fmt.civilDate(data.from), fmt.civilDate(data.to))}
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
          emptyTitle={productionCopy.empty}
          emptyDescription={productionCopy.emptyHint}
          skeleton={<ProductionSkeleton />}
        >
          {data && fmt ? (
            <>
              {data.unattributed.length > 0 ? (
                // El asterisco enlaza la nota con la fila «Sin atribuir» de la tabla.
                <Callout
                  tone="warning"
                  role="note"
                  icon={null}
                  className="max-w-[80ch] self-start py-2"
                >
                  <p className="flex items-start gap-1.5">
                    <span aria-hidden className="font-semibold text-warning-text">
                      *
                    </span>
                    <span>{productionCopy.unattributedNote}</span>
                  </p>
                </Callout>
              ) : null}
              <CategoryChart data={data} fmt={fmt} />
              <ProductionTable lines={lines} fmt={fmt} onOpen={setOpenRow} />
              {filters ? (
                <ProductionItemsDialog
                  token={token}
                  filters={filters}
                  row={openRow}
                  fmt={fmt}
                  onClose={() => setOpenRow(null)}
                />
              ) : null}
            </>
          ) : null}
        </AsyncSection>
      )}

      {data && fmt && !invalidPeriod && !showLoading && !loadError && data.undated.length > 0 ? (
        <Callout
          tone="warning"
          role="note"
          icon={null}
          data-testid="production-undated"
          className="max-w-[80ch] self-start py-2"
        >
          <p className="flex items-start gap-1.5">
            <span aria-hidden className="font-semibold text-warning-text">
              *
            </span>
            <span>
              {productionCopy.undatedNote(
                data.undated.reduce((n, u) => n + u.count, 0),
                data.undated.map((u) => moneyWithCode(u.net, u.currency, fmt)).join(' · '),
              )}
            </span>
          </p>
        </Callout>
      ) : null}
    </div>
  );
}
