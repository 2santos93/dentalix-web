'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  downloadCashPaymentsCsv,
  listCashPayments,
  type CashPayment,
  type CashPaymentsResponse,
  type CashPaymentsQuery,
} from '@/lib/payments/payments-api';
import type { ClinicPaymentMethod } from '@/lib/payments/payment-methods-api';
import { saveCsv } from '@/lib/files/save-csv';
import { notifyError } from '@/components/errors/notify';
import { FieldError } from '@/components/errors/field-error';
import { usePaymentMethods } from '@/components/payments/use-payment-methods';
import {
  isValidRange,
  presetRange,
  MAX_RANGE_DAYS,
  type CashPreset,
  type CashRange,
} from '@/lib/payments/cash-period';
import {
  PAYMENT_METHOD_LABELS,
} from '@/lib/payments/payment-method';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate, formatDate } from '@/lib/format/date';
import { readyTimeZone, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { StatusBadge } from '@/components/ui/status-badge';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { PageHeader } from '@/components/shared/page-header';
import { ResultCount } from '@/components/shared/list-toolbar';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
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
  customLabel: 'Período personalizado',
  invalidRangeOrder: 'La fecha final no puede ser anterior a la inicial.',
  invalidRangeLength: `El período no puede superar ${MAX_RANGE_DAYS} días. Acórtalo e intenta de nuevo.`,
  invalidRangeEmpty: 'Elige las dos fechas del período.',
  // DX-395: el filtro es por medio de pago de la clínica (también los propios).
  mediumLabel: 'Medio de pago',
  mediumAll: 'Todos los medios',
  mediumsLoading: 'Cargando medios…',
  mediumInactive: (name: string) => `${name} (inactivo)`,
  mediumsError: 'No cargaron los medios',
  methodNone: 'Sin método',
  // DX-395: la caja del período en CSV, con medio y referencia.
  export: 'Exportar CSV',
  exportError: 'No pudimos exportar la caja.',
  exported: 'Caja exportada.',
  csvFileName: (from: string, to: string) => `caja-${from}-${to}.csv`,
  countNoun: 'abono',
  countNounPlural: 'abonos',
  summaryTitle: 'Resumen del período',
  byCurrency: 'Por moneda',
  byMethod: 'Por método',
  // DX-377: referencia del pago bajo su medio.
  referenceLabel: (reference: string) => `Ref. ${reference}`,
  paymentsCount: (n: number) => `${n} ${n === 1 ? 'abono' : 'abonos'}`,
  tableLabel: 'Abonos del período',
  colDate: 'Fecha',
  colPatient: 'Paciente',
  // QA D2: un abono va a un plan o a un saldo migrado.
  colPlan: 'Destino',
  colMethod: 'Método',
  colLocation: 'Sede',
  colAmount: 'Monto',
  colActions: 'Acciones',
  voidAction: 'Anular',
  receiptAction: 'Recibo',
  // El «⋯» de cada fila: «Acciones de abono de Ana Gómez».
  rowLabel: (patient: string) => `abono de ${patient}`,
  planLabel: (createdAt: string) => `Plan del ${formatDate(createdAt)}`,
  // DX-262: abono contra el saldo migrado (sin plan).
  openingLabel: (concept: string) => (concept ? `Saldo migrado · ${concept}` : 'Saldo migrado'),
  // Sin "Intenta de nuevo." — alimenta AsyncSection -> SectionError, que trae su propio botón.
  genericLoadError: 'No pudimos cargar la caja.',
  // 400: lo único que la pantalla manda es período, método y página, así que
  // el problema está ahí; el mensaje del servidor va en inglés y no se enseña.
  badRequest: 'El período o el medio de pago no son válidos: revisa las fechas (como mucho 366 días).',
  forbiddenTitle: 'Tu rol no tiene acceso a la caja.',
  forbiddenHint:
    'La caja es para administración y recepción. Pídele acceso a quien administra la clínica.',
  // DX-067: la ventana de anulación de recepción mira el día de REGISTRO, no
  // la fecha de pago; cuando difieren, la fila lo dice.
  registeredToday: 'Registrado hoy',
  // DX-097: los días son los del calendario de la sede, no los del navegador.
  // UX v2: sin nombrar una ciudad (con varias sedes en zonas distintas
  // engañaba); la zona exacta queda en el \`title\`.
  periodNote: (days: string) => `${days} · días según la hora de la sede`,
  periodDays: (from: string, to: string) => (from === to ? from : `del ${from} al ${to}`),
  registeredOn: (date: string) => `Registrado el ${date}`,
  empty: 'No hay abonos en este período.',
  emptyHint: 'Prueba con otro rango de fechas o con otro medio de pago.',
};

