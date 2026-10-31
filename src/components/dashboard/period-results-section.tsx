'use client';
import { useState } from 'react';
import Link from 'next/link';
import { getDashboard, type Dashboard } from '@/lib/dashboard/dashboard-api';
import { addOneDayIso } from '@/lib/dashboard/date-range';
import { presetRange } from '@/lib/payments/cash-period';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { formatCurrency } from '@/lib/format/currency';
import { isValidPeriod, MAX_PERIOD_DAYS } from '@/lib/reports/period-presets';
import { metricValues } from '@/lib/reports/comparison-table';
import {
  getLocationsComparison,
  type ComparisonRow,
  type KpiDefinition,
  type KpiKey,
  type LocationsComparison,
} from '@/lib/reports/reports-api';
import { MetricValue } from '@/components/reports/metric-value';
import { DateRangePicker } from '@/components/ui/date-picker';
import { SectionHeader } from '@/components/ui/section-header';
import { Skeleton } from '@/components/ui/skeleton';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { FormField } from '@/components/shared/form-field';
import { CurrencySelect } from '@/components/shared/currency-select';
import { InlineError } from '@/components/errors/inline-error';
import { SectionError } from '@/components/errors/section-error';
import { cn } from '@/lib/utils';
import { sectionLinkClass } from './today-section';
import { useLoad } from './use-load';

export const periodCopy = {
  heading: 'Resultados del período',
  range: (from: string, to: string) => `Del ${from} al ${to}`,
  against: (from: string, to: string) => `frente al ${from} – ${to}`,
  reportsLink: 'Ver reportes',
  periodLabel: 'Periodo',
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  currencyLabel: 'Moneda',
  currencyPlaceholder: 'Elige una moneda',
  chooseCurrency: 'Tus sedes usan monedas distintas: elige en «Moneda» a cuál convertir lo cobrado.',
  rangeInvalid: 'La fecha «Hasta» debe ser igual o posterior a la fecha «Desde».',
  rangeTooLong: `La comparación admite hasta ${MAX_PERIOD_DAYS} días; acorta el período.`,
  loading: 'Cargando los resultados del período…',
  incomesError: 'No pudimos cargar lo cobrado en el período.',
  comparisonError: 'No pudimos cargar los indicadores del período.',
  figuresLabel: 'Indicadores del período',
  collectedLabel: (currency: string) => `Cobrado, en ${currency}`,
  payments: (n: string, one: boolean) => (one ? `${n} abono` : `${n} abonos`),
  convertedHint: (currency: string) => `Cada abono en otra moneda, a ${currency} con la tasa de su día.`,
  singleHint: (currency: string) => `Todo cobrado en ${currency}.`,
  perCurrencyHint: 'Por moneda, sin convertir',
  noActivity: 'Sin actividad en el período.',
  bySedeHeading: 'Por sede',
  bySedeDescription: 'Los mismos indicadores, sede por sede; los importes, por moneda.',
  bySedeLabel: 'Indicadores por sede',
  sedeColumn: 'Sede',
  inactive: 'inactiva',
  notComparedNote:
    '* Sin comparar: parte de la producción del período anterior no está atribuida a una sede, así que la variación no sería fiable.',
};
const copy = periodCopy;

/** Indicadores de la tira, en este orden (las claves de la API, DX-014). */
const STRIP: KpiKey[] = [
  'production',
  'collectionRate',
  'completedAppointments',
  'noShowRate',
  'newPatients',
  'averageTicket',
  'occupancy',
];
/** Columnas de «Por sede»: lo que más cambia entre sedes. */
const BY_SEDE: KpiKey[] = ['production', 'collected', 'completedAppointments', 'noShowRate', 'newPatients', 'occupancy'];

/**
 * «Resultados del período» de ADMIN (I1): lo cobrado convertido a una moneda
 * (`GET /dashboard`, la única cifra que sí se convierte) y los indicadores de
 * gestión frente al período anterior (`GET /reports/locations-comparison`,
 * por moneda, nunca sumadas). El período y la moneda gobiernan solo este
 * bloque: «Hoy» y «Pendientes» no dependen de ellos.
 */
