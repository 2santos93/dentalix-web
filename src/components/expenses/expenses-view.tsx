'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
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
import { EXPENSE_STATUS_FILTERS, expensesCsvFileName } from '@/lib/expenses/presentation';
import { saveCsv } from '@/lib/files/save-csv';
import { sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { firstOfMonth } from '@/lib/format/date';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { expenseZoneError, useExpenseToday } from './use-expense-today';
import { FieldError } from '@/components/errors/field-error';
import { notifyError } from '@/components/errors/notify';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { EmptyState } from '@/components/shared/empty-state';
import { ListToolbar, ResultCount } from '@/components/shared/list-toolbar';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { Button } from '@/components/ui/button';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { DateRangePicker } from '@/components/ui/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { ExpenseCategoriesModal } from './expense-categories-modal';
import { ExpenseDetailModal } from './expense-detail-modal';
import { ExpenseFormModal } from './expense-form-modal';
import { ExpenseStatusBadges } from './expense-status-badges';
import { expensesPanelProps, type ExpensesViewTabs } from './expenses-tabs';
import { useExpenseCategories } from './use-expense-categories';
import { useExpenseLocations } from './use-expense-locations';

export const expensesCopy = {
  title: 'Gastos',
  description:
    'Lo que gasta cada sede: facturas, proveedores, pagos y salidas de caja menor. Por fecha de factura, en su moneda y sin convertir.',
  scopeAll: 'Toda la clínica',
  scopeLocation: (name: string) => `Gastos de ${name}`,
  searchLabel: 'Buscar por proveedor o descripción',
  searchPlaceholder: 'Proveedor o descripción',
  periodLabel: 'Periodo de la factura',
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  categoryLabel: 'Categoría',
  categoryAll: 'Todas las categorías',
  // Escalón 2 (FieldError): ≤4 palabras, el filtro da el contexto.
  categoriesError: 'Categorías no disponibles',
  statusLabel: 'Estado',
  // «Vencidos» es una opción más del estado: por pagar y con el vencimiento pasado.
  overdueOption: 'Vencidos',
  create: 'Nuevo gasto',
  export: 'Exportar CSV',
  exporting: 'Exportando…',
  exportError: 'No pudimos exportar los gastos.',
  exported: 'Gastos exportados.',
  countNoun: 'gasto',
  countNounPlural: 'gastos',
  tableLabel: 'Gastos del periodo, del más reciente al más antiguo',
  colDate: 'Fecha',
  colCategory: 'Categoría',
  colSupplier: 'Proveedor',
  colLocation: 'Sede',
  colAmount: 'Importe',
  colPaid: 'Pagado',
  colStatus: 'Estado',
  noSupplier: '—',
  paidOn: (amount: string) => `Pagado ${amount}`,
  // Sin «Intenta de nuevo.»: AsyncSection → SectionError trae «Reintentar».
  loadError: 'No pudimos cargar los gastos.',
  badRequest: 'Algún filtro no es válido: «Desde» no puede ser posterior a «Hasta».',
  forbiddenTitle: 'Tu rol no tiene acceso a los gastos.',
  forbiddenHint: 'Los gastos de la sede son para la administración de la clínica.',
  empty: 'No hay gastos en este periodo',
  emptyHint: 'Registra el primero con «Nuevo gasto», o prueba con otras fechas y filtros.',
};

const SEARCH_DEBOUNCE_MS = 300;

type StatusChoice = ExpenseStatusFilter | 'ALL' | 'OVERDUE';

/** Los estados del filtro, con «Vencidos» tras «Por pagar» (era una casilla aparte). */
const STATUS_CHOICES: readonly { value: StatusChoice; label: string }[] = [
  ...EXPENSE_STATUS_FILTERS.slice(0, 2),
  { value: 'OVERDUE', label: expensesCopy.overdueOption },
  ...EXPENSE_STATUS_FILTERS.slice(2),
];

/**
 * «Gastos» (DX-274, solo ADMIN): la lista de gastos de la sede activa (todas,
 * con «Todas las sedes» en el selector global) por fecha de factura, con el
 * mes en curso por defecto. Una sola barra: búsqueda, periodo, categoría y
 * estado, con «Nuevo gasto» a la derecha; el CSV va junto al recuento, porque
 * exporta lo que la lista enseña. `DataList`: tabla desde `sm`, tarjeta
 * compacta en el teléfono. Cada gasto abre su detalle.
 *
 * Sin selector de sede propio: el global ya acota la petición (`X-Location-Id`)
 * y dos selectores de sede en la misma pantalla no decían cuál mandaba.
 */
export function ExpensesView({ token, tabs }: { token: string; tabs?: ExpensesViewTabs }) {
  const isAdmin = canManageExpenses(getTokenRole(token));
  const [activeLocationId] = useState<string | null>(() => getActiveLocationId());
  const sedes = useExpenseLocations(token);
  // DX-378 (FE-078): importes y fechas con el formato de la sede, no con «es».
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const reference = activeLocationId ? sedes.locations.find((location) => location.id === activeLocationId) : sedes.locations[0];
  const { today, error: scheduleError, retry: retrySchedule } = useExpenseToday(token, reference?.id);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [category, setCategory] = useState('ALL');
  const [status, setStatus] = useState<StatusChoice>('ALL');
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
  // El foco al cerrar el detalle: vuelve a la fila que lo abrió; si la fila ya
  // no está (el gasto salió del filtro), a «Nuevo gasto».
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);

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
          ...(category !== 'ALL' ? { category } : {}),
          ...(status === 'OVERDUE' ? { overdue: true } : status !== 'ALL' ? { status } : {}),
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
        setData(null);
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

  function openDetail(id: string) {
    // El control que abrió el detalle (la fila o la tarjeta) recibe el foco al cerrar.
    const trigger = document.activeElement;
    detailTriggerRef.current = trigger instanceof HTMLElement && trigger !== document.body ? trigger : null;
    setDetailId(id);
  }

  function focusAfterDetail(event: Event) {
    if (detailTriggerRef.current?.isConnected) return;
    event.preventDefault();
    createButtonRef.current?.focus();
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
  // Con filas en pantalla, una recarga (tras un cambio en el detalle o un
  // filtro) las deja puestas y marcadas como ocupadas: cambiarlas por el
  // esqueleto desmontaría el botón que abrió el detalle y el foco caería en
  // <body> al cerrarlo.
  const zoneError = !filters && (sedes.failed || scheduleError) ? expenseZoneError : null;
  const showLoading = !zoneError && ((loading && data === null) || !filters);
  const refreshing = loading && data !== null;
  const { locations } = sedes;
  const activeLocation = locations.find((l) => l.id === activeLocationId) ?? null;
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? '—';
  // Con una sede activa la columna «Sede» repetiría la misma en cada fila.
  const showLocation = activeLocationId === null;
  // Las categorías de la página también, para encontrar las de una retirada.
  const categoryNames = [
    ...new Set([...(categories.categories ?? []).map((c) => c.name), ...items.map((e) => e.category)]),
  ];

  const columns: DataListColumn<Expense>[] = [
    {
      id: 'category',
      header: expensesCopy.colCategory,
      mobile: 'primary',
      cell: (expense) => (
        <span className="flex flex-col">
          <span>{expense.category}</span>
          {expense.description ? (
            <span className="max-w-[28ch] truncate text-xs font-normal text-muted">{expense.description}</span>
          ) : null}
        </span>
      ),
      mobileCell: (expense) => expense.category,
    },
    {
      id: 'date',
      header: expensesCopy.colDate,
      cell: (expense) => <span className="tabular-nums">{sedeCivilDate(expense.invoiceDate, fmt)}</span>,
    },
    {
      id: 'supplier',
      header: expensesCopy.colSupplier,
      cell: (expense) => <span className="[overflow-wrap:anywhere]">{expense.supplier ?? expensesCopy.noSupplier}</span>,
      mobileCell: (expense) => expense.supplier,
    },
    ...(showLocation
      ? [
          {
            id: 'location',
            header: expensesCopy.colLocation,
            showFrom: 'lg',
            cell: (expense) => locationName(expense.locationId),
          } satisfies DataListColumn<Expense>,
        ]
      : []),
    {
      id: 'amount',
      header: expensesCopy.colAmount,
      numeric: true,
      mobile: 'trailing',
      cell: (expense) => (
        <span className={cn(expense.status === 'VOIDED' && 'text-muted line-through')}>
          {sedeMoney(expense.amount, expense.currency, fmt)}
        </span>
      ),
    },
    {
      id: 'paid',
      header: expensesCopy.colPaid,
      numeric: true,
      // Pagado 0 no es un dato: en gris, para que la columna se lea por lo que sí se pagó.
      cell: (expense) => (
        <span className={cn(expense.paidAmount === 0 && 'text-muted')}>
          {sedeMoney(expense.paidAmount, expense.currency, fmt)}
        </span>
      ),
      mobileCell: (expense) =>
        expense.paidAmount > 0 ? expensesCopy.paidOn(sedeMoney(expense.paidAmount, expense.currency, fmt)) : null,
    },
    {
      id: 'status',
      header: expensesCopy.colStatus,
      cell: (expense) => <ExpenseStatusBadges expense={expense} />,
    },
  ];

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
          <ListToolbar
            searchLabel={expensesCopy.searchLabel}
            searchPlaceholder={expensesCopy.searchPlaceholder}
            value={searchText}
            onChange={setSearchText}
            action={
              <Button ref={createButtonRef} type="button" onClick={openCreate}>
                <Plus aria-hidden />
                {expensesCopy.create}
              </Button>
            }
          >
            <DateRangePicker
              aria-label={expensesCopy.periodLabel}
              value={effectiveFrom && effectiveTo ? { from: effectiveFrom, to: effectiveTo } : null}
              onChange={(range) => {
                if (!range) return;
                setFrom(range.from);
                setTo(range.to);
                setPage(1);
              }}
              presets
              startLabel={expensesCopy.fromLabel}
              endLabel={expensesCopy.toLabel}
              className="sm:w-64"
            />
            <div className="grid grid-cols-2 gap-3 sm:flex">
              {categories.failed ? (
                <FieldError
                  label={expensesCopy.categoriesError}
                  onRetry={categories.reload}
                  className="h-10 w-full sm:w-48"
                />
              ) : (
                <NativeSelect
                  aria-label={expensesCopy.categoryLabel}
                  value={category}
                  onChange={(e) => resetPage(setCategory)(e.target.value)}
                  className="min-w-0 sm:w-48"
                >
                  <option value="ALL">{expensesCopy.categoryAll}</option>
                  {categoryNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              )}
              <NativeSelect
                aria-label={expensesCopy.statusLabel}
                value={status}
                onChange={(e) => resetPage(setStatus)(e.target.value as StatusChoice)}
                className="min-w-0 sm:w-44"
              >
                {STATUS_CHOICES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </ListToolbar>
        ) : null}

        <p role="status" className={notice ? 'text-sm text-success-text' : 'sr-only'}>
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
              <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <ResultCount total={data.total} noun={expensesCopy.countNoun} nounPlural={expensesCopy.countNounPlural} />
                {data.total > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void exportCsv()}
                    disabled={exporting || !filters}
                    className="-mr-2"
                  >
                    <Download aria-hidden />
                    {exporting ? expensesCopy.exporting : expensesCopy.export}
                  </Button>
                ) : null}
              </div>
            ) : null}

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
              onRetry={() => {
                if (zoneError) { retrySchedule(); sedes.reload(); }
                else setReloadKey((k) => k + 1);
              }}
              isEmpty={items.length === 0}
              emptyTitle={expensesCopy.empty}
              emptyDescription={expensesCopy.emptyHint}
              skeleton={<TableSkeleton rows={5} />}
            >
              <div aria-busy={refreshing || undefined}>
                <DataList
                  label={expensesCopy.tableLabel}
                  rows={items}
                  columns={columns}
                  getRowKey={(expense) => expense.id}
                  onRowClick={(expense) => openDetail(expense.id)}
                />
              </div>
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
        locationsFailed={sedes.failed}
        onRetryLocations={sedes.reload}
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
          onCloseAutoFocus={focusAfterDetail}
          token={token}
          expenseId={detailId}
          locations={locations}
          locationsSettled={sedes.loaded || sedes.failed}
          onRetryLocations={sedes.reload}
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

/**
 * El alcance de la pantalla, en la cabecera: la sede del selector global o
 * toda la clínica. Es lo único que acota los gastos (no hay otro selector de
 * sede en la página).
 */
export function ExpensesScope({ locationName }: { locationName: string | null }) {
  return (
    <p className="mt-3 inline-flex max-w-[68ch] items-center gap-2 rounded-lg bg-surface-sunken px-3 py-1.5 text-sm text-muted">
      <Building2 aria-hidden className="size-4 shrink-0" />
      <span>{locationName ? expensesCopy.scopeLocation(locationName) : expensesCopy.scopeAll}</span>
    </p>
  );
}
