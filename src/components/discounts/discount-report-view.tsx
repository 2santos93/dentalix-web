'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Download, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { moneyWithCode } from '@/lib/format/sede-number';
import { firstOfMonth } from '@/lib/format/date';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import {
  downloadDiscountReportCsv,
  getDiscountReport,
  type DiscountReport,
  type DiscountReportFilters,
  type DiscountReportItem,
  type DiscountReportTotal,
  type AgreementReductionTotal,
} from '@/lib/discounts/discounts-api';
import { DISCOUNT_REASON_LABELS, type DiscountReasonCode } from '@/lib/discounts/discount-rules';
import { saveCsv } from '@/lib/files/save-csv';
import { notifyError } from '@/components/errors/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { FormField } from '@/components/shared/form-field';
import { ScopeMarker } from '@/components/receivables/scope-marker';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { ResultCount } from '@/components/shared/list-toolbar';
import { cn } from '@/lib/utils';

export const discountReportCopy = {
  title: 'Descuentos',
  // Una línea de apoyo (crítica ops §6): el detalle de convenios está en cada fila.
  description: 'Descuentos y convenios aplicados en los planes, con su motivo y quién los dio. Por moneda, sin convertir.',
  periodLabel: 'Periodo',
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  professionalLabel: 'Quién lo dio',
  professionalAll: 'Todo el equipo',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exportError: 'No pudimos exportar el informe.',
  exported: 'Informe exportado.',
  countNoun: 'ítem con descuento o convenio',
  countNounPlural: 'ítems con descuento o convenio',
  summaryTitle: 'Total del periodo',
  totalDiscount: 'Descontado',
  gross: 'Bruto',
  percentOfGross: 'Sobre el bruto',
  agreementReduction: 'Rebaja por convenio',
  agreementItems: (n: number) => (n === 1 ? '1 ítem con rebaja de convenio' : `${n} ítems con rebaja de convenio`),
  agreementReason: (name: string | null) => `Convenio ${name ?? ''}`.trim(),
  agreementLine: (name: string, amount: string, percent: string, base: string) =>
    `Convenio «${name}»: −${amount} (${percent} de ${base})`,
  agreementAssignedBy: (name: string) => `Convenio asignado por ${name}`,
  itemCreatedBy: (name: string) => `Ítem creado por ${name}`,
  items: (n: number) => (n === 1 ? '1 ítem' : `${n} ítems`),
  listLabel: 'Descuentos del periodo',
  colDate: 'Fecha',
  colPatient: 'Paciente',
  colPlan: 'Plan · ítem',
  colAmount: 'Descuento',
  colReason: 'Motivo',
  colBy: 'Dado por',
  planOf: (day: string, label: string | null) => `Plan del ${day}${label ? ` · ${label}` : ''}`,
  tooth: (tooth: string, procedure: string) => `Diente ${tooth} · ${procedure}`,
  ofPrice: (price: string, percent: string) => `${percent} de ${price}`,
  priceReduced: (price: string) => `Precio rebajado a ${price} (bajo el de catálogo)`,
  noReason: 'Sin motivo',
  unknownAuthor: 'Sin registrar',
  // Sin «Intenta de nuevo.»: AsyncSection → SectionError trae «Reintentar».
  loadError: 'No pudimos cargar el informe de descuentos.',
  badRequest: 'El periodo no es válido: «Desde» no puede ser posterior a «Hasta» y caben como mucho 366 días.',
  forbiddenTitle: 'Tu rol no tiene acceso al informe de descuentos.',
  forbiddenHint: 'El informe es para la administración de la clínica.',
  empty: 'No hubo descuentos en este periodo',
  emptyHint: 'Prueba con otras fechas, otra sede u otro miembro del equipo.',
};

/** SEC-047: línea que solo tiene rebaja de convenio (sin descuento propio). */
function agreementOnly(item: DiscountReportItem): boolean {
  return item.discount === 0 && item.agreementReduction > 0;
}

function reasonLabel(item: DiscountReportItem): string {
  if (agreementOnly(item)) return discountReportCopy.agreementReason(item.agreementName);
  return item.reason ? DISCOUNT_REASON_LABELS[item.reason as DiscountReasonCode] : discountReportCopy.noReason;
}

/** Quién: el del descuento; en una línea solo de convenio, quien lo asignó o creó el ítem. */
function authorName(item: DiscountReportItem): string | null {
  return agreementOnly(item) ? (item.agreementAssignedByName ?? item.createdByName) : item.discountByName;
}

function patientHref(item: DiscountReportItem): string {
  return `/patients/${item.patientId}?tab=treatment-plans`;
}