export function PeriodResultsSection({
  token,
  timeZone,
  scopeKey,
  defaultCurrency,
  currencyNeedsChoice,
  fmt,
}: {
  token: string;
  timeZone: string;
  scopeKey: string;
  /** La moneda de la sede activa (o la común en «Todas»); `null` = hay que elegir. */
  defaultCurrency: string | null;
  currencyNeedsChoice: boolean;
  fmt: RegionalFormat | null;
}) {
  const defaults = { from: presetRange('month', timeZone).from, to: presetRange('today', timeZone).to };
  const [fromInput, setFrom] = useState<string | null>(null);
  const [toInput, setTo] = useState<string | null>(null);
  const from = fromInput ?? defaults.from;
  const to = toInput ?? defaults.to;
  const [currencyChoice, setCurrency] = useState('');
  const currency = currencyChoice || defaultCurrency || '';

  const complete = from !== '' && to !== '';
  const rangeInvalid = complete && from > to;
  const tooLong = complete && !rangeInvalid && !isValidPeriod({ from, to });
  const canQuery = complete && !rangeInvalid && !tooLong;

  const incomes = useLoad(
    // `to` del panel es exclusivo: «Hasta» + 1 (si no, se perdería lo cobrado ese día).
    () => getDashboard(token, { from, to: addOneDayIso(to), currency, upcomingLimit: 1 }),
    `${from}|${to}|${currency}|${scopeKey}`,
    canQuery && currency !== '',
    copy.incomesError,
  );
  const comparison = useLoad(
    () => getLocationsComparison(token, { from, to, compare: 'previous' }),
    `${from}|${to}|${scopeKey}`,
    canQuery,
    copy.comparisonError,
  );
  const civil = (day: string) => (fmt ? fmt.civilDate(day) : day);
  const report = comparison.status === 'ready' ? comparison.data : null;
  const subtitle = canQuery
    ? [
        copy.range(civil(from), civil(to)),
        report?.previousFrom && report.previousTo ? copy.against(civil(report.previousFrom), civil(report.previousTo)) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return (
    <section aria-labelledby="inicio-period-title" className="flex flex-col gap-4">
      <SectionHeader
        titleId="inicio-period-title"
        title={copy.heading}
        description={subtitle}
        className="flex-row items-start justify-between"
        actions={
          <Link href="/reportes" className={sectionLinkClass}>
            {copy.reportsLink}
          </Link>
        }
      />
      <div className="flex flex-col gap-y-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-3">
        <FormField htmlFor="dashboard-period" label={copy.periodLabel} className="w-full sm:w-auto">
          <DateRangePicker
            id="dashboard-period"
            value={complete ? { from, to } : null}
            onChange={(range) => {
              setFrom(range?.from ?? '');
              setTo(range?.to ?? '');
            }}
            presets
            startLabel={copy.fromLabel}
            endLabel={copy.toLabel}
            isInvalid={rangeInvalid || tooLong}
            aria-describedby={rangeInvalid || tooLong ? 'dashboard-range-error' : undefined}
          />
        </FormField>
        <FormField htmlFor="dashboard-currency" label={copy.currencyLabel} className="w-full sm:w-56">
          <CurrencySelect
            id="dashboard-currency"
            token={token}
            value={currency}
            onChange={setCurrency}
            placeholder={currency ? undefined : copy.currencyPlaceholder}
          />
        </FormField>
      </div>

      {rangeInvalid || tooLong ? (
        <InlineError id="dashboard-range-error">{rangeInvalid ? copy.rangeInvalid : copy.rangeTooLong}</InlineError>
      ) : !canQuery ? null : (
        <>
          {/* Las celdas llevan filete abajo y a la derecha; el margen negativo
              esconde los del borde, que ya dibuja el marco. */}
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="-mb-px -mr-px grid grid-cols-2 md:grid-cols-4">
            <IncomesFigure
              state={incomes}
              currency={currency}
              currencyNeedsChoice={currencyNeedsChoice && !currencyChoice}
              fmt={fmt}
            />
            {comparison.status === 'error' ? (
              <div className="col-span-2 border-b border-r border-border-subtle p-4 md:col-span-3">
                <SectionError description={comparison.message} onRetry={comparison.reload} className="py-6" />
              </div>
            ) : report && fmt ? (
              <ComparisonFigures report={report} fmt={fmt} />
            ) : (
              <FiguresSkeleton />
            )}
          </div>
          </div>
          {report?.previousPeriodUnattributed ? <p className="text-xs text-muted">{copy.notComparedNote}</p> : null}
          {report && fmt && report.locations.length >= 2 ? <BySede report={report} fmt={fmt} /> : null}
        </>
      )}
    </section>
  );
}

/** Una celda de la tira: etiqueta arriba, valor tabular, apoyo debajo. Los filetes separan, no las tarjetas. */
function Cell({ label, children, testId, className }: { label: string; children: React.ReactNode; testId?: string; className?: string }) {
  return (
    <div
      className={cn('flex min-w-0 flex-col gap-1 border-b border-r border-border-subtle p-4 sm:px-5', className)}
      data-testid={testId}
    >
      <dt className="t-overline">{label}</dt>
      {children}
    </div>
  );
}

function IncomesFigure({
  state,
  currency,
  currencyNeedsChoice,
  fmt,
}: {
  state: ReturnType<typeof useLoad<Dashboard>>;
  currency: string;
  currencyNeedsChoice: boolean;
  fmt: RegionalFormat | null;
}) {
  if (!currency || currencyNeedsChoice) {
    return (
      <dl className="contents">
        <Cell className="max-md:col-span-2" label={copy.collectedLabel('—')} testId="dashboard-incomes">
          <dd role="status" className="text-sm text-muted">
            {copy.chooseCurrency}
          </dd>
        </Cell>
      </dl>
    );
  }
  if (state.status === 'error') {
    return (
      <dl className="contents">
        <Cell className="max-md:col-span-2" label={copy.collectedLabel(currency)} testId="dashboard-incomes">
          <dd className="text-sm text-danger-text">
            {state.message}{' '}
            <button type="button" onClick={state.reload} className="font-medium text-primary-text underline">
              Reintentar
            </button>
          </dd>
        </Cell>
      </dl>
    );
  }
  if (state.status !== 'ready') {
    return (
      <dl className="contents">
        <Cell className="max-md:col-span-2" label={copy.collectedLabel(currency)}>
          <dd>
            <Skeleton className="h-6 w-28" />
          </dd>
        </Cell>
      </dl>
    );
  }
  const incomes = state.data.incomes;
  const mixed = Object.keys(incomes.byCurrency).some((c) => c !== incomes.currency);
  const n = fmt ? fmt.number(incomes.count) : String(incomes.count);
  return (
    <dl className="contents">
      <Cell className="max-md:col-span-2" label={copy.collectedLabel(incomes.currency)} testId="dashboard-incomes">
        <dd className="t-data text-lg font-semibold text-ink">{formatCurrency(incomes.totalConverted, incomes.currency)}</dd>
        <dd className="text-xs text-muted">
          <span className="t-data">{copy.payments(n, incomes.count === 1)}</span>
          {incomes.count > 0 ? (
            <span className="block text-pretty">
              {mixed ? copy.convertedHint(incomes.currency) : copy.singleHint(incomes.currency)}
            </span>
          ) : null}
        </dd>
      </Cell>
    </dl>
  );
}

/**
 * Los valores de un indicador sin las monedas en las que no hubo nada ni antes
 * ni ahora (un «USD 0,00 · Sin comparar» no dice nada). Si no queda ninguna, se
 * devuelve la lista tal cual: el «—» del indicador es la respuesta honesta.
 */
export function activeValues(row: ComparisonRow, key: KpiKey) {
  const values = metricValues(row, key);
  const quiet = (v: number | null) => v === null || v === 0;
  const active = values.filter((m) => !(m.currency && quiet(m.value) && quiet(m.previous)));
  return active.length > 0 ? active : values.slice(0, 1);
}

function kpiOf(report: LocationsComparison, key: KpiKey): KpiDefinition | undefined {
  return report.kpis.find((k) => k.key === key);
}

function ComparisonFigures({ report, fmt }: { report: LocationsComparison; fmt: RegionalFormat }) {
  return (
    <dl aria-label={copy.figuresLabel} className="contents">
      {STRIP.map((key) => {
        const kpi = kpiOf(report, key);
        if (!kpi) return null;
        const values = activeValues(report.total, key);
        return (
          <Cell key={key} label={kpi.label} testId={`dashboard-kpi-${key}`}>
            {values.length === 0 ? (
              <dd className="text-sm text-muted">{copy.noActivity}</dd>
            ) : (
              values.map((metric, i) => (
                <dd key={metric.currency ?? i} className="text-base">
                  <MetricValue
                    unit={kpi.unit}
                    changeUnit={kpi.changeUnit}
                    metric={metric}
                    currency={metric.currency}
                    fmt={fmt}
                    align="start"
                  />
                </dd>
              ))
            )}
            {kpi.perCurrency && values.length > 1 ? <dd className="text-xs text-muted">{copy.perCurrencyHint}</dd> : null}
          </Cell>
        );
      })}
    </dl>
  );
}

function FiguresSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="contents">
      {STRIP.map((key) => (
        <div key={key} className="flex flex-col gap-2 border-b border-r border-border-subtle p-4 sm:px-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
      ))}
    </div>
  );
}

