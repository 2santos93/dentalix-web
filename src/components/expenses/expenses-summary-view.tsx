'use client';
import * as React from 'react';
import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  downloadExpenseSummaryCsv,
  getExpenseSummary,
  type ExpenseSummary,
  type ExpenseSummaryQuery,
  type ExpenseSummaryRow,
} from '@/lib/expenses/expenses-api';
import {
  EXPENSE_SUMMARY_DEFAULT_MONTHS,
  EXPENSE_SUMMARY_MAX_DAYS,
  EXPENSE_SUMMARY_MAX_MONTHS,
  daysInRange,
  expenseSummaryCsvFileName,
  shiftMonth,
  summaryMonthLabel,
  summaryRangeDays,
} from '@/lib/expenses/presentation';
import { saveCsv } from '@/lib/files/save-csv';
import { sedeMoney } from '@/lib/format/sede-number';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { useExpenseToday } from './use-expense-today';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { notifyError } from '@/components/errors/notify';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ExpensesScope, expensesCopy } from './expenses-view';
import { InlineError } from '@/components/errors/inline-error';
import { expensesPanelProps, type ExpensesViewTabs } from './expenses-tabs';
import { useExpenseLocations } from './use-expense-locations';

export const expensesSummaryCopy = {
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exportError: 'No pudimos exportar el resumen.',
  exported: 'Resumen exportado.',
  rangeOrder: '«Desde» no puede ser posterior a «Hasta».',
  rangeLength: `El resumen abarca como máximo ${EXPENSE_SUMMARY_MAX_MONTHS} meses (${EXPENSE_SUMMARY_MAX_DAYS} días). Acorta el periodo.`,
  rangeInvalid: 'Elige un mes de inicio y un mes de fin.',
  tableLabel: 'Ingresos y gastos por mes, sede y moneda',
  colMonth: 'Mes',
  colLocation: 'Sede',
  colCurrency: 'Moneda',
  colIncome: 'Ingresos',
  colExpenses: 'Gastos',
  colNet: 'Neto',
  breakdownLabel: 'Gastos por categoría',
  // El nombre accesible empieza por la acción y acaba en el importe visible
  // (WCAG 2.5.3: el nombre contiene el texto del botón).
  showBreakdown: (month: string, location: string, amount: string) =>
    `Ver gastos por categoría de ${month}, ${location}: ${amount}`,
  hideBreakdown: (month: string, location: string, amount: string) =>
    `Ocultar gastos por categoría de ${month}, ${location}: ${amount}`,
  monthPlaceholder: 'Elige un mes',
  noExpenses: 'Sin gastos en el mes',
  currencyNote: 'Cada moneda va por separado: nunca se suman ni se convierten.',
  // Sin «Intenta de nuevo.»: AsyncSection → SectionError trae «Reintentar».
  loadError: 'No pudimos cargar el resumen.',
  zoneError: 'No pudimos obtener la zona horaria de la sede. Reintenta o elige un rango de meses.',
  badRequest: 'El periodo no es válido. Revisa «Desde» y «Hasta».',
  forbiddenTitle: 'Tu rol no tiene acceso al resumen de gastos.',
  forbiddenHint: 'Los gastos de la sede son para la administración de la clínica.',
  empty: 'No hay movimientos en este periodo',
  emptyHint: 'No hay ingresos ni gastos en los meses elegidos. Prueba con otro periodo o con otra sede en el selector de sede.',
};

const rowKey = (row: ExpenseSummaryRow) => `${row.month}|${row.locationId}|${row.currency}`;

/**
 * «Resumen» (DX-274, solo ADMIN): ingresos contra gastos por mes, sede y
 * moneda. Los gastos van por fecha de factura y los ingresos por el día civil
 * del abono en su sede; cada moneda en su fila, sin totales cruzados. El rango
 * se elige en meses y no pasa de 366 días: lo valida la pantalla antes de
 * pedir nada. La sede la decide el selector global (como en «Gastos»): con
 * «Todas las sedes» cada sede sale en su fila.
 */