/**
 * Totales por moneda como registro con filete (no tarjetas de métrica). La
 * moneda y el número de ítems son el ENCABEZADO de la fila, no una métrica más
 * (crítica ops §6); las tres cifras van a la derecha. Los de DX-204 solo
 * cuentan descuentos; las rebajas de convenio van en su propia fila (SEC-047).
 */
function DiscountSummary({
  totals,
  agreementTotals,
  fmt,
}: {
  totals: DiscountReportTotal[];
  agreementTotals: AgreementReductionTotal[];
  fmt: RegionalFormat;
}) {
  const headingId = React.useId();
  if (totals.length === 0 && agreementTotals.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-border bg-surface">
      <h2 id={headingId} className="t-title border-b border-border-subtle px-4 py-3 text-ink sm:px-6">
        {discountReportCopy.summaryTitle}
      </h2>
      <div className="divide-y divide-border-subtle">
        {totals.map((total) => (
          <SummaryRow
            key={total.currency}
            testId={`discount-total-${total.currency}`}
            heading={`${total.currency} · ${discountReportCopy.items(total.items)}`}
            metrics={[
              { label: discountReportCopy.totalDiscount, value: moneyWithCode(total.discount, total.currency, fmt), strong: true },
              { label: discountReportCopy.gross, value: moneyWithCode(total.gross, total.currency, fmt) },
              { label: discountReportCopy.percentOfGross, value: fmt.percent(total.percentOfGross, 2), strong: true },
            ]}
          />
        ))}
        {agreementTotals.map((total) => (
          <SummaryRow
            key={`agreement-${total.currency}`}
            testId={`agreement-total-${total.currency}`}
            heading={`${total.currency} · ${discountReportCopy.agreementItems(total.items)}`}
            metrics={[
              {
                label: discountReportCopy.agreementReduction,
                value: moneyWithCode(total.reduction, total.currency, fmt),
                strong: true,
              },
            ]}
          />
        ))}
      </div>
    </section>
  );
}

