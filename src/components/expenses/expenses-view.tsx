'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Building2, Download, Lock, Plus } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { getTokenRole } from '@/lib/auth/token-role';
import {
  canManageExpenses,
  downloadExpensesCsv,
  listExpenses,
  type Expense,
  type ExpenseFilters,
  type ExpensePage,
  type ExpenseStatusFilter,
} from '@/lib/expenses/expenses-api';
import { EXPENSE_STATUS_FILTERS, expensesCsvFileName, firstOfMonth } from '@/lib/expenses/presentation';
import { saveCsv } from '@/lib/files/save-csv';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate } from '@/lib/format/date';
import { getActiveLocationId } from '@/lib/locations/location-store';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { notifyError } from '@/components/errors/notify';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ListToolbar, ResultCount, toolbarFieldClass } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ExpenseCategoriesModal } from './expense-categories-modal';
import { ExpenseDetailModal } from './expense-detail-modal';
import { ExpenseFormModal } from './expense-form-modal';
import { ExpenseStatusBadges } from './expense-status-badges';
import { useExpenseCategories } from './use-expense-categories';

export const expensesCopy = {
  title: 'Gastos',
  description:
    'Lo que gasta cada sede: facturas, proveedores, pagos y salidas de caja menor. Por fecha de factura, en su moneda y sin convertir.',
  scopeAll: 'Toda la clínica',
  scopeLocation: (name: string) => `Gastos de ${name}`,
  searchLabel: 'Buscar por proveedor o descripción',
  searchPlaceholder: 'Proveedor o descripción',
  locationLabel: 'Sede',
  locationAll: 'Todas las sedes',
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  categoryLabel: 'Categoría',
  categoryAll: 'Todas las categorías',
  statusLabel: 'Estado',
  overdueLabel: 'Vencidos',
  create: 'Nuevo gasto',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exportError: 'No pudimos exportar los gastos.',
  exported: 'Gastos exportados.',
  countNoun: 'gasto',
  countNounPlural: 'gastos',
  tableLabel: 'Gastos del periodo, del más reciente al más antiguo',
  listLabel: 'Gastos',
  colDate: 'Fecha',
  colCategory: 'Categoría',
  colSupplier: 'Proveedor',
  colLocation: 'Sede',
  colAmount: 'Importe',
  colPaid: 'Pagado',
  colStatus: 'Estado',
  noSupplier: '—',
  open: (category: string, day: string) => `Ver el gasto de ${category} del ${day}`,
  // Sin «Intenta de nuevo.»: AsyncSection → SectionError trae «Reintentar».
  loadError: 'No pudimos cargar los gastos.',
  badRequest: 'Algún filtro no es válido: «Desde» no puede ser posterior a «Hasta».',
  forbiddenTitle: 'Tu rol no tiene acceso a los gastos.',
  forbiddenHint: 'Los gastos de la sede son para la administración de la clínica.',
  empty: 'No hay gastos en este periodo',
  emptyHint: 'Registra el primero con «Nuevo gasto», o prueba con otras fechas y filtros.',
};

const SEARCH_DEBOUNCE_MS = 300;

/**
 * «Gastos» (DX-274, solo ADMIN): la lista de gastos de la sede activa (o de la
 * elegida, en «Todas las sedes») por fecha de factura, con el mes en curso por
 * defecto. Filtros en la barra con «Nuevo gasto» a la derecha; en escritorio
 * una tabla y bajo `sm` una tarjeta por gasto. Cada gasto abre su detalle.
 */