type PeriodChoice = CashPreset | 'custom';
/** `ALL` o el id de un medio de pago de la clínica (DX-395). */
type MediumFilter = string;
const ALL_MEDIUMS = 'ALL';

const PERIOD_CHOICES: PeriodChoice[] = ['today', 'week', 'month', 'custom'];


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
 * 40px y los mismos controles (`NativeSelect`, `DateRangePicker`).
 *
 * Los totales llegan del servidor ya agregados sobre el período ENTERO (no la
 * página visible) y sin convertir: un total por moneda, que es lo que se cuenta
 * al cerrar la caja.
 */
export function CashRegisterView({ token, tabs }: CashRegisterViewProps) {
  // DX-097: «hoy», «esta semana» y «este mes» son los de la SEDE (su zona
  // IANA, de la API), no los del navegador. Mientras se resuelve no se
  // consulta nada hasta saber qué día es en la sede; sin zona de la sede, los
  // atajos muestran `SedeConfigError` (el rango personalizado no la necesita).
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
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
  const [customRange, setCustomRange] = useState<CashRange>({
    from: '',
    to: '',
  });
  const [medium, setMedium] = useState<MediumFilter>(ALL_MEDIUMS);
  // DX-395: todos los medios de la clínica, también los desactivados (sus
  // abonos anteriores siguen en la caja).
  const mediums = usePaymentMethods(token, true, { includeInactive: true });
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState('');
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
          ...(medium !== ALL_MEDIUMS ? { paymentMethodId: medium } : {}),
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
  }, [token, rangeFrom, rangeTo, medium, page, reloadKey]);

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

  function changeMedium(next: MediumFilter) {
    setMedium(next);
    setPage(1);
  }

  // DX-395: la caja del período en CSV, con los mismos filtros que la tabla.
  // El reintento cierra sobre el período y el medio que se exportaban: es la
  // operación que se repite, no estado de la pantalla.
  async function exportCsv(from: string, to: string, mediumId: MediumFilter) {
    setExporting(true);
    setExportNotice('');
    try {
      const text = await downloadCashPaymentsCsv(token, {
        from,
        to,
        ...(mediumId !== ALL_MEDIUMS ? { paymentMethodId: mediumId } : {}),
      });
      saveCsv(text, copy.csvFileName(from, to), { bom: true });
      setExportNotice(copy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: copy.exportError }), {
        onRetry: () => void exportCsv(from, to, mediumId),
      });
    } finally {
      setExporting(false);
    }
  }

  const customError = period === 'custom' ? rangeError(customRange) : null;
  const items = data?.items ?? [];
  // Con el rango escrito inválido, lo último cargado es de OTRO rango: no se
  // pinta (ni conteo, ni resumen, ni tabla, ni páginas) para que nadie lo lea
  // como la respuesta a las fechas que tiene delante.
  const showResults = customError === null && !forbidden;
  // Con «Todas las sedes» la sede de cada abono importa; con una sede concreta
  // sería la misma en todas las filas.
  const showLocation = !data?.scope.location;

  const columns: DataListColumn<CashPayment>[] = [
    {
      id: 'date',
      header: copy.colDate,
      cell: (payment) => (
        <span className="tabular-nums">
          {formatCivilDate(payment.paidOn)}
          <RegisteredNote payment={payment} />
        </span>
      ),
      mobileCell: (payment) => formatCivilDate(payment.paidOn),
    },
    {
      id: 'patient',
      header: copy.colPatient,
      mobile: 'primary',
      cell: (payment) => (
        <Link
          href={`/patients/${payment.patient.id}`}
          className="relative z-10 font-medium text-ink underline-offset-4 hover:text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
        >
          {payment.patient.fullName}
        </Link>
      ),
    },
    {
      id: 'target',
      header: copy.colPlan,
      cell: (payment) => <span className="text-muted">{targetLabel(payment)}</span>,
      mobileCell: targetLabel,
    },
    {
      id: 'method',
      header: copy.colMethod,
      cell: (payment) => (
        <>
          {payment.method ? (
            <StatusBadge kind="paymentMethod" status={payment.method}>
              {payment.paymentMethod?.name ?? PAYMENT_METHOD_LABELS[payment.method]}
            </StatusBadge>
          ) : (
            <span className="text-muted">{copy.methodNone}</span>
          )}
          {payment.reference ? (
            <span className="t-caption mt-1 block font-mono text-muted">{copy.referenceLabel(payment.reference)}</span>
          ) : null}
        </>
      ),
      // En el teléfono, el medio y su referencia (la que se busca al cuadrar).
      mobileCell: (payment) =>
        [
          payment.method ? (payment.paymentMethod?.name ?? PAYMENT_METHOD_LABELS[payment.method]) : null,
          payment.reference ? copy.referenceLabel(payment.reference) : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
    },
    ...(showLocation
      ? [
          {
            id: 'location',
            header: copy.colLocation,
            cell: (payment: CashPayment) => payment.location.name,
          },
        ]
      : []),
    {
      id: 'amount',
      header: copy.colAmount,
      numeric: true,
      mobile: 'trailing',
      cell: (payment) => (
        <span className="font-medium text-ink">{formatCurrency(payment.amount, payment.currency)}</span>
      ),
    },
  ];

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
        {...(tabs
          ? {
              role: 'tabpanel',
              id: tabs.panelId,
              'aria-labelledby': tabs.tabId,
            }
          : {})}
      >
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SegmentedControl
            semantics="toggle"
            fullWidthOnMobile
            aria-label={copy.periodLabel}
            value={period}
            onValueChange={choosePeriod}
            options={PERIOD_CHOICES.map((choice) => ({ value: choice, label: copy.presets[choice] }))}
          />

          {period === 'custom' ? (
            <DateRangePicker
              label={copy.customLabel}
              className="min-w-0 sm:w-72"
              value={customRange.from || customRange.to ? customRange : null}
              onChange={(next) => changeCustom(next ?? { from: '', to: '' })}
              isInvalid={customError !== null}
              aria-describedby={customError ? rangeErrorId : undefined}
            />
          ) : null}

          {mediums.status === 'error' ? (
            <FieldError
              label={copy.mediumsError}
              onRetry={mediums.retry}
              className="h-10 max-sm:h-11 sm:w-56"
            />
          ) : (
            <NativeSelect
              aria-label={copy.mediumLabel}
              value={medium}
              disabled={mediums.status === 'loading'}
              onChange={(e) => changeMedium(e.target.value)}
              className="sm:w-56"
              selectClassName="max-sm:h-11"
            >
              <option value={ALL_MEDIUMS}>
                {mediums.status === 'loading' ? copy.mediumsLoading : copy.mediumAll}
              </option>
              {mediums.methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {mediumOptionLabel(m)}
                </option>
              ))}
            </NativeSelect>
          )}

          {/* La acción del listado cierra la barra, a la derecha (DESIGN.md). */}
          <Button
            type="button"
            variant="secondary"
            onClick={() => range && void exportCsv(range.from, range.to, medium)}
            disabled={!range || customError !== null || forbidden}
            loading={exporting}
            className="max-sm:min-h-11 max-sm:w-full sm:ml-auto"
          >
            {copy.export}
          </Button>
        </div>

        {customError ? <InlineError id={rangeErrorId}>{customError}</InlineError> : null}

        {range && timeZone && customError === null ? (
          <p className="text-sm text-muted tabular-nums" data-testid="cash-period-note" title={timeZone}>
            {copy.periodNote(copy.periodDays(formatCivilDate(range.from), formatCivilDate(range.to)))}
          </p>
        ) : null}

        <p role="status" className={exportNotice ? 'text-sm text-success-text' : 'sr-only'}>
          {exportNotice}
        </p>

        {/* Aviso de la última anulación: fuera de AsyncSection para que la
            recarga no lo borre. */}
        <p role="status" className={voiding.notice ? 'text-sm text-success-text' : 'sr-only'}>
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

        {showResults && zone.status === 'error' && period !== 'custom' ? (
          <SedeConfigError kind="timeZone" description={zone.message} onRetry={zone.retry} />
        ) : showResults ? (
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

              {/* Tabla desde \`sm\`; en el teléfono, tarjeta de dos líneas
                  (paciente + monto / fecha · método · destino · sede). Recibo
                  y Anular van en el «⋯»: antes eran dos botones con borde por
                  fila y «Anular» pesaba lo mismo que «Recibo». */}
              <DataList
                label={copy.tableLabel}
                rows={items}
                columns={columns}
                getRowKey={(payment) => payment.id}
                getRowLabel={(payment) => copy.rowLabel(payment.patient.fullName)}
                rowActions={(payment) => [
                  { label: copy.receiptAction, onSelect: () => setReceiptPaymentId(payment.id) },
                  ...(payment.canVoid
                    ? [
                        {
                          label: copy.voidAction,
                          destructive: true,
                          separatorBefore: true,
                          onSelect: () =>
                            voiding.request({
                              id: payment.id,
                              amount: payment.amount,
                              currency: payment.currency,
                              paidOn: payment.paidOn,
                              patientName: payment.patient.fullName,
                              splitLines: payment.splitLines,
                            }),
                        },
                      ]
                    : []),
                ]}
              />
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
        splitLines={voiding.target?.splitLines ?? undefined}
      />
    </>
  );
}

