'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listCashPayments,
  type CashPayment,
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
import {
  PAYMENT_METHOD_BADGE_VARIANT,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
} from '@/lib/payments/payment-method';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate, formatDate, zoneCityLabel } from '@/lib/format/date';
import { useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
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
import { Button } from '@/components/ui/button';
import { VoidPaymentModal } from '@/components/payments/void-payment-modal';
import { PaymentReceiptDialog } from '@/components/payments/payment-receipt-dialog';
import { useVoidPayment, voidPaymentSubject } from '@/components/payments/use-void-payment';
import { getTokenAllowedLocationIds, getTokenRole } from '@/lib/auth/token-role';
import { cn } from '@/lib/utils';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  title: 'Caja',
  description: 'Lo cobrado en la clínica en el período: cada abono, por método y moneda.',
  scopeAll: 'Todas las sedes',
  scopeMine: 'Mis sedes',
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
  colActions: 'Acciones',
  voidAction: 'Anular',
  voidActionLabel: (patient: string) => `Anular abono de ${patient}`,
  receiptAction: 'Recibo',
  receiptActionLabel: (patient: string) => `Recibo del abono de ${patient}`,
  planLabel: (createdAt: string) => `Plan del ${formatDate(createdAt)}`,
  // Sin "Intenta de nuevo." — alimenta AsyncSection -> SectionError, que trae su propio botón.
  genericLoadError: 'No pudimos cargar la caja.',
  // 400: lo único que la pantalla manda es período, método y página, así que
  // el problema está ahí; el mensaje del servidor va en inglés y no se enseña.
  badRequest: 'El período o el método no son válidos: revisa las fechas (como mucho 366 días).',
  forbiddenTitle: 'Tu rol no tiene acceso a la caja.',
  forbiddenHint:
    'La caja es para administración y recepción. Pídele acceso a quien administra la clínica.',
  // DX-067: la ventana de anulación de recepción mira el día de REGISTRO, no
  // la fecha de pago; cuando difieren, la fila lo dice.
  registeredToday: 'Registrado hoy',
  // DX-097: los días son los del calendario de la sede, no los del navegador.
  periodNote: (days: string, timeZone: string) => `${days} · días en hora de ${zoneCityLabel(timeZone)}`,
  periodDays: (from: string, to: string) => (from === to ? from : `del ${from} al ${to}`),
  registeredOn: (date: string) => `Registrado el ${date}`,
  empty: 'No hay abonos en este período.',
  emptyHint: 'Prueba con otro rango de fechas o con otro método.',
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

/** Las pestañas de la Caja (DX-027), bajo la cabecera, y el panel que rotulan. */
export interface CashViewTabs {
  nav: React.ReactNode;
  panelId: string;
  tabId: string;
}

interface CashRegisterViewProps {
  token: string;
  tabs?: CashViewTabs;
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
export function CashRegisterView({ token, tabs }: CashRegisterViewProps) {
  // DX-097: «hoy», «esta semana» y «este mes» son los de la SEDE (su zona
  // IANA, de la API), no los del navegador. `null` mientras se resuelve: no se
  // consulta nada hasta saber qué día es en la sede.
  const timeZone = useSedeTimeZone(token);
  const [period, setPeriod] = useState<PeriodChoice>('today');
  // El rango que se CONSULTA. Con un atajo sale del día de la sede (y se
  // recalcula si cambia la sede); en personalizado se copia de los campos solo
  // cuando son válidos, así que un rango a medio escribir o invertido nunca
  // sale hacia la API.
  const presetQuery = useMemo(
    () => (timeZone && period !== 'custom' ? presetRange(period, timeZone) : null),
    [timeZone, period],
  );
  const [customQuery, setCustomQuery] = useState<CashRange | null>(null);
  const range = period === 'custom' ? customQuery : presetQuery;
  const [customRange, setCustomRange] = useState<CashRange>({ from: '', to: '' });
  const [method, setMethod] = useState<MethodFilter>('ALL');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CashPaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Un 403 no es un fallo que se arregle reintentando: va aparte del error de
  // carga, como aviso sin botón.
  const [forbidden, setForbidden] = useState(false);
  const rangeErrorId = React.useId();
  const [reloadKey, setReloadKey] = useState(0);
  // Anular (DX-057): «Anular» solo sale en las filas con `canVoid` (lo calcula
  // la API para quien consulta); tras anular se recarga la caja, que solo
  // lista abonos activos, y con ella el resumen.
  const voiding = useVoidPayment(token, () => setReloadKey((k) => k + 1));
  // Recibo de caja (DX-136): ver, reimprimir o enviar el de cualquier fila.
  const [receiptPaymentId, setReceiptPaymentId] = useState<string | null>(null);

  const rangeFrom = range?.from;
  const rangeTo = range?.to;
  useEffect(() => {
    if (!token || !rangeFrom || !rangeTo) return;
    const from = rangeFrom;
    const to = rangeTo;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params: CashPaymentsQuery = {
          from,
          to,
          ...(method !== 'ALL' ? { method } : {}),
          page,
        };
        const res = await listCashPayments(token, params);
        if (cancelled) return;
        // La página pedida se quedó sin filas (p. ej. se anuló la única de la
        // última página): se pasa a la última que existe en vez de pintar un
        // vacío con «Anterior» como única salida. Sigue «cargando» hasta que
        // llegue esa página, así no parpadea el vacío ni la fila anulada.
        const lastPage = Math.max(1, Math.ceil(res.total / res.pageSize));
        if (res.items.length === 0 && page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setLoadError(
          apiErrorMessage(err, { fallback: copy.genericLoadError, byStatus: { 400: copy.badRequest } }),
        );
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, rangeFrom, rangeTo, method, page, reloadKey]);

  // Cada cambio de filtro vuelve a la página 1 en el MISMO render que el
  // filtro (React agrupa los dos `set`), así que sale una sola petición.
  function choosePeriod(next: PeriodChoice) {
    setPeriod(next);
    if (next === 'custom') {
      // Arranca con el rango que se estaba viendo: no cambia la consulta.
      const seed = range ?? { from: '', to: '' };
      setCustomRange(seed);
      setCustomQuery(range);
      return;
    }
    setPage(1);
  }

  function changeCustom(patch: Partial<CashRange>) {
    const next = { ...customRange, ...patch };
    setCustomRange(next);
    if (rangeError(next) === null) {
      setCustomQuery(next);
      setPage(1);
    }
  }

  function changeMethod(next: MethodFilter) {
    setMethod(next);
    setPage(1);
  }

  const customError = period === 'custom' ? rangeError(customRange) : null;
  const items = data?.items ?? [];
  // Con el rango escrito inválido, lo último cargado es de OTRO rango: no se
  // pinta (ni conteo, ni resumen, ni tabla, ni páginas) para que nadie lo lea
  // como la respuesta a las fechas que tiene delante.
  const showResults = customError === null && !forbidden;

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        meta={
          data ? (
            <ScopeMarker
              location={data.scope.location}
              restricted={getTokenAllowedLocationIds(token) !== null}
            />
          ) : null
        }
      />

      {tabs?.nav}

      {/* Un solo bloque apretado (12px) para filtrar → contar → leer, como en
          las demás listas. */}
      <div
        className="flex flex-col gap-3"
        {...(tabs ? { role: 'tabpanel', id: tabs.panelId, 'aria-labelledby': tabs.tabId } : {})}
      >
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
                  aria-describedby={customError ? rangeErrorId : undefined}
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
                  aria-describedby={customError ? rangeErrorId : undefined}
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

        {customError ? <InlineError id={rangeErrorId}>{customError}</InlineError> : null}

        {range && timeZone && customError === null ? (
          <p className="text-sm text-muted tabular-nums" data-testid="cash-period-note" title={timeZone}>
            {copy.periodNote(
              copy.periodDays(formatCivilDate(range.from), formatCivilDate(range.to)),
              timeZone,
            )}
          </p>
        ) : null}

        {/* Aviso de la última anulación: fuera de AsyncSection para que la
            recarga no lo borre. */}
        <p role="status" className={voiding.notice ? 'text-sm text-success' : 'sr-only'}>
          {voiding.notice}
        </p>

        {forbidden && customError === null ? (
          <EmptyState
            role="status"
            icon={<Lock aria-hidden />}
            title={copy.forbiddenTitle}
            description={copy.forbiddenHint}
          />
        ) : null}

        {showResults ? (
          <>
            {!loading && !loadError && data ? (
              <ResultCount
                total={data.total}
                noun={copy.countNoun}
                nounPlural={copy.countNounPlural}
              />
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
                  <caption className="sr-only">{copy.tableLabel}</caption>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead scope="col">{copy.colDate}</TableHead>
                      <TableHead scope="col">{copy.colPatient}</TableHead>
                      <TableHead scope="col">{copy.colPlan}</TableHead>
                      <TableHead scope="col">{copy.colMethod}</TableHead>
                      <TableHead scope="col">{copy.colLocation}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {copy.colAmount}
                      </TableHead>
                      <TableHead scope="col">
                        <span className="sr-only">{copy.colActions}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="tabular-nums" data-label={copy.colDate}>
                          {formatCivilDate(payment.paidOn)}
                          <RegisteredNote payment={payment} />
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
                        <TableCell className="text-right" data-label={copy.colActions}>
                          <span className="inline-flex flex-wrap items-center justify-end gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={copy.receiptActionLabel(payment.patient.fullName)}
                              onClick={() => setReceiptPaymentId(payment.id)}
                            >
                              {copy.receiptAction}
                            </Button>
                            {payment.canVoid ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label={copy.voidActionLabel(payment.patient.fullName)}
                                onClick={() =>
                                  voiding.request({
                                    id: payment.id,
                                    amount: payment.amount,
                                    currency: payment.currency,
                                    paidOn: payment.paidOn,
                                    patientName: payment.patient.fullName,
                                  })
                                }
                              >
                                {copy.voidAction}
                              </Button>
                            ) : null}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </AsyncSection>

            {!loadError ? (
              <Pagination
                page={page}
                pageSize={data?.pageSize ?? 0}
                total={data?.total ?? 0}
                onPageChange={setPage}
                disabled={loading}
              />
            ) : null}
          </>
        ) : null}
      </div>

      <PaymentReceiptDialog
        token={token}
        paymentId={receiptPaymentId}
        onOpenChange={(open) => {
          if (!open) setReceiptPaymentId(null);
        }}
      />

      {/* `key` por abono: cada anulación empieza con el motivo en blanco. */}
      <VoidPaymentModal
        key={voiding.target?.id ?? 'none'}
        open={voiding.target !== null}
        onOpenChange={(open) => {
          if (!open) voiding.close();
        }}
        onConfirm={(reason) => void voiding.confirm(reason)}
        submitting={voiding.submitting}
        error={voiding.error}
        // Pinta el aviso de la ventana de recepción; la regla la aplica la API.
        restrictedToOwnToday={getTokenRole(token) !== 'ADMIN'}
        subject={voiding.target ? voidPaymentSubject(voiding.target) : undefined}
      />
    </>
  );
}

/**
 * «Registrado hoy» / «Registrado el …» bajo la fecha de pago cuando el abono se
 * registró otro día (DX-067). Explica por qué recepción ve «Anular» junto a un
 * abono con fecha de pago antigua: la regla mira el día de registro en la sede,
 * y ese día (`registeredOn`, `registeredToday`) lo calcula la API.
 */
function RegisteredNote({ payment }: { payment: CashPayment }) {
  if (payment.registeredOn === payment.paidOn) return null;
  return (
    <span className="block text-xs font-normal text-muted">
      {payment.registeredToday
        ? copy.registeredToday
        : copy.registeredOn(formatCivilDate(`${payment.registeredOn}T00:00:00.000Z`))}
    </span>
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
function ScopeMarker({
  location,
  restricted = false,
}: {
  location: { id: string; name: string } | null;
  restricted?: boolean;
}) {
  return (
    <p className="mt-3 inline-flex max-w-[68ch] items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-muted">
      <Building2 aria-hidden className="size-4 shrink-0 text-muted/80" />
      <span>{location ? copy.scopeLocation(location.name) : restricted ? copy.scopeMine : copy.scopeAll}</span>
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
