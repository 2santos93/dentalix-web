'use client';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  getSalesTotals,
  listSales,
  voidSale,
  type Sale,
  type SalesTotals,
} from '@/lib/sales/sales-api';
import { addOneDayIso } from '@/lib/dashboard/date-range';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField } from '@/components/molecules/form-field';
import { EmptyState } from '@/components/molecules/empty-state';

// Copy as constants (i18n-ready, es-first) — matches
// dashboard-view.tsx / treatment-plans-tab.tsx convention until next-intl
// wiring lands.
const copy = {
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  currencyLabel: 'Moneda',
  currencyPlaceholder: 'USD',
  loading: 'Cargando ventas…',
  retry: 'Reintentar',
  forbidden: 'No tienes acceso a las ventas.',
  genericError: 'No pudimos cargar las ventas. Intenta de nuevo.',
  refreshing: 'Actualizando…',
  genericRefreshError: 'No pudimos actualizar las ventas. Intenta de nuevo.',
  totalHeading: 'Total del período',
  salesCount: (count: number) => `${count} ${count === 1 ? 'venta' : 'ventas'}`,
  byCurrencyHeading: 'Desglose por moneda',
  tableHeading: 'Ventas',
  newSale: 'Nueva venta',
  // Task 2 wires the real create-sale form behind this button — for this
  // task it just toggles a placeholder section so the hook exists without
  // building the form here.
  newSaleComingSoon: 'El formulario de nueva venta se agrega en la siguiente tarea.',
  colDate: 'Fecha',
  colPatient: 'Paciente',
  colMethod: 'Método',
  colTotal: 'Total',
  colActions: 'Acciones',
  patientFallback: '—',
  methodFallback: '—',
  voidAction: 'Anular',
  voiding: 'Anulando…',
  genericVoidError: 'No pudimos anular la venta. Intenta de nuevo.',
  emptyTitle: 'No hay ventas en este período.',
  emptyDescription: 'Registra una venta para verla aquí.',
};

const PAYMENT_METHOD_LABELS: Record<NonNullable<Sale['paymentMethod']>, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

// Semantic Badge variants (never raw color utilities) — same convention as
// `STATUS_BADGE_VARIANT` in `dashboard-view.tsx` / `ITEM_STATUS_BADGE_VARIANT`
// in `treatment-plans-tab.tsx`: CASH is the "money in hand" happy path
// (success), the rest are neutral distinctions rather than states.
const PAYMENT_METHOD_BADGE_VARIANT: Record<NonNullable<Sale['paymentMethod']>, BadgeProps['variant']> = {
  CASH: 'success',
  CARD: 'default',
  TRANSFER: 'muted',
  OTHER: 'muted',
};

function todayLocalDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function monthStartLocalDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

function currencyFormatter(currency: string): Intl.NumberFormat {
  return new Intl.NumberFormat('es', { style: 'currency', currency });
}

interface SalesViewProps {
  token: string;
}

/**
 * `'use client'` view for the `/sales` page. Owns its own from/to/currency
 * controls (defaulting to the current month..today / USD, "Hasta" treated
 * as the user's INCLUSIVE selection — see `addOneDayIso`, reused from
 * `dashboard/date-range.ts`, exactly like `DashboardView` uses it for the
 * same half-open-backend/inclusive-UI mismatch) and fetches both
 * `getSalesTotals` and `listSales` together for the period whenever any of
 * them change (a genuinely new query -> full loading skeleton, same
 * convention as `DashboardView`).
 *
 * Voiding a sale, however, is a mutation over the SAME period — it must
 * refresh the mounted total + table in place (never unmount them into a
 * fresh loading state) and the acting row stays disabled until that refetch
 * actually lands, not just until `voidSale`'s own promise settles — same
 * "await the refresh before re-enabling" fix as
 * `TreatmentPlansTab.handleRemoveItem` / `AgendaView.handleStatusChange`.
 *
 * "Nueva venta" is present but inert beyond toggling a placeholder note —
 * the create-sale form (dynamic line items + live total) is Task 2; this
 * task only leaves the hook for it to attach to.
 */