function SummaryRow({
  testId,
  heading,
  metrics,
}: {
  testId: string;
  heading: string;
  metrics: { label: string; value: string; strong?: boolean }[];
}) {
  const labelId = React.useId();
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6"
    >
      <p id={labelId} className="text-sm font-medium tabular-nums text-ink">
        {heading}
      </p>
      <dl aria-labelledby={labelId} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 sm:flex sm:gap-8">
        {metrics.map((m) => (
          <div key={m.label} className="contents sm:flex sm:min-w-0 sm:flex-col sm:items-end">
            <dt className="t-label text-muted">{m.label}</dt>
            <dd className={cn('text-right tabular-nums text-ink', m.strong && 'font-medium')}>{m.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Importe descontado (SEC-041: rebaja de precio frente al catálogo + descuento)
 * y su % sobre el precio de referencia (el de catálogo si se rebajó). SEC-047:
 * la rebaja de convenio va en su propia línea; un ítem que solo tiene esa
 * rebaja no pinta un «−0» de descuento. En la tarjeta del teléfono solo va
 * el importe; la frase del convenio pasa a la línea 2, que parte líneas
 * (dentro de un bloque que no se encoge desbordaba 390 px, QA D1).
 */
function AmountCell({ item, fmt }: { item: DiscountReportItem; fmt: RegionalFormat }) {
  const agreement = item.agreementReduction > 0;
  return (
    <>
      {item.discount > 0 || !agreement ? (
        <>
          <span className="block font-medium tabular-nums text-ink">
            −{moneyWithCode(item.discount, item.currency, fmt)}
          </span>
          <span className="block text-xs tabular-nums text-muted">
            {discountReportCopy.ofPrice(
              moneyWithCode(item.price + item.priceReduction, item.currency, fmt),
              fmt.percent(item.percent, 2),
            )}
          </span>
        </>
      ) : null}
      {item.priceReduction > 0 ? (
        <span className="block text-xs tabular-nums text-muted">
          {discountReportCopy.priceReduced(moneyWithCode(item.price, item.currency, fmt))}
        </span>
      ) : null}
      {agreement ? (
        <span className="block text-xs tabular-nums text-ink">{agreementLine(item, fmt)}</span>
      ) : null}
    </>
  );
}

function agreementLine(item: DiscountReportItem, fmt: RegionalFormat): string {
  return discountReportCopy.agreementLine(
    item.agreementName ?? '',
    moneyWithCode(item.agreementReduction, item.currency, fmt),
    fmt.percent(item.agreementPercent, 2),
    moneyWithCode(item.basePrice ?? 0, item.currency, fmt),
  );
}

/** SEC-047: quién asignó el convenio y quién creó el ítem, si hay rebaja de convenio. */
function AgreementAuthors({ item, className }: { item: DiscountReportItem; className?: string }) {
  if (item.agreementReduction <= 0) return null;
  const unknown = discountReportCopy.unknownAuthor;
  return (
    <span className={cn('block text-xs text-muted', className)}>
      <span className="block">{discountReportCopy.agreementAssignedBy(item.agreementAssignedByName ?? unknown)}</span>
      <span className="block">{discountReportCopy.itemCreatedBy(item.createdByName ?? unknown)}</span>
    </span>
  );
}

function ReasonCell({ item }: { item: DiscountReportItem }) {
  // «Sin motivo» es justo lo que una auditoría de descuentos busca: se marca.
  const missing = !item.reason && !agreementOnly(item);
  return (
    <span className="block">
      {missing ? (
        <Badge variant="warning">{discountReportCopy.noReason}</Badge>
      ) : (
        <span className="block text-ink">{reasonLabel(item)}</span>
      )}
      {item.reasonNote ? <span className="block break-words text-xs text-muted">{item.reasonNote}</span> : null}
    </span>
  );
}

/**
 * Informe «Descuentos» (DX-204, solo ADMIN): por periodo, sede (la activa del
 * selector de sede, como la cartera) y quién lo dio. Totales por moneda con el
 * % sobre el bruto y el detalle ítem a ítem; exportable a CSV. `DataList`: tabla en
 * escritorio, tarjeta compacta en el teléfono; la fila abre los planes del paciente.
 */
export function DiscountReportView({ token }: { token: string }) {
  const isAdmin = getTokenRole(token) === 'ADMIN';
  // Sin zona de la sede no hay «hoy» ni período por defecto: `SedeConfigError`.
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : null;
  // DX-378 (FE-078): importes, % y fechas con el formato de la sede, no con «es».
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState('ALL');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DiscountReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Por defecto, el mes en curso hasta hoy, en la zona de la sede.
  const effectiveFrom = from ?? (today ? firstOfMonth(today) : null);
  const effectiveTo = to ?? today;
  const filters: DiscountReportFilters | null =
    effectiveFrom && effectiveTo
      ? {
          from: effectiveFrom,
          to: effectiveTo,
          ...(professionalId !== 'ALL' ? { professionalId } : {}),
        }
      : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  useEffect(() => {
    if (!token || !filterKey) return;
    const query: DiscountReportFilters = JSON.parse(filterKey);
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getDiscountReport(token, { ...query, page });
        if (cancelled) return;
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
          apiErrorMessage(err, {
            fallback: discountReportCopy.loadError,
            byStatus: { 400: discountReportCopy.badRequest },
          }),
        );
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, page, reloadKey]);

  // Equipo para el filtro «Quién lo dio»: si falla, el filtro no se ofrece.
  useEffect(() => {
    if (!token || !isAdmin) return;
    let cancelled = false;
    listStaff(token)
      .then((members) => {
        if (!cancelled) setStaff(members);
      })
      .catch(() => {
        /* sin lista, sin filtro por profesional */
      });
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin]);

  async function exportCsv() {
    if (!filterKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const query = JSON.parse(filterKey) as DiscountReportFilters;
      const text = await downloadDiscountReportCsv(token, query);
      saveCsv(text, `descuentos-${query.from}-${query.to}.csv`);
      setNotice(discountReportCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: discountReportCopy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  const items = data?.items ?? [];
  const location = data?.scope.location ?? null;
  const showLoading = loading || !filters;

  const columns: DataListColumn<DiscountReportItem>[] = fmt
    ? [
        {
          id: 'date',
          header: discountReportCopy.colDate,
          cellClassName: 'whitespace-nowrap tabular-nums',
          cell: (item) => fmt.civilDate(item.discountOn),
        },
        {
          id: 'patient',
          header: discountReportCopy.colPatient,
          mobile: 'primary',
          cell: (item) => item.patientName,
        },
        {
          id: 'plan',
          header: discountReportCopy.colPlan,
          cell: (item) => (
            <>
              <span className="block text-ink">{discountReportCopy.tooth(item.toothNumber, item.procedure)}</span>
              <span className="block text-xs text-muted">
                {discountReportCopy.planOf(fmt.civilDate(item.planCreatedOn), item.planOptionLabel)}
              </span>
            </>
          ),
          // Tarjeta: el ítem y, si las hay, la rebaja de precio y la frase del
          // convenio, que en la tabla van bajo el importe (QA D1: parten línea).
          mobileCell: (item) => (
            <>
              {discountReportCopy.tooth(item.toothNumber, item.procedure)}
              {item.priceReduction > 0 ? (
                <> · {discountReportCopy.priceReduced(moneyWithCode(item.price, item.currency, fmt))}</>
              ) : null}
              {item.agreementReduction > 0 ? <> · {agreementLine(item, fmt)}</> : null}
            </>
          ),
        },
        {
          id: 'amount',
          header: discountReportCopy.colAmount,
          numeric: true,
          mobile: 'trailing',
          cell: (item) => <AmountCell item={item} fmt={fmt} />,
          mobileCell: (item) => (
            <span data-testid="discount-card-amount" className="font-medium">
              −
              {moneyWithCode(
                item.discount > 0 || item.agreementReduction <= 0 ? item.discount : item.agreementReduction,
                item.currency,
                fmt,
              )}
            </span>
          ),
        },
        {
          id: 'reason',
          header: discountReportCopy.colReason,
          cellClassName: 'max-w-[16rem]',
          cell: (item) => <ReasonCell item={item} />,
          mobileCell: (item) =>
            !item.reason && !agreementOnly(item) ? (
              <span className="text-warning-text">{discountReportCopy.noReason}</span>
            ) : (
              <>
                {reasonLabel(item)}
                {item.reasonNote ? ` (${item.reasonNote})` : ''}
              </>
            ),
        },
        {
          id: 'by',
          header: discountReportCopy.colBy,
          cell: (item) => (
            <>
              <span data-testid="discount-author" className={authorName(item) ? 'text-ink' : 'text-muted'}>
                {authorName(item) ?? discountReportCopy.unknownAuthor}
              </span>
              {item.locationName ? <span className="block text-xs text-muted">{item.locationName}</span> : null}
              <AgreementAuthors item={item} />
            </>
          ),
          mobileCell: (item) =>
            `${discountReportCopy.colBy}: ${authorName(item) ?? discountReportCopy.unknownAuthor}${
              item.locationName ? ` · ${item.locationName}` : ''
            }`,
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title={discountReportCopy.title}
        description={discountReportCopy.description}
        meta={data ? <ScopeMarker location={location} /> : null}
      />

      <div className="flex flex-col gap-3">
        {!forbidden ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <FormField htmlFor="discount-period" label={discountReportCopy.periodLabel} className="w-full sm:w-auto">
                <DateRangePicker
                  id="discount-period"
                  value={effectiveFrom && effectiveTo ? { from: effectiveFrom, to: effectiveTo } : null}
                  onChange={(range) => {
                    if (!range) return;
                    setFrom(range.from);
                    setTo(range.to);
                    setPage(1);
                  }}
                  presets
                  startLabel={discountReportCopy.fromLabel}
                  endLabel={discountReportCopy.toLabel}
                />
              </FormField>
              {staff.length > 0 ? (
                <FormField
                  htmlFor="discount-professional"
                  label={discountReportCopy.professionalLabel}
                  className="w-full sm:w-56"
                >
                  <NativeSelect
                    id="discount-professional"
                    value={professionalId}
                    onChange={(e) => {
                      setProfessionalId(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="ALL">{discountReportCopy.professionalAll}</option>
                    {staff.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.fullName}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              ) : null}
            </div>
            {/* Exportar es secundario: el informe se lee aquí, el CSV es un extra. */}
            {isAdmin ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void exportCsv()}
                disabled={exporting || showLoading || Boolean(loadError)}
                className="shrink-0"
              >
                <Download aria-hidden />
                {exporting ? discountReportCopy.exporting : discountReportCopy.export}
              </Button>
            ) : null}
          </div>
        ) : null}

        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
          {notice}
        </p>

        {forbidden ? (
          <EmptyState
            role="status"
            icon={<Lock aria-hidden />}
            title={discountReportCopy.forbiddenTitle}
            description={discountReportCopy.forbiddenHint}
          />
        ) : zone.status === 'error' && !filters ? (
          <SedeConfigError kind="timeZone" description={zone.message} onRetry={zone.retry} />
        ) : !fmt ? (
          sedeFormat.status === 'error' ? (
            <SedeConfigError
              kind="locale"
              description={sedeFormat.message}
              onRetry={sedeFormat.retry}
              locationId={sedeFormat.locationId}
            />
          ) : (
            <TableSkeleton rows={5} />
          )
        ) : (
          <>
            <AsyncSection
              loading={showLoading}
              error={loadError}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={items.length === 0}
              emptyTitle={discountReportCopy.empty}
              emptyDescription={discountReportCopy.emptyHint}
              skeleton={<TableSkeleton rows={5} />}
            >
              {data ? <DiscountSummary totals={data.totals} agreementTotals={data.agreementTotals} fmt={fmt} /> : null}

              <ResultCount
                total={data?.total ?? 0}
                noun={discountReportCopy.countNoun}
                nounPlural={discountReportCopy.countNounPlural}
              />

              <DataList
                label={discountReportCopy.listLabel}
                rows={items}
                columns={columns}
                getRowKey={(item) => item.itemId}
                getRowHref={patientHref}
              />
            </AsyncSection>

            {!loadError ? (
              <Pagination
                page={page}
                pageSize={data?.pageSize ?? 0}
                total={data?.total ?? 0}
                onPageChange={setPage}
                disabled={showLoading}
              />
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