export function ExpensesView({ token }: { token: string }) {
  const isAdmin = canManageExpenses(getTokenRole(token));
  const timeZone = useSedeTimeZone(token);
  const today = timeZone ? sedeToday(timeZone) : null;
  const requestLocations = useSessionLocations(token);
  const [activeLocationId] = useState<string | null>(() => getActiveLocationId());
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [locationId, setLocationId] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [status, setStatus] = useState<ExpenseStatusFilter | 'ALL'>('ALL');
  const [overdue, setOverdue] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ExpensePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categories = useExpenseCategories(token, isAdmin);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    requestLocations()
      .then((all) => {
        if (!cancelled) setLocations(all.filter((l) => l.isActive));
      })
      .catch(() => {
        /* sin sedes: sin filtro de sede ni nombre de sede en las filas */
      });
    return () => {
      cancelled = true;
    };
  }, [token, requestLocations]);

  // La búsqueda se aplica al dejar de teclear.
  useEffect(() => {
    const next = searchText.trim();
    if (next === search) return;
    const timer = setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, search]);

  // Por defecto, el mes en curso hasta hoy, en la zona de la sede.
  const effectiveFrom = from ?? (today ? firstOfMonth(today) : null);
  const effectiveTo = to ?? today;
  const filters: ExpenseFilters | null =
    effectiveFrom && effectiveTo
      ? {
          from: effectiveFrom,
          to: effectiveTo,
          ...(locationId !== 'ALL' ? { locationId } : {}),
          ...(category !== 'ALL' ? { category } : {}),
          ...(status !== 'ALL' ? { status } : {}),
          ...(overdue ? { overdue: true } : {}),
          ...(search ? { query: search } : {}),
        }
      : null;
  const filterKey = filters ? JSON.stringify(filters) : null;

  useEffect(() => {
    if (!token || !filterKey) return;
    const query: ExpenseFilters = JSON.parse(filterKey);
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await listExpenses(token, { ...query, page });
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
          apiErrorMessage(err, { fallback: expensesCopy.loadError, byStatus: { 400: expensesCopy.badRequest } }),
        );
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, page, reloadKey]);

  async function exportCsv() {
    if (!filterKey) return;
    setExporting(true);
    setNotice(null);
    try {
      const query = JSON.parse(filterKey) as ExpenseFilters;
      const text = await downloadExpensesCsv(token, query);
      saveCsv(text, expensesCsvFileName(query.from, query.to), { bom: true });
      setNotice(expensesCopy.exported);
    } catch (err) {
      notifyError(apiErrorMessage(err, { fallback: expensesCopy.exportError }), {
        onRetry: () => void exportCsv(),
      });
    } finally {
      setExporting(false);
    }
  }

  function openCreate() {
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  function changed(message: string) {
    setNotice(message);
    setReloadKey((k) => k + 1);
  }

  function resetPage<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value);
      setPage(1);
    };
  }

  const items = data?.items ?? [];
  const showLoading = loading || !filters;
  const activeLocation = locations.find((l) => l.id === activeLocationId) ?? null;
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? '—';
  const showLocationFilter = activeLocationId === null && locations.length > 1;

  return (
    <>
      <PageHeader
        title={expensesCopy.title}
        description={expensesCopy.description}
        meta={
          <p className="mt-3 inline-flex max-w-[68ch] items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-muted">
            <Building2 aria-hidden className="size-4 shrink-0 text-muted/80" />
            <span>{activeLocation ? expensesCopy.scopeLocation(activeLocation.name) : expensesCopy.scopeAll}</span>
          </p>
        }
      />

      <div className="flex flex-col gap-3">
        {!forbidden ? (
          <ListToolbar
            searchLabel={expensesCopy.searchLabel}
            searchPlaceholder={expensesCopy.searchPlaceholder}
            value={searchText}
            onChange={setSearchText}
            action={
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void exportCsv()}
                  disabled={exporting || showLoading || Boolean(loadError)}
                >
                  <Download aria-hidden />
                  {exporting ? expensesCopy.exporting : expensesCopy.export}
                </Button>
                <Button type="button" onClick={openCreate} className="max-sm:mt-2">
                  <Plus aria-hidden />
                  {expensesCopy.create}
                </Button>
              </>
            }
          >
            {showLocationFilter ? (
              <select
                aria-label={expensesCopy.locationLabel}
                value={locationId}
                onChange={(e) => resetPage(setLocationId)(e.target.value)}
                className={cn(toolbarFieldClass, 'sm:w-48')}
              >
                <option value="ALL">{expensesCopy.locationAll}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
              <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
                <span className="shrink-0">{expensesCopy.fromLabel}</span>
                <Input
                  type="date"
                  value={effectiveFrom ?? ''}
                  max={effectiveTo ?? undefined}
                  onChange={(e) => e.target.value && resetPage(setFrom)(e.target.value)}
                  className="min-w-0 tabular-nums sm:w-40"
                />
              </label>
              <label className="flex min-w-0 items-center gap-2 text-sm text-muted">
                <span className="shrink-0">{expensesCopy.toLabel}</span>
                <Input
                  type="date"
                  value={effectiveTo ?? ''}
                  min={effectiveFrom ?? undefined}
                  onChange={(e) => e.target.value && resetPage(setTo)(e.target.value)}
                  className="min-w-0 tabular-nums sm:w-40"
                />
              </label>
            </div>
            <select
              aria-label={expensesCopy.categoryLabel}
              value={category}
              onChange={(e) => resetPage(setCategory)(e.target.value)}
              className={cn(toolbarFieldClass, 'sm:w-52')}
            >
              <option value="ALL">{expensesCopy.categoryAll}</option>
              {(categories.categories ?? []).map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label={expensesCopy.statusLabel}
              value={status}
              onChange={(e) => resetPage(setStatus)(e.target.value as ExpenseStatusFilter | 'ALL')}
              className={cn(toolbarFieldClass, 'sm:w-44')}
            >
              {EXPENSE_STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink sm:min-h-10">
              <input
                type="checkbox"
                checked={overdue}
                onChange={(e) => resetPage(setOverdue)(e.target.checked)}
                className="size-4 shrink-0 accent-[var(--color-primary)]"
              />
              {expensesCopy.overdueLabel}
            </label>
          </ListToolbar>
        ) : null}

        <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
          {notice}
        </p>

        {forbidden ? (
          <EmptyState
            role="status"
            icon={<Lock aria-hidden />}
            title={expensesCopy.forbiddenTitle}
            description={expensesCopy.forbiddenHint}
          />
        ) : (
          <>
            {!showLoading && !loadError && data ? (
              <ResultCount total={data.total} noun={expensesCopy.countNoun} nounPlural={expensesCopy.countNounPlural} />
            ) : null}

            <AsyncSection
              loading={showLoading}
              error={loadError}
              onRetry={() => setReloadKey((k) => k + 1)}
              isEmpty={items.length === 0}
              emptyTitle={expensesCopy.empty}
              emptyDescription={expensesCopy.emptyHint}
              skeleton={<TableSkeleton rows={5} />}
            >
              {/* Escritorio: una tabla. */}
              <Card className="overflow-hidden p-0 max-md:hidden">
                <Table aria-label={expensesCopy.tableLabel}>
                  <caption className="sr-only">{expensesCopy.tableLabel}</caption>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead scope="col">{expensesCopy.colDate}</TableHead>
                      <TableHead scope="col">{expensesCopy.colCategory}</TableHead>
                      <TableHead scope="col">{expensesCopy.colSupplier}</TableHead>
                      <TableHead scope="col">{expensesCopy.colLocation}</TableHead>
                      <TableHead scope="col" className="text-right">
                        {expensesCopy.colAmount}
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        {expensesCopy.colPaid}
                      </TableHead>
                      <TableHead scope="col">{expensesCopy.colStatus}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((expense) => (
                      <TableRow key={expense.id} data-testid="expense-row">
                        <TableCell className="tabular-nums">{formatCivilDate(expense.invoiceDate)}</TableCell>
                        <TableCell>
                          <OpenExpenseButton expense={expense} onOpen={setDetailId} />
                          {expense.description ? (
                            <span className="block max-w-[28ch] truncate text-xs text-muted">{expense.description}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="[overflow-wrap:anywhere]">
                          {expense.supplier ?? expensesCopy.noSupplier}
                        </TableCell>
                        <TableCell>{locationName(expense.locationId)}</TableCell>
                        <TableCell
                          className={cn('text-right tabular-nums', expense.status === 'VOIDED' && 'text-muted line-through')}
                        >
                          {formatCurrency(expense.amount, expense.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(expense.paidAmount, expense.currency)}
                        </TableCell>
                        <TableCell>
                          <ExpenseStatusBadges expense={expense} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {/* Móvil y tablet estrecha: una tarjeta por gasto, sin scroll lateral. */}
              <ul aria-label={expensesCopy.listLabel} className="flex flex-col gap-3 md:hidden">
                {items.map((expense) => (
                  <li key={expense.id}>
                    <ExpenseCard expense={expense} locationName={locationName(expense.locationId)} onOpen={setDetailId} />
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
                disabled={loading}
              />
            ) : null}
          </>
        )}
      </div>

      <ExpenseFormModal
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        token={token}
        locations={locations}
        defaultLocationId={activeLocationId}
        categories={categories}
        onManageCategories={() => setCategoriesOpen(true)}
        onSaved={(_, message) => changed(message)}
      />
      {detailId ? (
        <ExpenseDetailModal
          key={detailId}
          open
          onOpenChange={(open) => {
            if (!open) setDetailId(null);
          }}
          token={token}
          expenseId={detailId}
          locations={locations}
          categories={categories}
          onManageCategories={() => setCategoriesOpen(true)}
          onChanged={changed}
        />
      ) : null}
      <ExpenseCategoriesModal
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        token={token}
        categories={categories}
      />
    </>
  );
}

function OpenExpenseButton({ expense, onOpen }: { expense: Expense; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(expense.id)}
      aria-label={expensesCopy.open(expense.category, formatCivilDate(expense.invoiceDate))}
      className="text-left font-medium text-ink underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {expense.category}
    </button>
  );
}

function ExpenseCard({
  expense,
  locationName,
  onOpen,
}: {
  expense: Expense;
  locationName: string;
  onOpen: (id: string) => void;
}) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <OpenExpenseButton expense={expense} onOpen={onOpen} />
          <span className="text-xs text-muted [overflow-wrap:anywhere]">
            {[expense.supplier, locationName].filter(Boolean).join(' · ')}
          </span>
        </div>
        <span
          className={cn(
            'shrink-0 text-right font-medium tabular-nums text-ink',
            expense.status === 'VOIDED' && 'text-muted line-through',
          )}
        >
          {formatCurrency(expense.amount, expense.currency)}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted tabular-nums">
        <span>
          {formatCivilDate(expense.invoiceDate)} · {expensesCopy.colPaid}{' '}
          {formatCurrency(expense.paidAmount, expense.currency)}
        </span>
        <ExpenseStatusBadges expense={expense} />
      </div>
    </Card>
  );
}
