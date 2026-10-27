'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Download, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import { formatCurrency } from '@/lib/format/currency';
import { firstOfMonth, formatCivilDate } from '@/lib/format/date';
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
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { ResultCount, toolbarFieldClass } from '@/components/shared/list-toolbar';
import { cn } from '@/lib/utils';

export const discountReportCopy = {
  title: 'Descuentos',
  description:
    'Lo que se descontó en los planes de tratamiento: cuánto, sobre qué bruto, por qué y quién lo dio. Las rebajas por convenio van aparte, con quién asignó el convenio y quién creó el ítem. Por moneda y sin convertir.',
  scopeAll: 'Toda la clínica',
  scopeLocation: (name: string) => `Descuentos dados en ${name}`,
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
  percent: (n: number) => `${n.toLocaleString('es', { maximumFractionDigits: 2 })} %`,
  tableLabel: 'Descuentos del periodo, del más reciente al más antiguo',
  listLabel: 'Descuentos',
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
  statement: (name: string) => `Abrir la ficha de ${name}`,
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
 * Totales por moneda como registro con filete (no tarjetas de métrica). Los de
 * DX-204 solo cuentan descuentos; las rebajas de convenio van en sus filas
 * (SEC-047).
 */
function DiscountSummary({
  totals,
  agreementTotals,
}: {
  totals: DiscountReportTotal[];
  agreementTotals: AgreementReductionTotal[];
}) {
  const headingId = React.useId();
  if (totals.length === 0 && agreementTotals.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-border bg-surface">
      <h2 id={headingId} className="t-title border-b border-hairline px-4 py-3 text-ink sm:px-6">
        {discountReportCopy.summaryTitle}
      </h2>
      <div className="divide-y divide-hairline">
        {totals.map((total) => (
          <dl
            key={total.currency}
            data-testid={`discount-total-${total.currency}`}
            className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-4 sm:px-6"
          >
            <div className="min-w-0">
              <dt className="t-label text-muted">{total.currency}</dt>
              <dd className="tabular-nums text-ink">{discountReportCopy.items(total.items)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="t-label text-muted">{discountReportCopy.totalDiscount}</dt>
              <dd className="truncate font-medium tabular-nums text-ink">
                {formatCurrency(total.discount, total.currency)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="t-label text-muted">{discountReportCopy.gross}</dt>
              <dd className="truncate tabular-nums text-ink">{formatCurrency(total.gross, total.currency)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="t-label text-muted">{discountReportCopy.percentOfGross}</dt>
              <dd className="font-medium tabular-nums text-ink">{discountReportCopy.percent(total.percentOfGross)}</dd>
            </div>
          </dl>
        ))}
        {agreementTotals.map((total) => (
          <dl
            key={`agreement-${total.currency}`}
            data-testid={`agreement-total-${total.currency}`}
            className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-4 sm:px-6"
          >
            <div className="min-w-0">
              <dt className="t-label text-muted">{total.currency}</dt>
              <dd className="tabular-nums text-ink">{discountReportCopy.agreementItems(total.items)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="t-label text-muted">{discountReportCopy.agreementReduction}</dt>
              <dd className="truncate font-medium tabular-nums text-ink">
                {formatCurrency(total.reduction, total.currency)}
              </dd>
            </div>
          </dl>
        ))}
      </div>
    </section>
  );
}

/**
 * Importe descontado (SEC-041: rebaja de precio frente al catálogo + descuento)
 * y su % sobre el precio de referencia (el de catálogo si se rebajó). SEC-047:
 * la rebaja de convenio va en su propia línea; un ítem que solo tiene esa
 * rebaja no pinta un «−0» de descuento. En la tarjeta móvil la frase del
 * convenio va fuera de la cabecera (`withAgreement` a false), en su propio
 * párrafo que parte líneas: dentro de un bloque que no se encoge desbordaba
 * 390 px (QA D1).
 */
function AmountCell({ item, withAgreement = true }: { item: DiscountReportItem; withAgreement?: boolean }) {
  const agreement = item.agreementReduction > 0;
  return (
    <>
      {item.discount > 0 || !agreement ? (
        <>
          <span className="block font-medium tabular-nums text-ink">
            −{formatCurrency(item.discount, item.currency)}
          </span>
          <span className="block text-xs tabular-nums text-muted">
            {discountReportCopy.ofPrice(
              formatCurrency(item.price + item.priceReduction, item.currency),
              discountReportCopy.percent(item.percent),
            )}
          </span>
        </>
      ) : null}
      {item.priceReduction > 0 ? (
        <span className="block text-xs tabular-nums text-muted">
          {discountReportCopy.priceReduced(formatCurrency(item.price, item.currency))}
        </span>
      ) : null}
      {agreement && withAgreement ? (
        <span className="block text-xs tabular-nums text-ink">{agreementLine(item)}</span>
      ) : null}
    </>
  );
}

function agreementLine(item: DiscountReportItem): string {
  return discountReportCopy.agreementLine(
    item.agreementName ?? '',
    formatCurrency(item.agreementReduction, item.currency),
    discountReportCopy.percent(item.agreementPercent),
    formatCurrency(item.basePrice ?? 0, item.currency),
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
  return (
    <>
      <span className={cn('block', item.reason || agreementOnly(item) ? 'text-ink' : 'text-muted')}>
        {reasonLabel(item)}
      </span>
      {item.reasonNote ? <span className="block break-words text-xs text-muted">{item.reasonNote}</span> : null}
    </>
  );
}

/**
 * Informe «Descuentos» (DX-204, solo ADMIN): por periodo, sede (la activa del
 * selector de sede, como la cartera) y quién lo dio. Totales por moneda con el
 * % sobre el bruto y el detalle ítem a ítem; exportable a CSV. En escritorio
 * es una tabla; bajo `sm`, una tarjeta por descuento.
 */
export function DiscountReportView({ token }: { token: string }) {
  const isAdmin = getTokenRole(token) === 'ADMIN';
  // Sin zona de la sede no hay «hoy» ni período por defecto: `SedeConfigError`.
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : null;
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

  return (
    <>
      <PageHeader
        title={discountReportCopy.title}
        description={discountReportCopy.description}
        meta={
          data ? (
            <p className="mt-3 inline-flex max-w-[68ch] items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-muted">
              <Building2 aria-hidden className="size-4 shrink-0 text-muted/80" />
              <span>{location ? discountReportCopy.scopeLocation(location.name) : discountReportCopy.scopeAll}</span>
            </p>
          ) : null
        }
      />

      <div className="flex flex-col gap-3">
        {!forbidden ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
              <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
                {discountReportCopy.fromLabel}
                <Input
                  type="date"
                  value={effectiveFrom ?? ''}
                  max={effectiveTo ?? undefined}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setFrom(e.target.value);
                    setPage(1);
                  }}
                  className="tabular-nums sm:w-44"
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-sm text-muted">
                {discountReportCopy.toLabel}
                <Input
                  type="date"
                  value={effectiveTo ?? ''}
                  min={effectiveFrom ?? undefined}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setTo(e.target.value);
                    setPage(1);
                  }}
                  className="tabular-nums sm:w-44"
                />
              </label>
              {staff.length > 0 ? (
                <label className="col-span-2 flex min-w-0 flex-col gap-1 text-sm text-muted">
                  {discountReportCopy.professionalLabel}
                  <select
                    value={professionalId}
                    onChange={(e) => {
                      setProfessionalId(e.target.value);
                      setPage(1);
                    }}
                    className={cn(toolbarFieldClass, 'sm:w-56')}
                  >
                    <option value="ALL">{discountReportCopy.professionalAll}</option>
                    {staff.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {isAdmin ? (
              <Button
                type="button"
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

        <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
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
        ) : (
          <>
            {!showLoading && !loadError && data ? (
              <ResultCount
                total={data.total}
                noun={discountReportCopy.countNoun}
                nounPlural={discountReportCopy.countNounPlural}
              />
            ) : null}

            <AsyncSection
              loading={showLoading}
              error={loadError}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={items.length === 0}
              emptyTitle={discountReportCopy.empty}
              emptyDescription={discountReportCopy.emptyHint}
              skeleton={<TableSkeleton rows={5} />}
            >
              {data ? <DiscountSummary totals={data.totals} agreementTotals={data.agreementTotals} /> : null}

              {/* Escritorio: una tabla. */}
              <Card className="overflow-hidden p-0 max-sm:hidden">
                <Table aria-label={discountReportCopy.tableLabel}>
                  <caption className="sr-only">{discountReportCopy.tableLabel}</caption>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead scope="col">{discountReportCopy.colDate}</TableHead>
                      <TableHead scope="col">{discountReportCopy.colPatient}</TableHead>
                      <TableHead scope="col">{discountReportCopy.colPlan}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {discountReportCopy.colAmount}
                      </TableHead>
                      <TableHead scope="col">{discountReportCopy.colReason}</TableHead>
                      <TableHead scope="col">{discountReportCopy.colBy}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.itemId} data-testid="discount-row">
                        <TableCell className="tabular-nums">{formatCivilDate(item.discountOn)}</TableCell>
                        <TableCell>
                          <Link
                            href={patientHref(item)}
                            aria-label={discountReportCopy.statement(item.patientName)}
                            className="font-medium text-ink underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {item.patientName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="block text-ink">
                            {discountReportCopy.tooth(item.toothNumber, item.procedure)}
                          </span>
                          <span className="block text-xs text-muted">
                            {discountReportCopy.planOf(formatCivilDate(item.planCreatedOn), item.planOptionLabel)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <AmountCell item={item} />
                        </TableCell>
                        <TableCell className="max-w-[16rem]">
                          <ReasonCell item={item} />
                        </TableCell>
                        <TableCell>
                          <span data-testid="discount-author" className={authorName(item) ? 'text-ink' : 'text-muted'}>
                            {authorName(item) ?? discountReportCopy.unknownAuthor}
                          </span>
                          {item.locationName ? (
                            <span className="block text-xs text-muted">{item.locationName}</span>
                          ) : null}
                          <AgreementAuthors item={item} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {/* Móvil: una tarjeta por descuento, sin scroll lateral. */}
              <ul aria-label={discountReportCopy.listLabel} className="flex flex-col gap-3 sm:hidden">
                {items.map((item) => (
                  <li
                    key={item.itemId}
                    data-testid="discount-card"
                    className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={patientHref(item)}
                        aria-label={discountReportCopy.statement(item.patientName)}
                        className="min-w-0 break-words font-medium text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        {item.patientName}
                      </Link>
                      <span data-testid="discount-card-amount" className="shrink-0 text-right">
                        <AmountCell item={item} withAgreement={false} />
                      </span>
                    </div>
                    {item.agreementReduction > 0 ? (
                      <p className="break-words text-xs tabular-nums text-ink">{agreementLine(item)}</p>
                    ) : null}
                    <p className="text-ink">{discountReportCopy.tooth(item.toothNumber, item.procedure)}</p>
                    <p className="text-xs text-muted tabular-nums">
                      {formatCivilDate(item.discountOn)} ·{' '}
                      {discountReportCopy.planOf(formatCivilDate(item.planCreatedOn), item.planOptionLabel)}
                    </p>
                    <div>
                      <ReasonCell item={item} />
                    </div>
                    <p className="text-xs text-muted">
                      {discountReportCopy.colBy}: {authorName(item) ?? discountReportCopy.unknownAuthor}
                      {item.locationName ? ` · ${item.locationName}` : ''}
                    </p>
                    <AgreementAuthors item={item} />
                  </li>
                ))}
              </ul>
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
