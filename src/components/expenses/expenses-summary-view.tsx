"use client";
import * as React from "react";
import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, Lock } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { apiErrorMessage } from "@/lib/api/error-message";
import {
  downloadExpenseSummaryCsv,
  getExpenseSummary,
  type ExpenseSummary,
  type ExpenseSummaryQuery,
  type ExpenseSummaryRow,
} from "@/lib/expenses/expenses-api";
import {
  EXPENSE_SUMMARY_DEFAULT_MONTHS,
  EXPENSE_SUMMARY_MAX_DAYS,
  EXPENSE_SUMMARY_MAX_MONTHS,
  daysInRange,
  expenseSummaryCsvFileName,
  shiftMonth,
  summaryMonthLabel,
  summaryRangeDays,
} from "@/lib/expenses/presentation";
import { saveCsv } from "@/lib/files/save-csv";
import { formatCurrency } from "@/lib/format/currency";
import { sedeToday, useSedeTimeZone } from "@/lib/locations/use-sede-time-zone";
import { getActiveLocationId } from "@/lib/locations/location-store";
import { notifyError } from "@/components/errors/notify";
import { AsyncSection, TableSkeleton } from "@/components/shared/async-section";
import { EmptyState } from "@/components/shared/empty-state";
import { toolbarFieldClass } from "@/components/shared/list-toolbar";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { expensesPanelProps, type ExpensesViewTabs } from "./expenses-tabs";
import { useExpenseLocations } from "./use-expense-locations";

export const expensesSummaryCopy = {
  title: "Gastos",
  description:
    "Lo que gasta cada sede: facturas, proveedores, pagos y salidas de caja menor. Por fecha de factura, en su moneda y sin convertir.",
  locationLabel: "Sede",
  locationAll: "Todas las sedes",
  fromLabel: "Desde",
  toLabel: "Hasta",
  export: "Exportar CSV",
  exporting: "Exportando…",
  exportError: "No pudimos exportar el resumen.",
  exported: "Resumen exportado.",
  rangeOrder: "«Desde» no puede ser posterior a «Hasta».",
  rangeLength: `El resumen abarca como máximo ${EXPENSE_SUMMARY_MAX_MONTHS} meses (${EXPENSE_SUMMARY_MAX_DAYS} días). Acorta el periodo.`,
  rangeInvalid: "Elige un mes de inicio y un mes de fin.",
  tableLabel: "Ingresos y gastos por mes, sede y moneda",
  colMonth: "Mes",
  colLocation: "Sede",
  colCurrency: "Moneda",
  colIncome: "Ingresos",
  colExpenses: "Gastos",
  colNet: "Neto",
  breakdownLabel: "Gastos por categoría",
  showBreakdown: (month: string, location: string) =>
    `Ver gastos por categoría de ${month}, ${location}`,
  hideBreakdown: (month: string, location: string) =>
    `Ocultar gastos por categoría de ${month}, ${location}`,
  noExpenses: "Sin gastos en el mes",
  currencyNote: "Cada moneda va por separado: nunca se suman ni se convierten.",
  // Sin «Intenta de nuevo.»: AsyncSection → SectionError trae «Reintentar».
  loadError: "No pudimos cargar el resumen.",
  badRequest: "El periodo no es válido. Revisa «Desde» y «Hasta».",
  forbiddenTitle: "Tu rol no tiene acceso al resumen de gastos.",
  forbiddenHint:
    "Los gastos de la sede son para la administración de la clínica.",
  empty: "No hay movimientos en este periodo",
  emptyHint:
    "No hay ingresos ni gastos en los meses elegidos. Prueba con otro periodo o con otra sede.",
};

const rowKey = (row: ExpenseSummaryRow) =>
  `${row.month}|${row.locationId}|${row.currency}`;

/**
 * «Resumen» (DX-274, solo ADMIN): ingresos contra gastos por mes, sede y
 * moneda. Los gastos van por fecha de factura y los ingresos por el día civil
 * del abono en su sede; cada moneda en su fila, sin totales cruzados. El rango
 * se elige en meses y no pasa de 366 días: lo impide el selector y lo valida
 * la pantalla antes de pedir nada.
 */
