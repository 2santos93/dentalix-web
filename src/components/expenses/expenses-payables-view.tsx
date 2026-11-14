'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Download, Lock } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  downloadExpensePayablesCsv,
  getExpensePayables,
  type ExpensePayables,
  type PayableCurrencyTotal,
  type PayableSupplierRow,
} from '@/lib/expenses/expenses-api';
import { saveCsv } from '@/lib/files/save-csv';
import { sedeMoney } from '@/lib/format/sede-number';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { notifyError } from '@/components/errors/notify';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { ExpenseSupplierDialog } from './expense-supplier-dialog';
import { ExpensesScope, expensesCopy } from './expenses-view';
import { expensesPanelProps, type ExpensesViewTabs } from './expenses-tabs';
import { useExpenseLocations } from './use-expense-locations';

const ALL_CURRENCIES = 'ALL';

export const NO_SUPPLIER_LABEL = 'Sin proveedor';

export const expensesPayablesCopy = {
  currencyLabel: 'Moneda',
  currencyAll: 'Todas las monedas',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exportError: 'No pudimos exportar las cuentas por pagar.',
  exported: 'Cuentas por pagar exportadas.',
  csvFileName: 'cuentas-por-pagar.csv',
  tableLabel: 'Cuentas por pagar por proveedor y moneda, lo más urgente primero',
  colSupplier: 'Proveedor',
  colCurrency: 'Moneda',
  colPending: 'Pendiente',
  colOverdue: 'Vencido',
  colDue7: 'Vence en 7 días',
  colDue30: 'Vence en 30 días',
  openCount: (n: number) => (n === 1 ? '1 gasto por pagar' : `${n} gastos por pagar`),
  overdueShort: (amount: string) => `Vencido ${amount}`,
  due7Short: (amount: string) => `7 días ${amount}`,
  due30Short: (amount: string) => `30 días ${amount}`,
  totalsLabel: 'Totales por moneda',
  totalsOf: (currency: string) => `Total ${currency}`,
  totalsLine: (pending: string, overdue: string, due7: string, due30: string) =>
    `Pendiente ${pending} · Vencido ${overdue} · En 7 días ${due7} · En 30 días ${due30}`,
  bucketsNote:
    'Vencido: con vencimiento anterior a hoy en la sede del gasto. «7 días» y «30 días» cuentan desde hoy, hoy incluido; los gastos sin vencimiento solo suman al pendiente. Cada moneda va por separado.',
  // Sin «Intenta de nuevo.»: AsyncSection → SectionError trae «Reintentar».
  loadError: 'No pudimos cargar las cuentas por pagar.',
  forbiddenTitle: 'Tu rol no tiene acceso a las cuentas por pagar.',
  forbiddenHint: 'Los gastos de la sede son para la administración de la clínica.',
  empty: 'No hay cuentas por pagar',
  emptyHint: 'Todos los gastos están pagados. Los pendientes o pagados a medias aparecen aquí, agrupados por proveedor.',
  emptyCurrency: (currency: string) => `No hay cuentas por pagar en ${currency}`,
  emptyCurrencyHint: 'Prueba con otra moneda o con «Todas las monedas».',
};

const rowKey = (row: Pick<PayableSupplierRow, 'supplierKey' | 'currency'>) => `${row.currency}|${row.supplierKey}`;

/**
 * «Por proveedor» (DX-411, solo ADMIN): lo que se debe a cada proveedor en
 * cada moneda, con lo vencido y lo que vence en 7 y 30 días (el «hoy» es el
 * de la sede de cada gasto, lo calcula la API). La sede la decide el selector
 * global, como en «Gastos»; la moneda se elige aquí y acota también el CSV.
 * Cada fila abre el proveedor con sus gastos abiertos y su «Registrar pago».
 */