function BySede({ report, fmt }: { report: LocationsComparison; fmt: RegionalFormat }) {
  const columns: DataListColumn<ComparisonRow>[] = [
    {
      id: 'name',
      header: copy.sedeColumn,
      mobile: 'primary',
      cell: (row) => (
        <span>
          {row.name}
          {row.isActive ? null : <span className="ml-1 text-xs font-normal text-muted">({copy.inactive})</span>}
        </span>
      ),
    },
    ...BY_SEDE.flatMap((key): DataListColumn<ComparisonRow>[] => {
      const kpi = kpiOf(report, key);
      if (!kpi) return [];
      return [
        {
          id: key,
          header: kpi.label,
          align: 'end',
          cell: (row) => (
            <span className="flex flex-col items-end gap-1">
              {activeValues(row, key).map((metric, i) => (
                <MetricValue
                  key={metric.currency ?? i}
                  unit={kpi.unit}
                  changeUnit={kpi.changeUnit}
                  metric={metric}
                  currency={metric.currency}
                  fmt={fmt}
                />
              ))}
            </span>
          ),
        },
      ];
    }),
  ];
  return (
    <section aria-labelledby="inicio-by-sede-title" className="flex flex-col gap-3">
      <SectionHeader as="h3" titleId="inicio-by-sede-title" title={copy.bySedeHeading} description={copy.bySedeDescription} />
      <DataList
        label={copy.bySedeLabel}
        rows={report.locations}
        columns={columns}
        getRowKey={(row) => row.locationId ?? row.name}
        phone="scroll"
      />
    </section>
  );
}
