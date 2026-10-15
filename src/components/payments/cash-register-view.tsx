'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  listCashPayments,
  type CashPaymentsResponse,
  type CashPaymentsQuery,
  type PaymentMethod,
} from '@/lib/payments/payments-api';
import {
  isValidRange,
  presetRange,
  MAX_RANGE_DAYS,
  type CashPreset,
  type CashRange,
} from '@/lib/payments/cash-period';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate, formatDate } from '@/lib/format/date';
import { Card } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { Pagination } from '@/components/shared/pagination';
import { PageHeader } from '@/components/shared/page-header';
import { ResultCount, toolbarFieldClass } from '@/components/shared/list-toolbar';
import { InlineError } from '@/components/errors/inline-error';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  title: 'Caja',
  description: 'Lo cobrado en la clínica en el período: cada abono, por método y moneda.',
  scopeAll: 'Todas las sedes',
  scopeLocation: (name: string) => `Caja de ${name}`,
  periodLabel: 'Período',
  presets: {
    today: 'Hoy',
    week: 'Esta semana',
    month: 'Este mes',
    custom: 'Personalizado',
  } satisfies Record<CashPreset | 'custom', string>,
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  invalidRangeOrder: 'La fecha final no puede ser anterior a la inicial.',
  invalidRangeLength: `El período no puede superar ${MAX_RANGE_DAYS} días. Acórtalo e intenta de nuevo.`,
  invalidRangeEmpty: 'Elige las dos fechas del período.',
  methodLabel: 'Método',
  methodAll: 'Todos los métodos',
  methodNone: 'Sin método',
  countNoun: 'abono',
  countNounPlural: 'abonos',
  summaryTitle: 'Resumen del período',
  byCurrency: 'Por moneda',
  byMethod: 'Por método',
  paymentsCount: (n: number) => `${n} ${n === 1 ? 'abono' : 'abonos'}`,
  tableLabel: 'Abonos del período',
  colDate: 'Fecha',
  colPatient: 'Paciente',
  colPlan: 'Plan',
  colMethod: 'Método',
  colLocation: 'Sede',
  colAmount: 'Monto',
  planLabel: (createdAt: string) => `Plan del ${formatDate(createdAt)}`,
  // Sin "Intenta de nuevo." — alimenta AsyncSection -> SectionError, que trae su propio botón.
  genericLoadError: 'No pudimos cargar la caja.',
  forbidden: 'Tu rol no tiene acceso a la caja. Pídele acceso a quien administra la clínica.',
  empty: 'No hay abonos en este período.',
  emptyHint: 'Prueba con otro rango de fechas o con otro método.',
};

const PAYMENT_METHOD_OPTIONS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'OTHER'];

// Mismas etiquetas y variantes que `treatment-plans-tab.tsx` — duplicadas (no
// importadas) por la misma razón que en `payment-receipt.tsx`: allí son
// constantes locales del módulo, y cada vista conserva sus mapeos de
// presentación.
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

const PAYMENT_METHOD_BADGE_VARIANT: Record<PaymentMethod, BadgeProps['variant']> = {
  CASH: 'success',
  CARD: 'default',
  TRANSFER: 'muted',
  OTHER: 'muted',
};

type PeriodChoice = CashPreset | 'custom';
type MethodFilter = PaymentMethod | 'ALL';

const PERIOD_CHOICES: PeriodChoice[] = ['today', 'week', 'month', 'custom'];

function methodLabel(method: PaymentMethod | null): string {
  return method ? PAYMENT_METHOD_LABELS[method] : copy.methodNone;
}

function rangeError(range: CashRange): string | null {
  if (!range.from || !range.to) return copy.invalidRangeEmpty;
  if (isValidRange(range)) return null;
  return range.from > range.to ? copy.invalidRangeOrder : copy.invalidRangeLength;
}

interface CashRegisterViewProps {
  token: string;
}

/**
 * La CAJA: todos los abonos de la clínica en un período —de la sede activa o
 * de todas—, con lo cobrado por moneda y por método. Patrón de lista de la app
 * (`InventoryView`/`CatalogView`): estado local + `useEffect` que recarga
 * cuando cambian filtros o página, `AsyncSection` para carga/error/vacío.
 *
 * La barra no usa `ListToolbar` porque aquí no hay buscador —la API filtra por
 * período y método, no por texto— pero repite su gramática: misma fila, mismos
 * 40px y el mismo `toolbarFieldClass` en los controles.
 *
 * Los totales llegan del servidor ya agregados sobre el período ENTERO (no la
 * página visible) y sin convertir: un total por moneda, que es lo que se cuenta
 * al cerrar la caja.
 */