export function SalesView({ token }: SalesViewProps) {
  const [from, setFrom] = useState(monthStartLocalDateString);
  const [to, setTo] = useState(todayLocalDateString);
  const [currency, setCurrency] = useState('USD');

  const [totals, setTotals] = useState<SalesTotals | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);

  const [showNewSalePlaceholder, setShowNewSalePlaceholder] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // `to` is the user's inclusive selection (what the "Hasta" input
        // shows); the backend's range is half-open `[from, to)`, so extend
        // it by one day here — sending the raw value would silently exclude
        // sales made on the selected end date itself.
        const toExclusive = addOneDayIso(to);
        const [totalsData, salesData] = await Promise.all([
          getSalesTotals(token, { from, to: toExclusive, currency }),
          listSales(token, { from, to: toExclusive }),
        ]);
        if (cancelled) return;
        setTotals(totalsData);
        setSales(salesData);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setError(copy.forbidden);
        } else {
          setError(err instanceof ApiError ? err.message : copy.genericError);
        }
        setTotals(null);
        setSales([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, from, to, currency, reloadKey]);

  /**
   * Re-fetches totals + list in place for the current from/to/currency,
   * without touching `loading`/`error` (the mounted cards/table stay up
   * while this runs). Called directly by `handleVoid` below and AWAITED by
   * it before clearing `voidingId` — see the component doc comment.
   */
  function refreshInPlace(): Promise<void> {
    setRefreshing(true);
    const toExclusive = addOneDayIso(to);
    return Promise.all([
      getSalesTotals(token, { from, to: toExclusive, currency }),
      listSales(token, { from, to: toExclusive }),
    ])
      .then(([totalsData, salesData]) => {
        setTotals(totalsData);
        setSales(salesData);
        setRefreshError(null);
      })
      .catch((err) => {
        setRefreshError(err instanceof ApiError ? err.message : copy.genericRefreshError);
      })
      .finally(() => setRefreshing(false));
  }

  async function handleVoid(id: string) {
    setVoidingId(id);
    setVoidError(null);
    try {
      await voidSale(token, id);
      await refreshInPlace();
    } catch (err) {
      setVoidError(err instanceof ApiError ? err.message : copy.genericVoidError);
    } finally {
      setVoidingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <FormField htmlFor="sales-from" label={copy.fromLabel}>
            <Input
              id="sales-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-auto"
            />
          </FormField>
          <FormField htmlFor="sales-to" label={copy.toLabel}>
            <Input
              id="sales-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-auto"
            />
          </FormField>
          <FormField htmlFor="sales-currency" label={copy.currencyLabel} className="w-28">
            <Input
              id="sales-currency"
              value={currency}
              placeholder={copy.currencyPlaceholder}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="uppercase"
            />
          </FormField>
          <Button
            type="button"
            variant="outline"
            className="ml-auto"
            onClick={() => setShowNewSalePlaceholder((v) => !v)}
          >
            {copy.newSale}
          </Button>
        </CardContent>
      </Card>

      {showNewSalePlaceholder && (
        <Card>
          <CardContent className="p-4 text-sm text-muted">{copy.newSaleComingSoon}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32" role="status" aria-label={copy.loading} />
          <Skeleton className="h-64" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
          <Button type="button" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
            {copy.retry}
          </Button>
        </div>
      ) : (
        <>
          {refreshing && (
            <p role="status" aria-live="polite" className="text-xs font-medium text-muted">
              {copy.refreshing}
            </p>
          )}
          {refreshError && (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-xs text-danger">
                {refreshError}
              </p>
              <Button variant="outline" size="sm" onClick={refreshInPlace}>
                {copy.retry}
              </Button>
            </div>
          )}
          {voidError && (
            <p role="alert" className="text-sm text-danger">
              {voidError}
            </p>
          )}

          {totals && <TotalsCard totals={totals} />}

          <Card>
            <CardHeader>
              <CardTitle>{copy.tableHeading}</CardTitle>
            </CardHeader>
            <CardContent>
              {sales.length === 0 ? (
                <EmptyState role="status" title={copy.emptyTitle} description={copy.emptyDescription} />
              ) : (
                <SalesTable sales={sales} voidingId={voidingId} onVoid={handleVoid} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function TotalsCard({ totals }: { totals: SalesTotals }) {
  const byCurrencyEntries = Object.entries(totals.byCurrency);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.totalHeading}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-3xl font-semibold tracking-tight text-ink">
          {currencyFormatter(totals.currency).format(totals.totalConverted)}
        </p>
        <p className="text-sm text-muted">{copy.salesCount(totals.count)}</p>
        {byCurrencyEntries.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 border-t border-border pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{copy.byCurrencyHeading}</p>
            <ul className="flex flex-col gap-1">
              {byCurrencyEntries.map(([cur, amount]) => (
                <li key={cur} className="flex items-center justify-between text-sm text-ink">
                  <span>{cur}</span>
                  <span className="font-medium">{currencyFormatter(cur).format(amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface SalesTableProps {
  sales: Sale[];
  voidingId: string | null;
  onVoid: (id: string) => void;
}

function SalesTable({ sales, voidingId, onVoid }: SalesTableProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <caption className="sr-only">{copy.tableHeading}</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{copy.colDate}</TableHead>
              <TableHead>{copy.colPatient}</TableHead>
              <TableHead>{copy.colMethod}</TableHead>
              <TableHead>{copy.colTotal}</TableHead>
              <TableHead className="sr-only">{copy.colActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((sale) => {
              const voiding = voidingId === sale.id;
              return (
                <TableRow key={sale.id}>
                  <TableCell>{formatDateTime(sale.paidAt)}</TableCell>
                  <TableCell className="text-muted">{sale.patientId ?? copy.patientFallback}</TableCell>
                  <TableCell>
                    {sale.paymentMethod ? (
                      <Badge variant={PAYMENT_METHOD_BADGE_VARIANT[sale.paymentMethod]}>
                        {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
                      </Badge>
                    ) : (
                      <span className="text-muted">{copy.methodFallback}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{currencyFormatter(sale.currency).format(sale.total)}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={voiding}
                      onClick={() => onVoid(sale.id)}
                    >
                      {voiding ? copy.voiding : copy.voidAction}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {sales.map((sale) => {
          const voiding = voidingId === sale.id;
          return (
            <li key={sale.id}>
              <Card className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{formatDateTime(sale.paidAt)}</span>
                  {sale.paymentMethod ? (
                    <Badge variant={PAYMENT_METHOD_BADGE_VARIANT[sale.paymentMethod]}>
                      {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted">{copy.methodFallback}</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted">
                  {copy.colPatient}: {sale.patientId ?? copy.patientFallback}
                </p>
                <p className="mt-1 font-medium text-ink">{currencyFormatter(sale.currency).format(sale.total)}</p>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={voiding}
                    onClick={() => onVoid(sale.id)}
                  >
                    {voiding ? copy.voiding : copy.voidAction}
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
