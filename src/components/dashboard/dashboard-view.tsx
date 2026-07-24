'use client';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { getDashboard, type Dashboard } from '@/lib/dashboard/dashboard-api';
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
// treatment-plans-tab.tsx / agenda-view.tsx convention until next-intl
// wiring lands.
const copy = {
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  currencyLabel: 'Moneda',
  currencyPlaceholder: 'USD',
  loading: 'Cargando panel…',
  retry: 'Reintentar',
  forbidden: 'No tienes acceso a este panel.',
  genericError: 'No pudimos cargar el panel. Intenta de nuevo.',
  incomesHeading: 'Ingresos del período',
  incomesCount: (count: number) => `${count} ${count === 1 ? 'abono' : 'abonos'}`,
  byCurrencyHeading: 'Desglose por moneda',
  lowStockHeading: 'Bajo stock',
  lowStockCount: (count: number) => `${count} ${count === 1 ? 'ítem' : 'ítems'}`,
  emptyLowStockTitle: 'No hay ítems en bajo stock.',
  emptyLowStockDescription: 'Todo el inventario está por encima de su mínimo.',
  colItem: 'Ítem',
  colStock: 'Stock',
  colMinStock: 'Mínimo',
  colUnit: 'Unidad',
  upcomingHeading: 'Próximas citas',
  emptyUpcomingTitle: 'No hay citas próximas.',
  emptyUpcomingDescription: 'Las próximas citas agendadas aparecerán aquí.',
  patientFallback: 'Paciente',
  patientCountHeading: '# Pacientes',
  statusLabels: {
    SCHEDULED: 'Agendada',
    CONFIRMED: 'Confirmada',
    COMPLETED: 'Completada',
    CANCELLED: 'Cancelada',
    NO_SHOW: 'No asistió',
  } as Record<Dashboard['upcomingAppointments'][number]['status'], string>,
};

type AppointmentStatus = Dashboard['upcomingAppointments'][number]['status'];

// Same semantic-token convention as `treatment-plans-tab.tsx`'s
// `ITEM_STATUS_BADGE_VARIANT` / `day-agenda.tsx`'s `STATUS_BADGE_CLASSES`:
// nothing-has-happened-yet statuses are neutral, CONFIRMED maps to the
// brand/primary token, COMPLETED to success, CANCELLED to danger, NO_SHOW to
// warning (attention-worthy but not an error).
const STATUS_BADGE_VARIANT: Record<AppointmentStatus, BadgeProps['variant']> = {
  SCHEDULED: 'muted',
  CONFIRMED: 'default',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  NO_SHOW: 'warning',
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function currencyFormatter(currency: string): Intl.NumberFormat {
  return new Intl.NumberFormat('es', { style: 'currency', currency });
}

interface DashboardViewProps {
  token: string;
}

/**
 * `'use client'` view for the `/dashboard` page — owner/admin-only read-only
 * summary. Owns its own from/to/currency controls (defaulting to the
 * current month..today / USD) and re-fetches `getDashboard` whenever any of
 * them change, mirroring `AgendaView`'s selector-driven refetch shape (day +
 * provider there, date range + currency here). Unlike `AgendaView` /
 * `TreatmentPlansTab` there is no "refresh in place while keeping stale data
 * mounted" state here — every filter change is a genuinely new query (a
 * different period/currency), so it's rendered as a fresh loading skeleton,
 * not a background refresh over the previous period's numbers.
 */
export function DashboardView({ token }: DashboardViewProps) {
  const [from, setFrom] = useState(monthStartLocalDateString);
  const [to, setTo] = useState(todayLocalDateString);
  const [currency, setCurrency] = useState('USD');

  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // `to` is the user's inclusive selection (what the "Hasta" input
        // shows); the backend's incomes/payments-totals query is half-open
        // `[from, to)`, so extend it by one day here — sending the raw value
        // would silently exclude payments made on the selected end date itself.
        const result = await getDashboard(token, { from, to: addOneDayIso(to), currency });
        if (cancelled) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setError(copy.forbidden);
        } else {
          setError(err instanceof ApiError ? err.message : copy.genericError);
        }
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, from, to, currency, reloadKey]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <FormField htmlFor="dashboard-from" label={copy.fromLabel}>
            <Input
              id="dashboard-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-auto"
            />
          </FormField>
          <FormField htmlFor="dashboard-to" label={copy.toLabel}>
            <Input
              id="dashboard-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-auto"
            />
          </FormField>
          <FormField htmlFor="dashboard-currency" label={copy.currencyLabel} className="w-28">
            <Input
              id="dashboard-currency"
              value={currency}
              placeholder={copy.currencyPlaceholder}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className="uppercase"
            />
          </FormField>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40" role="status" aria-label={copy.loading} />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
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
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <IncomesCard incomes={data.incomes} />
          <LowStockCard lowStockItems={data.lowStockItems} />
          <UpcomingAppointmentsCard upcomingAppointments={data.upcomingAppointments} />
          <PatientCountCard patientCount={data.patientCount} />
        </div>
      ) : null}
    </div>
  );
}

function IncomesCard({ incomes }: { incomes: Dashboard['incomes'] }) {
  const byCurrencyEntries = Object.entries(incomes.byCurrency);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.incomesHeading}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-3xl font-semibold tracking-tight text-ink">
          {currencyFormatter(incomes.currency).format(incomes.totalConverted)}
        </p>
        <p className="text-sm text-muted">{copy.incomesCount(incomes.count)}</p>
        {byCurrencyEntries.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 border-t border-border pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {copy.byCurrencyHeading}
            </p>
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

function LowStockCard({ lowStockItems }: { lowStockItems: Dashboard['lowStockItems'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.lowStockHeading}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted">{copy.lowStockCount(lowStockItems.count)}</p>
        {lowStockItems.items.length === 0 ? (
          <EmptyState
            role="status"
            title={copy.emptyLowStockTitle}
            description={copy.emptyLowStockDescription}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">{copy.lowStockHeading}</caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{copy.colItem}</TableHead>
                  <TableHead>{copy.colStock}</TableHead>
                  <TableHead>{copy.colMinStock}</TableHead>
                  <TableHead>{copy.colUnit}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockItems.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.stock}</TableCell>
                    <TableCell>{item.minStock}</TableCell>
                    <TableCell className="text-muted">{item.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingAppointmentsCard({
  upcomingAppointments,
}: {
  upcomingAppointments: Dashboard['upcomingAppointments'];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.upcomingHeading}</CardTitle>
      </CardHeader>
      <CardContent>
        {upcomingAppointments.length === 0 ? (
          <EmptyState
            role="status"
            title={copy.emptyUpcomingTitle}
            description={copy.emptyUpcomingDescription}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {upcomingAppointments.map((appointment) => (
              <li
                key={appointment.id}
                className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-ink">{formatTime(appointment.start)}</span>
                  <span className="text-xs text-muted">
                    {copy.patientFallback} {appointment.patientId.slice(0, 8)}
                  </span>
                </div>
                <Badge variant={STATUS_BADGE_VARIANT[appointment.status]}>
                  {copy.statusLabels[appointment.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PatientCountCard({ patientCount }: { patientCount: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.patientCountHeading}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-semibold tracking-tight text-ink">{patientCount}</p>
      </CardContent>
    </Card>
  );
}