/** A qué fue el abono: un plan o un saldo migrado (QA D2). */
function targetLabel(payment: CashPayment): string {
  return payment.treatmentPlan
    ? copy.planLabel(payment.treatmentPlan.createdAt)
    : copy.openingLabel(payment.openingBalance?.concept ?? '');
}

/** Nombre del medio en el filtro; el desactivado lo dice (DX-395). */
function mediumOptionLabel(medium: ClinicPaymentMethod): string {
  return medium.active ? medium.name : copy.mediumInactive(medium.name);
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
    <span className="t-caption block font-normal text-muted">
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
    <p className="mt-3 inline-flex max-w-[68ch] items-center gap-2 rounded-lg bg-surface-sunken px-3 py-1.5 text-sm text-muted">
      <Building2 aria-hidden className="size-4 shrink-0 text-muted" />
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
      <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle px-4 py-3 sm:px-6">
        <h2 id={headingId} className="t-title text-ink">
          {copy.summaryTitle}
        </h2>
      </div>
      <div className="grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-border-subtle">
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
        <SummaryList label={copy.byMethod} className="max-sm:border-t max-sm:border-border-subtle">
          {/* DX-377: por medio de pago de la clínica y moneda. */}
          {summary.byPaymentMethod.map((row) => (
            <SummaryRow
              key={`${row.paymentMethodId ?? 'none'}-${row.currency}`}
              label={row.name ?? copy.methodNone}
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
      <ul aria-labelledby={labelId} className="mt-1 divide-y divide-border-subtle">
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
        <span className="t-caption text-muted tabular-nums">{meta}</span>
      </span>
      <span className="shrink-0 font-medium tabular-nums text-ink">{value}</span>
    </li>
  );
}
