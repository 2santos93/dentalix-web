'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Download, Lock, Scale } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { useSessionLocations } from '@/lib/session/session-store';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { saveCsv } from '@/lib/files/save-csv';
import { isValidPeriod, PERIOD_PRESETS, periodFor, type PeriodPresetKey } from '@/lib/reports/period-presets';
import { isCivilDate } from '@/lib/reports/chair-occupancy-api';
import {
  BASIS_PARAM,
  basisFromParam,
  currencyOf,
  downloadProfitabilityCsv,
  expenseCategories,
  getProfitability,
  profitabilityCurrencies,
  type ProfitabilityBasis,
  type ProfitabilityFilters,
  type ProfitabilityReport,
  type ProfitabilityRow,
} from '@/lib/reports/profitability-api';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { notifyError } from '@/components/errors/notify';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Disclosure } from '@/components/shared/disclosure';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { cn } from '@/lib/utils';
import { ProfitabilityLinesDialog, type OpenFigure } from './profitability-lines-dialog';

export const profitabilityCopy = {
  scope: 'Ingresos − gastos de cada sede y del grupo · cada moneda por separado, sin convertir',
  basis: 'Base',
  basisOptions: { CASH: 'Caja', ACCRUAL: 'Devengo' } satisfies Record<ProfitabilityBasis, string>,
  period: 'Período',
  dates: 'Fechas',
  from: 'Desde',
  to: 'Hasta',
  location: 'Sede',
  locationAll: 'Todas tus sedes',
  inactive: '(desactivada)',
  export: 'Descargar CSV',
  exporting: 'Descargando…',
  exported: 'Informe descargado.',
  exportError: 'No pudimos descargar el informe.',
  heading: (label: string) => `Rentabilidad en base ${label}`,
  periodLine: (from: string, to: string) => (from === to ? `El ${from}` : `Del ${from} al ${to}`),
  restricted: 'Solo incluye tus sedes: el total del grupo suma solo esas.',
  howTitle: 'Cómo se calcula',
  currencyHeading: (currency: string) => `En ${currency}`,
  summaryLabel: (currency: string) => `Rentabilidad por sede en ${currency}`,
  categoriesHeading: 'Gastos por categoría',
  categoriesLabel: (currency: string) => `Gastos por categoría en ${currency}`,
  columns: {
    location: 'Sede',
    net: 'Resultado',
    margin: 'Margen',
    category: 'Categoría',
  },
  expensesTotal: 'Total gastos',
  noActivity: 'Sin movimientos',
  noValue: '—',
  mobileIncome: (label: string, v: React.ReactNode) => (
    <>
      {label} {v}
    </>
  ),
  mobileMargin: (v: string) => `Margen ${v}`,
  drill: (what: string, where: string, currency: string) => `Ver qué forma ${what} de ${where} en ${currency}`,
  loadError: 'No pudimos cargar la rentabilidad.',
  badRequest: 'El período no es válido: elige fechas de hasta 366 días con «Desde» anterior o igual a «Hasta».',
  forbiddenTitle: 'Tu rol no tiene acceso a la rentabilidad de las sedes.',
  forbiddenHint: 'Es para la administración de la clínica.',
  empty: 'Sin ingresos ni gastos',
  emptyHint: 'Ninguna sede tuvo ingresos ni gastos en este período con esta base. Prueba con otro período, otra base u otra sede.',
};

type SummaryRow = { key: string; row: ProfitabilityRow; total: boolean };

