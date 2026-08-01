'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api/client';
import { getDashboard, type Dashboard } from '@/lib/dashboard/dashboard-api';
import { addOneDayIso } from '@/lib/dashboard/date-range';
import { formatCurrency } from '@/lib/format/currency';
import { listStaff } from '@/lib/appointments/staff-api';
import { formatTime } from '@/lib/format/date';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField } from '@/components/molecules/form-field';
import { EmptyState } from '@/components/molecules/empty-state';
import { CurrencySelect } from '@/components/molecules/currency-select';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';

// Copy as constants (i18n-ready, es-first) — matches
// treatment-plans-tab.tsx / agenda-view.tsx convention until next-intl
// wiring lands.
const copy = {
  fromLabel: 'Desde',
  toLabel: 'Hasta',
  currencyLabel: 'Moneda',
  loading: 'Cargando panel…',
  retry: 'Reintentar',
  forbidden: 'No tienes acceso a este panel.',
  genericError: 'No pudimos cargar el panel.',
  rangeInvalid: 'La fecha "Hasta" debe ser igual o posterior a la fecha "Desde".',
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

interface DashboardViewProps {
  token: string;
}

/**
 * `'use client'` view for the `/dashboard` page — owner/admin-only read-only
 * summary. Owns its own from/to/currency controls (defaulting to the
 * current month..today / COP) and re-fetches `getDashboard` whenever any of
 * them change, mirroring `AgendaView`'s selector-driven refetch shape (day +
 * provider there, date range + currency here). Unlike `AgendaView` /
 * `TreatmentPlansTab` there is no "refresh in place while keeping stale data
 * mounted" state here — every filter change is a genuinely new query (a
 * different period/currency), so it's rendered as a fresh loading skeleton,
 * not a background refresh over the previous period's numbers.
 *
 * The "Moneda" control is a `CurrencySelect` (reference-data currencies)
 * instead of a free-text input — that input could produce an invalid ISO 4217
 * code and crash `Intl.NumberFormat` with a `RangeError` (all money now
 * renders through the crash-safe `formatCurrency`). "Desde"/"Hasta" also get a
 * client-side range guard (IMP-11): if `from > to` the request is never fired
 * and a friendly message is shown instead, mirroring `appointment-form.tsx`'s
 * `validationEndAfterStart`.
 */
export function DashboardView({ token }: DashboardViewProps) {
  const [from, setFrom] = useState(monthStartLocalDateString);
  const [to, setTo] = useState(todayLocalDateString);
  const [currency, setCurrency] = useState('COP');

  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // El nombre del paciente viene joinado en cada cita
  // (`patientFirstName`/`patientLastName`). Antes se resolvía con un mapa
  // armado desde `GET /patients?pageSize=100`, que la API acota en 100: a
  // partir del paciente 101 la tarjeta mostraba el UUID crudo.
  // `staffNames` sí se mantiene: el endpoint de personal no está acotado así.
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await listStaff(token);
        if (cancelled) return;
        setStaffNames(Object.fromEntries(data.map((s) => [s.userId, s.fullName])));
      } catch {
        /* best-effort, see comment above */
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // IMP-11: client-side range guard — if the user picks a "Desde" after
  // "Hasta", show a friendly message (mirrors `appointment-form.tsx`'s
  // `validationEndAfterStart`) instead of firing a request the backend would
  // just reject/return nothing useful for.
  const rangeInvalid = from > to;

  useEffect(() => {
    if (!token) return;
    // `rangeInvalid` is derived straight from `from`/`to` at render time (see
    // above), so the guard message below already renders ahead of
    // `loading`/`error`/`data` in the JSX regardless of what they hold here —
    // no need to reset them, which would just be a same-render synchronous
    // `setState` this effect doesn't otherwise need.
    if (rangeInvalid) return;
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
  }, [token, from, to, currency, reloadKey, rangeInvalid]);

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
          <FormField htmlFor="dashboard-currency" label={copy.currencyLabel} className="w-44">
            <CurrencySelect id="dashboard-currency" token={token} value={currency} onChange={setCurrency} />
          </FormField>
        </CardContent>
      </Card>

      {rangeInvalid ? (
        <InlineError>{copy.rangeInvalid}</InlineError>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40" role="status" aria-label={copy.loading} />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <SectionError
          description={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          retryLabel={copy.retry}
        />
      ) : data ? (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {/* Left rail: the period's headline figures, read as a clinical
              summary strip rather than billboard hero cards. */}
          <div className="flex flex-col gap-4">
            <IncomesCard incomes={data.incomes} />
            <PatientCountCard patientCount={data.patientCount} />
          </div>
          {/* Content column: the record-like sections that carry real rows. */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <UpcomingAppointmentsCard
              upcomingAppointments={data.upcomingAppointments}
              staffNames={staffNames}
            />
            <LowStockCard lowStockItems={data.lowStockItems} />
          </div>
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
      <CardContent className="flex flex-col gap-1">
        <p className="text-2xl font-semibold tracking-tight text-ink tabular-nums">
          {formatCurrency(incomes.totalConverted, incomes.currency)}
        </p>
        <p className="text-sm text-muted">{copy.incomesCount(incomes.count)}</p>
        {byCurrencyEntries.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-hairline pt-3">
            <p className="t-label uppercase text-muted">{copy.byCurrencyHeading}</p>
            <ul className="flex flex-col gap-1">
              {byCurrencyEntries.map(([cur, amount]) => (
                <li key={cur} className="flex items-center justify-between text-sm text-ink">
                  <span className="text-muted">{cur}</span>
                  <span className="font-medium tabular-nums">{formatCurrency(amount, cur)}</span>
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
                    <TableCell className="tabular-nums">{item.stock}</TableCell>
                    <TableCell className="tabular-nums">{item.minStock}</TableCell>
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
  staffNames,
}: {
  upcomingAppointments: Dashboard['upcomingAppointments'];
  staffNames: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link href="/agenda" className="hover:text-primary hover:underline">
            {copy.upcomingHeading}
          </Link>
        </CardTitle>
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
            {upcomingAppointments.map((appointment) => {
              // Nombre joinado en la cita; cae al id crudo solo si la API no
              // pudo resolverlo (misma convención que `patientLabel` de la agenda).
              const patientLabel =
                [appointment.patientFirstName, appointment.patientLastName]
                  .filter(Boolean)
                  .join(' ')
                  .trim() || appointment.patientId;
              const providerLabel = staffNames[appointment.providerId] ?? appointment.providerId;
              return (
                <li
                  key={appointment.id}
                  className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-ink">{formatTime(appointment.start)}</span>
                    <span className="text-xs text-muted">
                      {patientLabel} · {providerLabel}
                    </span>
                  </div>
                  <Badge variant={STATUS_BADGE_VARIANT[appointment.status]}>
                    {copy.statusLabels[appointment.status]}
                  </Badge>
                </li>
              );
            })}
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
        <CardTitle>
          <Link href="/patients" className="hover:text-primary hover:underline">
            {copy.patientCountHeading}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight text-ink tabular-nums">{patientCount}</p>
        <p className="mt-1 text-sm text-muted">registrados en la clínica</p>
      </CardContent>
    </Card>
  );
}