export function ExpensesSummaryView({ token, tabs }: { token: string; tabs?: ExpensesViewTabs }) {
  const [activeLocationId] = useState<string | null>(() => getActiveLocationId());
  const { locations, failed: locationsFailed, reload: reloadLocations } = useExpenseLocations(token);
  // DX-378 (FE-078): importes con el formato de la sede, no con «es».
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const reference = activeLocationId ? locations.find((location) => location.id === activeLocationId) : locations[0];
  const { today, error: scheduleError, retry: retrySchedule } = useExpenseToday(token, reference?.id);
  const currentMonth = today?.slice(0, 7) ?? null;
  const [fromMonth, setFromMonth] = useState<string | null>(null);
  const [toMonth, setToMonth] = useState<string | null>(null);
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
    fromMonth ?? (currentMonth ? shiftMonth(currentMonth, 1 - EXPENSE_SUMMARY_DEFAULT_MONTHS) : null);
  const days = effectiveFrom && effectiveTo ? summaryRangeDays(effectiveFrom, effectiveTo) : null;
  let rangeError: string | null = null;
  if (effectiveFrom && effectiveTo) {
    if (!days) rangeError = expensesSummaryCopy.rangeInvalid;
    else if (days.from > days.to) rangeError = expensesSummaryCopy.rangeOrder;
    else if (daysInRange(days.from, days.to) > EXPENSE_SUMMARY_MAX_DAYS) rangeError = expensesSummaryCopy.rangeLength;
  }
  const query: ExpenseSummaryQuery | null =
    days && !rangeError ? { ...days } : null;
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
      notifyError(apiErrorMessage(err, { fallback: expensesSummaryCopy.exportError }), {
        onRetry: () => void exportCsv(),
      });
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
  const zoneError = !query && (locationsFailed || scheduleError) ? expensesSummaryCopy.zoneError : null;
  const showLoading = !rangeError && !zoneError && ((loading && data === null) || !query);
  function retry() {
    if (zoneError) {
      retrySchedule();
      reloadLocations();
    } else setReloadKey((key) => key + 1);
  }
  // Los meses que ofrecen los selectores: de la sede si ya se sabe; si no, del
  // reloj del navegador, solo para poder elegir un rango a mano (no se pide nada
  // hasta que la persona lo elige).
  const monthOptions = summaryMonthOptions(currentMonth ?? browserMonth(), [effectiveFrom, effectiveTo]);

  return (
    <>
      <PageHeader
        title={expensesCopy.title}
        description={expensesCopy.description}
        meta={
          <ExpensesScope
            locationName={activeLocationId ? (locations.find((l) => l.id === activeLocationId)?.name ?? null) : null}
          />
        }
      />
      {tabs?.nav}
      <div className="flex flex-col gap-3" {...expensesPanelProps(tabs)}>
        {!forbidden ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
              <MonthSelect
                label={expensesSummaryCopy.fromLabel}
                value={effectiveFrom}
                options={monthOptions}
                onCommit={setFromMonth}
              />
              <MonthSelect
                label={expensesSummaryCopy.toLabel}
                value={effectiveTo}
                options={monthOptions}
                onCommit={setToMonth}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void exportCsv()}
              disabled={exporting || !query || showLoading || Boolean(loadError) || Boolean(rangeError) || rows.length === 0}
              className="max-sm:mt-1"
            >
              <Download aria-hidden />
              {exporting ? expensesSummaryCopy.exporting : expensesSummaryCopy.export}
            </Button>
          </div>
        ) : null}

        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
          {notice}
        </p>

        {rangeError ? (
          <InlineError>{rangeError}</InlineError>
        ) : null}

        {forbidden ? (
          <EmptyState
            role="status"
            icon={<Lock aria-hidden />}
            title={expensesSummaryCopy.forbiddenTitle}
            description={expensesSummaryCopy.forbiddenHint}
          />
        ) : rangeError ? null : (
          <>
          {sedeFormat.status === 'error' ? (
            <SedeConfigError
              kind="locale"
              variant="note"
              description={sedeFormat.message}
              onRetry={sedeFormat.retry}
              locationId={sedeFormat.locationId}
            />
          ) : null}
          <AsyncSection
            loading={showLoading}
            error={zoneError ?? loadError}
            onRetry={retry}
            isEmpty={rows.length === 0}
            emptyTitle={expensesSummaryCopy.empty}
            emptyDescription={expensesSummaryCopy.emptyHint}
            skeleton={<TableSkeleton rows={5} />}
          >
            <Card aria-busy={loading || undefined} className="overflow-hidden p-0">
              {/* Tabla de comparación (se lee por columnas): en el teléfono no se
                  apila, se desplaza de lado con el mes fijo. */}
              <Table aria-label={expensesSummaryCopy.tableLabel} stack={false}>
                <caption className="sr-only">{expensesSummaryCopy.tableLabel}</caption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col" className={STICKY_FIRST}>
                      {expensesSummaryCopy.colMonth}
                    </TableHead>
                    <TableHead scope="col">{expensesSummaryCopy.colLocation}</TableHead>
                    <TableHead scope="col">{expensesSummaryCopy.colCurrency}</TableHead>
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
                    const expenses = sedeMoney(row.expensesTotal, row.currency, fmt);
                    const panelId = `summary-breakdown-${key.replace(/[^\w-]/g, '_')}`;
                    return (
                      <Fragment key={key}>
                        <TableRow data-testid="summary-row">
                          <TableCell className={cn('font-medium', STICKY_FIRST)}>
                            {month}
                          </TableCell>
                          <TableCell>{row.locationName}</TableCell>
                          <TableCell className="tabular-nums">
                            {row.currency}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {sedeMoney(row.income, row.currency, fmt)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.categories.length > 0 ? (
                              <button
                                type="button"
                                aria-expanded={open}
                                aria-controls={panelId}
                                aria-label={
                                  open
                                    ? expensesSummaryCopy.hideBreakdown(month, row.locationName, expenses)
                                    : expensesSummaryCopy.showBreakdown(month, row.locationName, expenses)
                                }
                                onClick={() => toggle(key)}
                                className="inline-flex min-h-11 items-center gap-1 rounded-md px-1 tabular-nums hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-8"
                              >
                                {open ? (
                                  <ChevronDown aria-hidden className="size-4" />
                                ) : (
                                  <ChevronRight aria-hidden className="size-4" />
                                )}
                                {expenses}
                              </button>
                            ) : (
                              expenses
                            )}
                          </TableCell>
                          <TableCell
                           
                            className={cn('text-right font-medium tabular-nums', row.net < 0 && 'text-danger-text')}
                          >
                            {sedeMoney(row.net, row.currency, fmt)}
                          </TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow className="bg-surface-sunken hover:bg-surface-sunken">
                            <TableCell id={panelId} colSpan={6}>
                              <ul
                                aria-label={expensesSummaryCopy.breakdownLabel}
                                className="flex flex-col gap-1 text-sm"
                              >
                                {row.categories.map((c) => (
                                  <li key={c.category} className="flex justify-between gap-4">
                                    <span className="min-w-0 [overflow-wrap:anywhere]">{c.category}</span>
                                    <span className="tabular-nums">{sedeMoney(c.amount, row.currency, fmt)}</span>
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
            <p className="mt-3 text-xs text-muted">{expensesSummaryCopy.currencyNote}</p>
          </AsyncSection>
          </>
        )}
      </div>
    </>
  );
}

/** La primera columna fija al desplazar la tabla de lado en el teléfono. */
const STICKY_FIRST = 'max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:bg-surface';

/** Meses que se ofrecen hacia atrás desde el en curso (cinco años). */
const MONTHS_BACK = 59;

function browserMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Los meses del selector, del más reciente al más antiguo: el siguiente al en
 * curso (una sede adelantada ya puede estar en él), el en curso y los cinco
 * años anteriores, más los ya elegidos si quedan fuera.
 */
function summaryMonthOptions(anchor: string, chosen: readonly (string | null)[]): string[] {
  const months = new Set<string>();
  for (let delta = 1; delta >= -MONTHS_BACK; delta -= 1) {
    const month = shiftMonth(anchor, delta);
    if (month) months.add(month);
  }
  for (const month of chosen) if (month) months.add(month);
  return [...months].sort().reverse();
}

interface MonthSelectProps {
  label: string;
  value: string | null;
  options: readonly string[];
  onCommit: (month: string) => void;
}

/**
 * Selector de mes con los nombres en el idioma del producto («Octubre de
 * 2026»): el `<input type="month">` del navegador pinta el mes en SU idioma y en
 * Safari de escritorio ni siquiera es un selector.
 */
function MonthSelect({ label, value, options, onCommit }: MonthSelectProps) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm text-muted sm:flex-row sm:items-center sm:gap-2">
      <span className="t-label shrink-0 text-muted">{label}</span>
      <NativeSelect
        value={value ?? ''}
        onChange={(e) => {
          if (e.target.value) onCommit(e.target.value);
        }}
        className="min-w-0 sm:w-48"
      >
        {value ? null : <option value="">{expensesSummaryCopy.monthPlaceholder}</option>}
        {options.map((month) => (
          <option key={month} value={month}>
            {summaryMonthLabel(month)}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