/** Un importe que abre las filas que lo forman (si hay alguna). */
function Figure({
  amount,
  count,
  currency,
  fmt,
  label,
  onOpen,
  strong,
}: {
  amount: number;
  count: number;
  currency: string;
  fmt: RegionalFormat;
  label: string;
  onOpen: () => void;
  strong?: boolean;
}) {
  const text = moneyWithCode(amount, currency, fmt);
  if (count === 0) return <span className="whitespace-nowrap tabular-nums text-muted">{text}</span>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${text}. ${label}`}
      className={cn(
        'inline-flex min-h-8 items-center whitespace-nowrap rounded tabular-nums text-primary-text underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text',
        strong && 'font-semibold',
      )}
    >
      {text}
    </button>
  );
}

function netClass(net: number): string {
  return net < 0 ? 'text-danger-text' : 'text-ink';
}

function CurrencySection({
  report,
  currency,
  fmt,
  onOpen,
}: {
  report: ProfitabilityReport;
  currency: string;
  fmt: RegionalFormat;
  onOpen: (figure: OpenFigure) => void;
}) {
  const c = profitabilityCopy;
  const def = report.definition;
  const headingId = React.useId();
  const rows: SummaryRow[] = [
    ...report.locations.map((row) => ({ key: row.locationId ?? '', row, total: false })),
    { key: 'total', row: report.total, total: true },
  ];
  const nameOf = (r: SummaryRow) => (r.row.isActive ? r.row.name : `${r.row.name} ${c.inactive}`);
  const open = (r: SummaryRow, side: 'INCOME' | 'EXPENSE', title: string, category?: string) =>
    onOpen({
      figure: {
        side,
        currency,
        ...(r.row.locationId ? { locationId: r.row.locationId } : {}),
        ...(category !== undefined ? { category } : {}),
      },
      title: `${title} · ${r.row.name} · ${currency}`,
    });

  const income = (r: SummaryRow) => {
    const m = currencyOf(r.row, currency);
    if (!m) return <span className="text-muted">{c.noValue}</span>;
    return (
      <Figure
        amount={m.income}
        count={m.incomeCount}
        currency={currency}
        fmt={fmt}
        strong={r.total}
        label={c.drill(def.incomeLabel.toLowerCase(), r.row.name, currency)}
        onOpen={() => open(r, 'INCOME', def.incomeLabel)}
      />
    );
  };
  const expenses = (r: SummaryRow) => {
    const m = currencyOf(r.row, currency);
    if (!m) return <span className="text-muted">{c.noValue}</span>;
    return (
      <Figure
        amount={m.expenses}
        count={m.expenseCount}
        currency={currency}
        fmt={fmt}
        strong={r.total}
        label={c.drill(def.expensesLabel.toLowerCase(), r.row.name, currency)}
        onOpen={() => open(r, 'EXPENSE', def.expensesLabel)}
      />
    );
  };
  const net = (r: SummaryRow) => {
    const m = currencyOf(r.row, currency);
    if (!m) return <span className="text-muted">{c.noActivity}</span>;
    return (
      <span className={cn('whitespace-nowrap tabular-nums', netClass(m.net), r.total ? 'font-semibold' : 'font-medium')}>
        {moneyWithCode(m.net, currency, fmt)}
      </span>
    );
  };
  const margin = (r: SummaryRow) => {
    const value = currencyOf(r.row, currency)?.margin ?? null;
    return value === null ? c.noValue : fmt.percent(value, 1);
  };

  const summaryColumns: DataListColumn<SummaryRow>[] = [
    {
      id: 'location',
      header: c.columns.location,
      mobile: 'primary',
      cell: (r) => <span className={cn(r.total ? 'font-semibold text-ink' : 'text-ink')}>{nameOf(r)}</span>,
      mobileCell: nameOf,
    },
    {
      id: 'income',
      header: def.incomeLabel,
      numeric: true,
      cell: income,
      mobileCell: (r) => (currencyOf(r.row, currency) ? c.mobileIncome(def.incomeLabel, income(r)) : null),
    },
    {
      id: 'expenses',
      header: def.expensesLabel,
      numeric: true,
      cell: expenses,
      mobileCell: (r) => (currencyOf(r.row, currency) ? c.mobileIncome(def.expensesLabel, expenses(r)) : null),
    },
    { id: 'net', header: c.columns.net, numeric: true, mobile: 'trailing', cell: net },
    {
      id: 'margin',
      header: c.columns.margin,
      numeric: true,
      cell: (r) => <span className="tabular-nums">{margin(r)}</span>,
      mobileCell: (r) => (currencyOf(r.row, currency)?.margin == null ? null : c.mobileMargin(margin(r))),
    },
  ];

  // Gastos por categoría: una fila por categoría (y el total), una columna por sede y el grupo.
  type CategoryRow = { key: string; category: string | null };
  const categoryRows: CategoryRow[] = [
    ...expenseCategories(report, currency).map((category) => ({ key: category, category })),
    { key: '__total__', category: null },
  ];
  const categoryCell = (r: CategoryRow, s: SummaryRow) => {
    const m = currencyOf(s.row, currency);
    const strong = s.total || r.category === null;
    if (r.category === null) {
      return m ? (
        <span className={cn('whitespace-nowrap tabular-nums text-ink', strong && 'font-semibold')}>
          {moneyWithCode(m.expenses, currency, fmt)}
        </span>
      ) : (
        <span className="text-muted">{c.noValue}</span>
      );
    }
    const cat = m?.categories.find((x) => x.category === r.category);
    if (!cat) return <span className="text-muted">{c.noValue}</span>;
    return (
      <Figure
        amount={cat.amount}
        count={cat.count}
        currency={currency}
        fmt={fmt}
        strong={strong}
        label={c.drill(`«${r.category}»`, s.row.name, currency)}
        onOpen={() => open(s, 'EXPENSE', `${def.expensesLabel}: ${r.category}`, r.category ?? undefined)}
      />
    );
  };
  const categoryColumns: DataListColumn<CategoryRow>[] = [
    {
      id: 'category',
      header: c.columns.category,
      mobile: 'primary',
      cell: (r) => (
        <span className={cn('text-ink', r.category === null && 'font-semibold')}>{r.category ?? c.expensesTotal}</span>
      ),
    },
    ...rows.map(
      (s): DataListColumn<CategoryRow> => ({
        id: `loc-${s.key}`,
        header: s.row.name,
        numeric: true,
        cell: (r) => categoryCell(r, s),
      }),
    ),
  ];
  const hasCategories = categoryRows.length > 1;

  return (
    <section aria-labelledby={headingId} data-testid="profitability-currency" className="flex min-w-0 flex-col gap-3">
      <h3 id={headingId} className="t-label text-ink">
        {c.currencyHeading(currency)}
      </h3>
      <DataList
        label={c.summaryLabel(currency)}
        rows={rows}
        columns={summaryColumns}
        getRowKey={(r) => r.key}
      />
      {hasCategories ? (
        <div className="flex min-w-0 flex-col gap-2">
          <h4 className="text-sm font-medium text-muted">{c.categoriesHeading}</h4>
          <DataList
            label={c.categoriesLabel(currency)}
            rows={categoryRows}
            columns={categoryColumns}
            getRowKey={(r) => r.key}
            phone="scroll"
          />
        </div>
      ) : null}
    </section>
  );
}

/**
 * «Rentabilidad por sede» (DX-410), pestaña de Reportes para la
 * administración: ingresos − gastos de cada sede y del grupo en la base que
 * se elija («Caja»: cobrado − gastos pagados, por fecha de pago; «Devengo»:
 * producción realizada − gastos por fecha de factura, pagados o no). La
 * definición la manda la API (cabecera y «Cómo se calcula»), la misma que usa
 * el CSV. Una sección por moneda, nunca convertidas; los gastos por categoría
 * y cada importe abre las filas que lo forman. Base, período y sede viven en
 * la URL (`?base=`, `?periodo=`, `?desde=`, `?hasta=`, `?sede=`).
 */
export function ProfitabilityView({ token }: { token: string }) {
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
  const requestLocations = useSessionLocations(token);

  const basis = basisFromParam(searchParams.get('base'));
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
  const invalidPeriod = preset === 'custom' && period !== null && !isValidPeriod(period);

  const [locations, setLocations] = useState<{ id: string; name: string; isActive: boolean }[] | null>(null);
  const [data, setData] = useState<ProfitabilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [opened, setOpened] = useState<OpenFigure | null>(null);

  const filters: ProfitabilityFilters | null =
    period && !invalidPeriod ? { ...period, basis, ...(locationId ? { locationId } : {}) } : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  // Opciones de sede: si fallan, el filtro sigue con «Todas tus sedes».
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    requestLocations()
      .then((list) => {
        if (!cancelled) setLocations(list.map((l) => ({ id: l.id, name: l.name, isActive: l.isActive })));
      })
      .catch(() => {
        if (!cancelled) setLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, requestLocations]);

  useEffect(() => {
    if (!token || !filterKey) return;
    const query = JSON.parse(filterKey) as ProfitabilityFilters;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getProfitability(token, query);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403 && !query.locationId);
        setLoadError(
          apiErrorMessage(err, { fallback: profitabilityCopy.loadError, byStatus: { 400: profitabilityCopy.badRequest } }),
        );
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, reloadKey]);

  /** Reescribe filtros en la URL sin navegar (conserva `?tab=`). */
  function setParams(values: Partial<Record<'base' | 'periodo' | 'desde' | 'hasta' | 'sede', string>>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function choosePreset(next: PeriodPresetKey) {
    // Al pasar a «Personalizado» se parte de las fechas que se veían.
    if (next === 'custom' && period) setParams({ periodo: next, desde: period.from, hasta: period.to });
    else setParams({ periodo: next === 'this_month' ? '' : next, desde: '', hasta: '' });
  }

  async function exportCsv() {
    if (!filterKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const query = JSON.parse(filterKey) as ProfitabilityFilters;
      const text = await downloadProfitabilityCsv(token, query);
      saveCsv(text, `rentabilidad-${BASIS_PARAM[query.basis]}-${query.from}-${query.to}.csv`, { bom: true });
      setNotice(profitabilityCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: profitabilityCopy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  if (forbidden) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={profitabilityCopy.forbiddenTitle}
        description={profitabilityCopy.forbiddenHint}
      />
    );
  }

  const c = profitabilityCopy;
  const showLoading = !invalidPeriod && (loading || !filters);
  // La definición de la base pedida (la de la respuesta, si ya llegó la de esta base).
  const definition = data && data.basis === basis ? data.definition : null;
  const ready = data && fmt && !invalidPeriod && !showLoading && !loadError;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="t-caption inline-flex items-center gap-1.5 text-muted">
        <Scale aria-hidden className="size-4 shrink-0" />
        <span>{c.scope}</span>
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1.5">
            <span id={`${ids}-basis`} className="t-label text-ink">
              {c.basis}
            </span>
            <SegmentedControl
              aria-labelledby={`${ids}-basis`}
              value={basis}
              onValueChange={(next) => setParams({ base: next === 'CASH' ? '' : BASIS_PARAM[next] })}
              options={(['CASH', 'ACCRUAL'] as const).map((b) => ({ value: b, label: c.basisOptions[b] }))}
              fullWidthOnMobile
              data-testid="profitability-basis"
            />
          </div>
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
          <FormField htmlFor={`${ids}-location`} label={c.location} className="min-w-0 sm:w-48">
            <NativeSelect
              id={`${ids}-location`}
              value={locationId}
              onChange={(e) => setParams({ sede: e.target.value })}
              disabled={!locations}
            >
              <option value="">{c.locationAll}</option>
              {locations?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.isActive ? l.name : `${l.name} ${c.inactive}`}
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
          {exporting ? c.exporting : c.export}
        </Button>
      </div>

      <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
        {notice}
      </p>

      {invalidPeriod ? <InlineError id={periodErrorId}>{c.badRequest}</InlineError> : null}

      {ready && definition ? (
        <div data-testid="profitability-header" className="flex flex-col gap-0.5">
          <h2 className="t-title text-ink">{c.heading(definition.label)}</h2>
          <p className="text-sm text-ink">{definition.formula}</p>
          <p className="text-sm text-muted tabular-nums">{c.periodLine(fmt.civilDate(data.from), fmt.civilDate(data.to))}</p>
        </div>
      ) : null}

      {data?.restrictedToLocations && !showLoading && !loadError ? (
        <Callout tone="info" role="note" data-testid="profitability-restricted" className="max-w-[80ch] self-start py-2">
          {c.restricted}
        </Callout>
      ) : null}

      {definition && !loadError ? (
        <div className="-mx-2 max-w-[80ch] self-start" data-testid="profitability-how">
          <Disclosure summary={c.howTitle} meta={definition.formula}>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
              {definition.howItIsCalculated.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Disclosure>
        </div>
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
          emptyTitle={c.empty}
          emptyDescription={c.emptyHint}
          skeleton={<TableSkeleton rows={4} />}
        >
          {data && fmt ? (
            <div className="flex min-w-0 flex-col gap-8">
              {profitabilityCurrencies(data).map((currency) => (
                <CurrencySection key={currency} report={data} currency={currency} fmt={fmt} onOpen={setOpened} />
              ))}
            </div>
          ) : null}
        </AsyncSection>
      )}

      {filters && fmt ? (
        <ProfitabilityLinesDialog
          token={token}
          filters={filters}
          opened={opened}
          fmt={fmt}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </div>
  );
}