export function ExpensesSummaryView({
  token,
  tabs,
}: {
  token: string;
  tabs?: ExpensesViewTabs;
}) {
  const timeZone = useSedeTimeZone(token);
  const today = timeZone ? sedeToday(timeZone) : null;
  const currentMonth = today ? today.slice(0, 7) : null;
  const [activeLocationId] = useState<string | null>(() =>
    getActiveLocationId(),
  );
  const { locations } = useExpenseLocations(token);
  const [fromMonth, setFromMonth] = useState<string | null>(null);
  const [toMonth, setToMonth] = useState<string | null>(null);
  const [locationId, setLocationId] = useState("ALL");
  const [data, setData] = useState<ExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  // Por defecto, los últimos meses hasta el en curso, en la zona de la sede.
  const effectiveTo = toMonth ?? currentMonth;
  const effectiveFrom =
    fromMonth ??
    (currentMonth
      ? shiftMonth(currentMonth, 1 - EXPENSE_SUMMARY_DEFAULT_MONTHS)
      : null);
  const days =
    effectiveFrom && effectiveTo
      ? summaryRangeDays(effectiveFrom, effectiveTo)
      : null;
  let rangeError: string | null = null;
  if (effectiveFrom && effectiveTo) {
    if (!days) rangeError = expensesSummaryCopy.rangeInvalid;
    else if (days.from > days.to) rangeError = expensesSummaryCopy.rangeOrder;
    else if (daysInRange(days.from, days.to) > EXPENSE_SUMMARY_MAX_DAYS)
      rangeError = expensesSummaryCopy.rangeLength;
  }
  const query: ExpenseSummaryQuery | null =
    days && !rangeError
      ? { ...days, ...(locationId !== "ALL" ? { locationId } : {}) }
      : null;
  const queryKey = query ? JSON.stringify(query) : null;

  useEffect(() => {
    if (!token || !queryKey) return;
    const request: ExpenseSummaryQuery = JSON.parse(queryKey);
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getExpenseSummary(token, request);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setForbidden(false);
        setExpanded(new Set());
      } catch (err) {
        if (cancelled) return;
        setData(null);
        setForbidden(err instanceof ApiError && err.status === 403);
        setLoadError(
          apiErrorMessage(err, {
            fallback: expensesSummaryCopy.loadError,
            byStatus: { 400: expensesSummaryCopy.badRequest },
          }),
        );
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, queryKey, reloadKey]);

  async function exportCsv() {
    if (!queryKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const request: ExpenseSummaryQuery = JSON.parse(queryKey);
      const text = await downloadExpenseSummaryCsv(token, request);
      saveCsv(text, expenseSummaryCsvFileName(request.from, request.to), {
        bom: true,
      });
      setNotice(expensesSummaryCopy.exported);
    } catch (err) {
      notifyError(
        apiErrorMessage(err, { fallback: expensesSummaryCopy.exportError }),
        {
          onRetry: () => void exportCsv(),
        },
      );
    } finally {
      setExporting(false);
    }
  }

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  const rows = data?.rows ?? [];
  const showLoading = !rangeError && ((loading && data === null) || !query);
  const activeLocations = locations.filter((l) => l.isActive);
  const showLocationFilter =
    activeLocationId === null && activeLocations.length > 1;
  // Los meses que ofrecen los selectores caben siempre en 366 días.
  const fromMin = effectiveTo
    ? shiftMonth(effectiveTo, 1 - EXPENSE_SUMMARY_MAX_MONTHS)
    : null;
  const toMax = effectiveFrom
    ? shiftMonth(effectiveFrom, EXPENSE_SUMMARY_MAX_MONTHS - 1)
    : null;

  return (
    <>
      <PageHeader
        title={expensesSummaryCopy.title}
        description={expensesSummaryCopy.description}
      />
      {tabs?.nav}
      <div className="flex flex-col gap-3" {...expensesPanelProps(tabs)}>
        {!forbidden ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {showLocationFilter ? (
                <select
                  aria-label={expensesSummaryCopy.locationLabel}
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className={cn(toolbarFieldClass, "sm:w-48")}
                >
                  <option value="ALL">{expensesSummaryCopy.locationAll}</option>
                  {activeLocations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
                <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
                  <span className="shrink-0">
                    {expensesSummaryCopy.fromLabel}
                  </span>
                  <Input
                    type="month"
                    value={effectiveFrom ?? ""}
                    min={fromMin ?? undefined}
                    max={effectiveTo ?? undefined}
                    onChange={(e) =>
                      e.target.value && setFromMonth(e.target.value)
                    }
                    className="min-w-0 tabular-nums sm:w-40"
                  />
                </label>
                <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
                  <span className="shrink-0">
                    {expensesSummaryCopy.toLabel}
                  </span>
                  <Input
                    type="month"
                    value={effectiveTo ?? ""}
                    min={effectiveFrom ?? undefined}
                    max={toMax ?? undefined}
                    onChange={(e) =>
                      e.target.value && setToMonth(e.target.value)
                    }
                    className="min-w-0 tabular-nums sm:w-40"
                  />
                </label>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void exportCsv()}
              disabled={
                exporting ||
                showLoading ||
                Boolean(loadError) ||
                Boolean(rangeError) ||
                rows.length === 0
              }
              className="max-sm:mt-1"
            >
              <Download aria-hidden />
              {exporting
                ? expensesSummaryCopy.exporting
                : expensesSummaryCopy.export}
            </Button>
          </div>
        ) : null}

        <p
          role="status"
          className={notice ? "text-sm text-success" : "sr-only"}
        >
          {notice}
        </p>

        {rangeError ? (
          <p role="alert" className="text-sm text-danger">
            {rangeError}
          </p>
        ) : null}

        {forbidden ? (
          <EmptyState
            role="status"
            icon={<Lock aria-hidden />}
            title={expensesSummaryCopy.forbiddenTitle}
            description={expensesSummaryCopy.forbiddenHint}
          />
        ) : rangeError ? null : (
          <AsyncSection
            loading={showLoading}
            error={loadError}
            onRetry={() => setReloadKey((k) => k + 1)}
            isEmpty={rows.length === 0}
            emptyTitle={expensesSummaryCopy.empty}
            emptyDescription={expensesSummaryCopy.emptyHint}
            skeleton={<TableSkeleton rows={5} />}
          >
            <Card
              aria-busy={loading || undefined}
              className="overflow-hidden p-0"
            >
              <Table aria-label={expensesSummaryCopy.tableLabel}>
                <caption className="sr-only">
                  {expensesSummaryCopy.tableLabel}
                </caption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">
                      {expensesSummaryCopy.colMonth}
                    </TableHead>
                    <TableHead scope="col">
                      {expensesSummaryCopy.colLocation}
                    </TableHead>
                    <TableHead scope="col">
                      {expensesSummaryCopy.colCurrency}
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      {expensesSummaryCopy.colIncome}
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      {expensesSummaryCopy.colExpenses}
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      {expensesSummaryCopy.colNet}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const key = rowKey(row);
                    const open = expanded.has(key);
                    const month = summaryMonthLabel(row.month);
                    const panelId = `summary-breakdown-${key.replace(/[^\w-]/g, "_")}`;
                    return (
                      <Fragment key={key}>
                        <TableRow data-testid="summary-row">
                          <TableCell
                            data-label={expensesSummaryCopy.colMonth}
                            className="font-medium"
                          >
                            {month}
                          </TableCell>
                          <TableCell
                            data-label={expensesSummaryCopy.colLocation}
                          >
                            {row.locationName}
                          </TableCell>
                          <TableCell
                            data-label={expensesSummaryCopy.colCurrency}
                            className="tabular-nums"
                          >
                            {row.currency}
                          </TableCell>
                          <TableCell
                            data-label={expensesSummaryCopy.colIncome}
                            className="text-right tabular-nums"
                          >
                            {formatCurrency(row.income, row.currency)}
                          </TableCell>
                          <TableCell
                            data-label={expensesSummaryCopy.colExpenses}
                            className="text-right tabular-nums"
                          >
                            {row.categories.length > 0 ? (
                              <button
                                type="button"
                                aria-expanded={open}
                                aria-controls={panelId}
                                aria-label={
                                  open
                                    ? expensesSummaryCopy.hideBreakdown(
                                        month,
                                        row.locationName,
                                      )
                                    : expensesSummaryCopy.showBreakdown(
                                        month,
                                        row.locationName,
                                      )
                                }
                                onClick={() => toggle(key)}
                                className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 tabular-nums hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-8"
                              >
                                {open ? (
                                  <ChevronDown aria-hidden className="size-4" />
                                ) : (
                                  <ChevronRight
                                    aria-hidden
                                    className="size-4"
                                  />
                                )}
                                {formatCurrency(
                                  row.expensesTotal,
                                  row.currency,
                                )}
                              </button>
                            ) : (
                              formatCurrency(row.expensesTotal, row.currency)
                            )}
                          </TableCell>
                          <TableCell
                            data-label={expensesSummaryCopy.colNet}
                            className={cn(
                              "text-right font-medium tabular-nums",
                              row.net < 0 && "text-danger",
                            )}
                          >
                            {formatCurrency(row.net, row.currency)}
                          </TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow className="bg-surface-2 hover:bg-surface-2">
                            <TableCell
                              id={panelId}
                              colSpan={6}
                              data-label={expensesSummaryCopy.breakdownLabel}
                            >
                              <ul
                                aria-label={expensesSummaryCopy.breakdownLabel}
                                className="flex flex-col gap-1 text-sm"
                              >
                                {row.categories.map((c) => (
                                  <li
                                    key={c.category}
                                    className="flex justify-between gap-4"
                                  >
                                    <span className="min-w-0 [overflow-wrap:anywhere]">
                                      {c.category}
                                    </span>
                                    <span className="tabular-nums">
                                      {formatCurrency(c.amount, row.currency)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
            <p className="mt-3 text-xs text-muted">
              {expensesSummaryCopy.currencyNote}
            </p>
          </AsyncSection>
        )}
      </div>
    </>
  );
}