export function CashRegisterView({ token }: CashRegisterViewProps) {
  const [period, setPeriod] = useState<PeriodChoice>('today');
  // El rango que se CONSULTA. Con un atajo se recalcula al elegirlo; en
  // personalizado se copia de los campos solo cuando son válidos, así que un
  // rango a medio escribir o invertido nunca sale hacia la API.
  const [range, setRange] = useState<CashRange>(() => presetRange('today'));
  const [customRange, setCustomRange] = useState<CashRange>(range);
  const [method, setMethod] = useState<MethodFilter>('ALL');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CashPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params: CashPaymentsQuery = {
          from: range.from,
          to: range.to,
          ...(method !== 'ALL' ? { method } : {}),
          page,
        };
        const res = await listCashPayments(token, params);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError && err.status === 403 ? copy.forbidden : copy.genericLoadError,
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, range, method, page, reloadKey]);

  // Cada cambio de filtro vuelve a la página 1 en el MISMO render que el
  // filtro (React agrupa los dos `set`), así que sale una sola petición.
  function choosePeriod(next: PeriodChoice) {
    setPeriod(next);
    if (next === 'custom') {
      setCustomRange(range);
      return;
    }
    setRange(presetRange(next));
    setPage(1);
  }

  function changeCustom(patch: Partial<CashRange>) {
    const next = { ...customRange, ...patch };
    setCustomRange(next);
    if (rangeError(next) === null) {
      setRange(next);
      setPage(1);
    }
  }

  function changeMethod(next: MethodFilter) {
    setMethod(next);
    setPage(1);
  }

  const customError = period === 'custom' ? rangeError(customRange) : null;
  const items = data?.items ?? [];

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        meta={data ? <ScopeMarker location={data.scope.location} /> : null}
      />

      {/* Un solo bloque apretado (12px) para filtrar → contar → leer, como en
          las demás listas. */}
      <div className="flex flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div
            role="group"
            aria-label={copy.periodLabel}
            className="flex h-10 shrink-0 overflow-x-auto rounded-lg border border-border bg-surface p-0.5"
          >
            {PERIOD_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={period === choice}
                onClick={() => choosePeriod(choice)}
                className={cn(
                  'flex-1 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  period === choice
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                {copy.presets[choice]}
              </button>
            ))}
          </div>

          {period === 'custom' ? (
            <div className="flex min-w-0 gap-3">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted">
                <span className="shrink-0">{copy.fromLabel}</span>
                <Input
                  type="date"
                  value={customRange.from}
                  max={customRange.to || undefined}
                  onChange={(e) => changeCustom({ from: e.target.value })}
                  aria-invalid={customError !== null}
                  className="tabular-nums sm:w-40"
                />
              </label>
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted">
                <span className="shrink-0">{copy.toLabel}</span>
                <Input
                  type="date"
                  value={customRange.to}
                  min={customRange.from || undefined}
                  onChange={(e) => changeCustom({ to: e.target.value })}
                  aria-invalid={customError !== null}
                  className="tabular-nums sm:w-40"
                />
              </label>
            </div>
          ) : null}

          <select
            aria-label={copy.methodLabel}
            value={method}
            onChange={(e) => changeMethod(e.target.value as MethodFilter)}
            className={cn(toolbarFieldClass, 'sm:w-48')}
          >
            <option value="ALL">{copy.methodAll}</option>
            {PAYMENT_METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        {customError ? <InlineError>{customError}</InlineError> : null}

        {!loading && !loadError && data ? (
          <ResultCount total={data.total} noun={copy.countNoun} nounPlural={copy.countNounPlural} />
        ) : null}

        <AsyncSection
          loading={loading}
          error={loadError}
          onRetry={() => setReloadKey((k) => k + 1)}
          isEmpty={items.length === 0}
          emptyTitle={copy.empty}
          emptyDescription={copy.emptyHint}
          skeleton={<TableSkeleton rows={4} />}
        >
          {data ? <CashSummary summary={data.summary} /> : null}

          <Card className="overflow-hidden p-0">
            <Table aria-label={copy.tableLabel}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{copy.colDate}</TableHead>
                  <TableHead>{copy.colPatient}</TableHead>
                  <TableHead>{copy.colPlan}</TableHead>
                  <TableHead>{copy.colMethod}</TableHead>
                  <TableHead>{copy.colLocation}</TableHead>
                  <TableHead className="text-right">{copy.colAmount}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="tabular-nums" data-label={copy.colDate}>
                      {formatCivilDate(payment.paidAt)}
                    </TableCell>
                    <TableCell data-label={copy.colPatient}>
                      <Link
                        href={`/patients/${payment.patient.id}`}
                        className="font-medium text-ink underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {payment.patient.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted" data-label={copy.colPlan}>
                      {copy.planLabel(payment.treatmentPlan.createdAt)}
                    </TableCell>
                    <TableCell data-label={copy.colMethod}>
                      {payment.method ? (
                        <Badge variant={PAYMENT_METHOD_BADGE_VARIANT[payment.method]}>
                          {PAYMENT_METHOD_LABELS[payment.method]}
                        </Badge>
                      ) : (
                        <span className="text-muted">{copy.methodNone}</span>
                      )}
                    </TableCell>
                    <TableCell data-label={copy.colLocation}>{payment.location.name}</TableCell>
                    <TableCell
                      className="text-right font-medium tabular-nums text-ink"
                      data-label={copy.colAmount}
                    >
                      {formatCurrency(payment.amount, payment.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </AsyncSection>

        <Pagination
          page={page}
          pageSize={data?.pageSize ?? 0}
          total={data?.total ?? 0}
          onPageChange={setPage}
          disabled={loading}
        />
      </div>
    </>
  );
}

/**
 * Marca de alcance en el hueco `meta` de la cabecera: la caja SÍ es por sede
 * (es lo que se arquea), así que dice siempre de qué caja son estos números —
 * también en "Todas las sedes", a diferencia de `ClinicWideNote`, que solo
 * aparece cuando hay una contradicción que explicar. El nombre viene de la
 * respuesta (`scope.location`), no del selector: es la sede que el servidor
 * aplicó de verdad.
 */
function ScopeMarker({ location }: { location: { id: string; name: string } | null }) {
  return (
    <p className="mt-3 inline-flex max-w-[68ch] items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-muted">
      <Building2 aria-hidden className="size-4 shrink-0 text-muted/80" />
      <span>{location ? copy.scopeLocation(location.name) : copy.scopeAll}</span>
    </p>
  );
}

/**
 * El resumen como REGISTRO —filas con filete, etiqueta a la izquierda y cifra
 * tabular a la derecha—, no como tarjetas de métrica: DESIGN.md prohíbe el
 * patrón "número grande / etiqueta pequeña" como estructura. En móvil las dos
 * columnas se apilan.
 */
function CashSummary({ summary }: { summary: CashPaymentsResponse['summary'] }) {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-border bg-surface">
      <div className="flex items-baseline justify-between gap-4 border-b border-hairline px-4 py-3 sm:px-6">
        <h2 id={headingId} className="t-title text-ink">
          {copy.summaryTitle}
        </h2>
        <span className="text-sm text-muted tabular-nums">{copy.paymentsCount(summary.count)}</span>
      </div>
      <div className="grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-hairline">
        <SummaryList label={copy.byCurrency}>
          {summary.byCurrency.map((row) => (
            <SummaryRow
              key={row.currency}
              label={row.currency}
              meta={copy.paymentsCount(row.count)}
              value={formatCurrency(row.total, row.currency)}
            />
          ))}
        </SummaryList>
        <SummaryList label={copy.byMethod} className="max-sm:border-t max-sm:border-hairline">
          {summary.byMethod.map((row) => (
            <SummaryRow
              key={`${row.method ?? 'none'}-${row.currency}`}
              label={methodLabel(row.method)}
              meta={`${row.currency} · ${copy.paymentsCount(row.count)}`}
              value={formatCurrency(row.total, row.currency)}
            />
          ))}
        </SummaryList>
      </div>
    </section>
  );
}

function SummaryList({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const labelId = React.useId();
  return (
    <div className={cn('px-4 py-3 sm:px-6', className)}>
      <p id={labelId} className="t-label text-muted">
        {label}
      </p>
      <ul aria-labelledby={labelId} className="mt-1 divide-y divide-hairline">
        {children}
      </ul>
    </div>
  );
}

function SummaryRow({ label, meta, value }: { label: string; meta: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="font-medium text-ink">{label}</span>{' '}
        <span className="text-xs text-muted tabular-nums">{meta}</span>
      </span>
      <span className="shrink-0 font-medium tabular-nums text-ink">{value}</span>
    </li>
  );
}