export function ExpensesPayablesView({ token, tabs }: { token: string; tabs?: ExpensesViewTabs }) {
  const [activeLocationId] = useState<string | null>(() => getActiveLocationId());
  const { locations } = useExpenseLocations(token);
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const [data, setData] = useState<ExpensePayables | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [currency, setCurrency] = useState(ALL_CURRENCIES);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<PayableSupplierRow | null>(null);
  const exportRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Todas las monedas de una vez: el selector ofrece las que hay y filtra en
  // la pantalla; el CSV pide la elegida a la API.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getExpensePayables(token);
        if (cancelled) return;
        setData(res);
        setLoadError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setData(null);
        setForbidden(err instanceof ApiError && err.status === 403);
        setLoadError(apiErrorMessage(err, { fallback: expensesPayablesCopy.loadError }));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const currencies = (data?.totals ?? []).map((t) => t.currency);
  // Una moneda elegida que ya no tiene deudas (se pagó todo) sigue en el selector.
  if (currency !== ALL_CURRENCIES && !currencies.includes(currency)) currencies.push(currency);
  const matches = (c: string) => currency === ALL_CURRENCIES || c === currency;
  const rows = (data?.rows ?? []).filter((r) => matches(r.currency));
  const totals = (data?.totals ?? []).filter((t) => matches(t.currency));
  const money = (amount: number, code: string) => sedeMoney(amount, code, fmt);

  async function exportCsv() {
    setExporting(true);
    setNotice(null);
    try {
      const text = await downloadExpensePayablesCsv(token, currency === ALL_CURRENCIES ? {} : { currency });
      saveCsv(text, expensesPayablesCopy.csvFileName, { bom: true });
      setNotice(expensesPayablesCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: expensesPayablesCopy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  function openSupplier(row: PayableSupplierRow) {
    const trigger = document.activeElement;
    triggerRef.current = trigger instanceof HTMLElement && trigger !== document.body ? trigger : null;
    setSelected(row);
  }

  function focusAfterSupplier(event: Event) {
    // La fila que lo abrió puede haber salido de la lista (se pagó todo).
    if (triggerRef.current?.isConnected) return;
    event.preventDefault();
    exportRef.current?.focus();
  }

  const supplierName = (row: Pick<PayableSupplierRow, 'supplier'>) => row.supplier ?? NO_SUPPLIER_LABEL;
  const columns: DataListColumn<PayableSupplierRow>[] = [
    {
      id: 'supplier',
      header: expensesPayablesCopy.colSupplier,
      mobile: 'primary',
      cell: (row) => (
        <span className="flex flex-col">
          <span className={cn('[overflow-wrap:anywhere]', row.supplier === null && 'italic')}>{supplierName(row)}</span>
          <span className="text-xs font-normal text-muted">{expensesPayablesCopy.openCount(row.openCount)}</span>
        </span>
      ),
      mobileCell: (row) => supplierName(row),
    },
    {
      id: 'currency',
      header: expensesPayablesCopy.colCurrency,
      // El código ya va en cada importe de la tarjeta.
      mobile: 'hidden',
      cell: (row) => <span className="tabular-nums">{row.currency}</span>,
    },
    {
      id: 'pending',
      header: expensesPayablesCopy.colPending,
      numeric: true,
      mobile: 'trailing',
      cell: (row) => <span className="font-medium">{money(row.pending, row.currency)}</span>,
    },
    {
      id: 'overdue',
      header: expensesPayablesCopy.colOverdue,
      numeric: true,
      cell: (row) => (
        <span className={cn(row.overdue > 0 ? 'font-medium text-danger-text' : 'text-muted')}>
          {money(row.overdue, row.currency)}
        </span>
      ),
      mobileCell: (row) =>
        row.overdue > 0 ? expensesPayablesCopy.overdueShort(money(row.overdue, row.currency)) : null,
    },
    {
      id: 'due7',
      header: expensesPayablesCopy.colDue7,
      numeric: true,
      cell: (row) => (
        <span className={cn(row.dueIn7Days === 0 && 'text-muted')}>{money(row.dueIn7Days, row.currency)}</span>
      ),
      mobileCell: (row) =>
        row.dueIn7Days > 0 ? expensesPayablesCopy.due7Short(money(row.dueIn7Days, row.currency)) : null,
    },
    {
      id: 'due30',
      header: expensesPayablesCopy.colDue30,
      numeric: true,
      showFrom: 'md',
      cell: (row) => (
        <span className={cn(row.dueIn30Days === 0 && 'text-muted')}>{money(row.dueIn30Days, row.currency)}</span>
      ),
      mobileCell: (row) =>
        row.dueIn30Days > 0 ? expensesPayablesCopy.due30Short(money(row.dueIn30Days, row.currency)) : null,
    },
  ];

  const filteredEmpty = currency !== ALL_CURRENCIES && (data?.rows.length ?? 0) > 0;
  const activeLocation = locations.find((l) => l.id === activeLocationId) ?? null;

  return (
    <>
      <PageHeader
        title={expensesCopy.title}
        description={expensesCopy.description}
        meta={<ExpensesScope locationName={activeLocation?.name ?? null} />}
      />
      {tabs?.nav}
      <div className="flex flex-col gap-3" {...expensesPanelProps(tabs)}>
        {!forbidden ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <label className="flex min-w-0 flex-col gap-1.5 text-sm sm:flex-row sm:items-center sm:gap-2">
              <span className="t-label shrink-0 text-muted">{expensesPayablesCopy.currencyLabel}</span>
              <NativeSelect
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="min-w-0 sm:w-48"
              >
                <option value={ALL_CURRENCIES}>{expensesPayablesCopy.currencyAll}</option>
                {currencies.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button
              ref={exportRef}
              type="button"
              variant="secondary"
              onClick={() => void exportCsv()}
              disabled={exporting || loading || Boolean(loadError) || rows.length === 0}
            >
              <Download aria-hidden />
              {exporting ? expensesPayablesCopy.exporting : expensesPayablesCopy.export}
            </Button>
          </div>
        ) : null}

        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
          {notice}
        </p>

        {forbidden ? (
          <EmptyState
            role="status"
            icon={<Lock aria-hidden />}
            title={expensesPayablesCopy.forbiddenTitle}
            description={expensesPayablesCopy.forbiddenHint}
          />
        ) : (
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
              loading={loading && data === null}
              error={loadError}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={rows.length === 0}
              emptyTitle={filteredEmpty ? expensesPayablesCopy.emptyCurrency(currency) : expensesPayablesCopy.empty}
              emptyDescription={filteredEmpty ? expensesPayablesCopy.emptyCurrencyHint : expensesPayablesCopy.emptyHint}
              skeleton={<TableSkeleton rows={5} />}
            >
              <div aria-busy={loading || undefined} className="flex flex-col gap-3">
                <DataList
                  label={expensesPayablesCopy.tableLabel}
                  rows={rows}
                  columns={columns}
                  getRowKey={rowKey}
                  onRowClick={openSupplier}
                />
                <PayableTotals totals={totals} money={money} />
                <p className="text-xs text-muted">{expensesPayablesCopy.bucketsNote}</p>
              </div>
            </AsyncSection>
          </>
        )}
      </div>

      {selected ? (
        <ExpenseSupplierDialog
          key={rowKey(selected)}
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          onCloseAutoFocus={focusAfterSupplier}
          token={token}
          supplierKey={selected.supplierKey}
          supplierName={supplierName(selected)}
          currency={selected.currency}
          showLocation={activeLocationId === null}
          locations={locations}
          onChanged={(message) => {
            setNotice(message);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
    </>
  );
}

/** Una línea por moneda: nunca se suman monedas distintas. */
function PayableTotals({
  totals,
  money,
}: {
  totals: readonly PayableCurrencyTotal[];
  money: (amount: number, currency: string) => string;
}) {
  if (totals.length === 0) return null;
  return (
    <dl aria-label={expensesPayablesCopy.totalsLabel} className="flex flex-col gap-1 text-sm">
      {totals.map((t) => (
        <div key={t.currency} className="flex flex-col gap-x-2 sm:flex-row" data-testid="payables-total">
          <dt className="font-medium text-ink">{expensesPayablesCopy.totalsOf(t.currency)}</dt>
          <dd className="tabular-nums text-muted">
            {expensesPayablesCopy.totalsLine(
              money(t.pending, t.currency),
              money(t.overdue, t.currency),
              money(t.dueIn7Days, t.currency),
              money(t.dueIn30Days, t.currency),
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
