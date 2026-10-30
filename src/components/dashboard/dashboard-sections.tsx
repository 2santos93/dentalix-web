import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Dashboard } from '@/lib/dashboard/dashboard-api';
import { addOneDayIso } from '@/lib/dashboard/date-range';
import { civilDateInZone } from '@/lib/format/date';
import { formatCurrency } from '@/lib/format/currency';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { SectionHeader } from '@/components/ui/section-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { cn } from '@/lib/utils';

// Copy as constants (i18n-ready, es-first).
export const sectionsCopy = {
  summaryHeading: 'Resumen del período',
  summaryRange: (from: string, to: string) => `Del ${from} al ${to}.`,
  incomesLabel: (currency: string) => `Ingresos en ${currency}`,
  incomesCount: (count: number) => `${count} ${count === 1 ? 'abono' : 'abonos'}`,
  // `totalConverted` (API): cada abono convertido a la moneda pedida con la
  // tasa de SU propio día de pago. Se dice cuando hay pagos en otra moneda,
  // para que el total no parezca excluirlos ni sumarlos a la tasa de hoy.
  incomesConverted: (currency: string) =>
    `Incluye los pagos en otras monedas, convertidos a ${currency} con la tasa del día de cada pago.`,
  incomesSingle: (currency: string) => `Todos cobrados en ${currency}.`,
  byCurrencyLabel: 'Cobrado por moneda',
  byCurrencyHint: 'Montos originales, sin convertir.',
  patientsLabel: 'Pacientes registrados',
  patientsHint: 'Total de la clínica; no depende del período.',
  patientsLink: 'Ver pacientes',
  upcomingHeading: 'Próximas citas',
  upcomingDescription: 'Las siguientes citas agendadas, por día.',
  agendaLink: 'Ver agenda',
  today: 'Hoy',
  tomorrow: 'Mañana',
  emptyUpcomingTitle: 'No hay citas próximas.',
  emptyUpcomingDescription: 'Las próximas citas agendadas aparecerán aquí.',
  lowStockHeading: 'Bajo stock',
  lowStockDescription: 'Ítems en su mínimo o por debajo.',
  lowStockCount: (count: number) => `${count} ${count === 1 ? 'ítem' : 'ítems'}`,
  lowStockShowing: (shown: number, total: number) => `Se muestran ${shown} de ${total}.`,
  inventoryLink: 'Ver inventario',
  emptyLowStockTitle: 'No hay ítems en bajo stock.',
  emptyLowStockDescription: 'Todo el inventario está por encima de su mínimo.',
  colItem: 'Ítem',
  colStock: 'Stock',
  colMinStock: 'Mínimo',
  colMissing: 'Faltan',
};
const copy = sectionsCopy;

/** Enlace de texto de una cabecera de sección: tinta de enlace, objetivo táctil de 44px en móvil. */
const sectionLinkClass =
  'inline-flex items-center rounded-sm text-sm font-medium text-primary-text hover:underline max-md:min-h-11';

/** El enlace de la sección se queda en la fila del título también en móvil (es corto). */
const headerRow = 'flex-row items-start justify-between';

/** Número con el formato de la sede; sin él, el número tal cual (nunca «—» para un conteo). */
function count(value: number, fmt: RegionalFormat | null): string {
  return fmt ? fmt.number(value) : String(value);
}

/* ─────────────────────────── Resumen del período ─────────────────────────── */

export function PeriodSummary({
  incomes,
  patientCount,
  from,
  to,
  fmt,
}: {
  incomes: Dashboard['incomes'];
  patientCount: number;
  /** Días del periodo tal como los eligió la persona (inclusivos). */
  from: string;
  to: string;
  fmt: RegionalFormat | null;
}) {
  const byCurrency = Object.entries(incomes.byCurrency);
  // El desglose solo aporta si hay pagos en otra moneda: con una sola, repetiría el total.
  const mixed = byCurrency.some(([cur]) => cur !== incomes.currency);
  const civil = (day: string) => (fmt ? fmt.civilDate(day) : day);

  return (
    <section aria-labelledby="dashboard-summary-title" className="flex flex-col gap-3">
      <SectionHeader
        titleId="dashboard-summary-title"
        title={copy.summaryHeading}
        description={copy.summaryRange(civil(from), civil(to))}
      />
      <dl
        className={cn(
          'grid divide-y divide-border-subtle rounded-xl border border-border bg-surface',
          'md:divide-x md:divide-y-0',
          mixed ? 'md:grid-cols-3' : 'md:grid-cols-2',
        )}
      >
        <Figure label={copy.incomesLabel(incomes.currency)} testId="dashboard-incomes">
          <dd className="t-data text-xl font-semibold tracking-tight text-ink">
            {formatCurrency(incomes.totalConverted, incomes.currency)}
          </dd>
          <dd className="text-sm text-muted">
            <span className="t-data">{copy.incomesCount(incomes.count)}</span>
            {incomes.count > 0 ? (
              <span className="block text-pretty">
                {mixed ? copy.incomesConverted(incomes.currency) : copy.incomesSingle(incomes.currency)}
              </span>
            ) : null}
          </dd>
        </Figure>

        {mixed ? (
          <Figure label={copy.byCurrencyLabel} testId="dashboard-by-currency">
            <dd>
              <ul className="flex flex-col gap-1">
                {byCurrency.map(([cur, amount]) => (
                  <li key={cur} className="flex items-baseline justify-between gap-4 text-sm">
                    <span className="text-muted">{cur}</span>
                    <span className="t-data font-medium text-ink">{formatCurrency(amount, cur)}</span>
                  </li>
                ))}
              </ul>
            </dd>
            <dd className="text-sm text-muted">{copy.byCurrencyHint}</dd>
          </Figure>
        ) : null}

        <Figure label={copy.patientsLabel} testId="dashboard-patients">
          <dd className="t-data text-xl font-semibold tracking-tight text-ink">{count(patientCount, fmt)}</dd>
          <dd className="text-sm text-muted">
            {copy.patientsHint}
            <Link href="/patients" className="mt-1 flex w-fit font-medium text-primary-text hover:underline max-md:min-h-11 max-md:items-center">
              {copy.patientsLink}
            </Link>
          </dd>
        </Figure>
      </dl>
    </section>
  );
}

/** Una cifra de la tira: etiqueta encima, valor tabular, apoyo debajo. Sin tarjeta propia. */
function Figure({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 p-4 sm:px-6" data-testid={testId}>
      <dt className="t-overline">{label}</dt>
      {children}
    </div>
  );
}

/* ───────────────────────────── Próximas citas ───────────────────────────── */

type Appointment = Dashboard['upcomingAppointments'][number];

/** Agrupa por día civil EN LA SEDE (una cita de las 23:30 no cae en «mañana» por la zona del navegador). */
function groupByDay(appointments: Appointment[], timeZone: string | null) {
  const groups: { day: string; items: Appointment[] }[] = [];
  for (const appointment of appointments) {
    const day = (timeZone && civilDateInZone(appointment.start, timeZone)) || appointment.start.slice(0, 10);
    const last = groups.at(-1);
    if (last && last.day === day) last.items.push(appointment);
    else groups.push({ day, items: [appointment] });
  }
  return groups;
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
}

export function UpcomingAppointments({
  appointments,
  staffNames,
  timeZone,
  fmt,
}: {
  appointments: Dashboard['upcomingAppointments'];
  staffNames: Record<string, string>;
  timeZone: string | null;
  fmt: RegionalFormat | null;
}) {
  const today = timeZone ? civilDateInZone(new Date(), timeZone) : null;
  const tomorrow = today ? addOneDayIso(today) : null;
  const longDay = (day: string) => (fmt ? fmt.civilLongDate(day, { year: false }) : day);
  const groups = groupByDay(appointments, timeZone);

  return (
    <section aria-labelledby="dashboard-upcoming-title" className="flex flex-col gap-3">
      <SectionHeader
        titleId="dashboard-upcoming-title"
        title={copy.upcomingHeading}
        description={copy.upcomingDescription}
        className={headerRow}
        actions={
          <Link href="/agenda" className={sectionLinkClass}>
            {copy.agendaLink}
          </Link>
        }
      />
      {appointments.length === 0 ? (
        <EmptyState role="status" title={copy.emptyUpcomingTitle} description={copy.emptyUpcomingDescription} />
      ) : (
        <div className="@container overflow-hidden rounded-xl border border-border bg-surface">
          {groups.map(({ day, items }, index) => {
            const relative = day === today ? copy.today : day === tomorrow ? copy.tomorrow : null;
            return (
              <div key={day} className={cn(index > 0 && 'border-t border-border')}>
                <h3 className="flex items-baseline gap-2 bg-surface-sunken px-4 py-2 text-sm sm:px-6">
                  {relative ? (
                    <>
                      <span className="font-semibold text-ink">{relative}</span>
                      <span className="text-muted">{longDay(day)}</span>
                    </>
                  ) : (
                    <span className="font-semibold text-ink">{capitalize(longDay(day))}</span>
                  )}
                </h3>
                <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                  {items.map((appointment) => (
                    <AppointmentRow
                      key={appointment.id}
                      appointment={appointment}
                      providerLabel={staffNames[appointment.providerId] ?? appointment.providerId}
                      time={fmt && timeZone ? fmt.time(new Date(appointment.start), timeZone) : NO_SEDE_FORMAT}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AppointmentRow({
  appointment,
  providerLabel,
  time,
}: {
  appointment: Appointment;
  providerLabel: string;
  /** DX-378: la hora con el reloj de la sede. */
  time: string;
}) {
  // Nombre joinado en la cita; cae al id crudo solo si la API no pudo
  // resolverlo (misma convención que `patientLabel` de la agenda).
  const patientLabel =
    [appointment.patientFirstName, appointment.patientLastName].filter(Boolean).join(' ').trim() ||
    appointment.patientId;
  return (
    // Toda la fila es el objetivo: el enlace del nombre se estira sobre ella
    // (no hay ruta de una cita suelta; la ficha del paciente es el destino útil).
    // En estrecho el nombre ocupa la fila y el estado baja junto al profesional;
    // con sitio (≥ 28rem) el estado tiene su columna.
    <li className="relative grid min-h-14 grid-cols-[3.75rem_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 hover:bg-canvas sm:px-6 @md:grid-cols-[5.75rem_minmax(0,1fr)_auto]">
      <time
        dateTime={appointment.start}
        className="t-data row-span-2 text-sm font-medium text-ink @md:whitespace-nowrap"
      >
        {time}
      </time>
      <Link
          href={`/patients/${appointment.patientId}`}
          className="col-span-2 truncate text-sm font-medium text-ink @md:col-span-1 after:absolute after:inset-0 after:rounded-[inherit] hover:underline focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary-text"
        >
        {patientLabel}
      </Link>
      <span className="col-start-2 row-start-2 truncate text-sm text-muted">{providerLabel}</span>
      <StatusBadge
        kind="appointment"
        status={appointment.status}
        className="col-start-3 row-start-2 justify-self-end @md:row-span-2 @md:row-start-1"
      />
    </li>
  );
}

/* ──────────────────────────────── Bajo stock ─────────────────────────────── */

/** Columnas de la tabla cuando el bloque tiene sitio (≥ 28rem); por debajo, filas etiquetadas. */
const stockGrid = '@md:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4.5rem]';

export function LowStock({
  lowStockItems,
  fmt,
}: {
  lowStockItems: Dashboard['lowStockItems'];
  fmt: RegionalFormat | null;
}) {
  const { items } = lowStockItems;
  const total = lowStockItems.count;
  return (
    <section aria-labelledby="dashboard-low-stock-title" className="flex flex-col gap-3">
      <SectionHeader
        titleId="dashboard-low-stock-title"
        title={copy.lowStockHeading}
        description={
          <>
            <span className="t-data font-medium text-ink">{copy.lowStockCount(total)}</span>
            {' · '}
            {copy.lowStockDescription}
          </>
        }
        className={headerRow}
        actions={
          <Link href="/inventory" className={sectionLinkClass}>
            {copy.inventoryLink}
          </Link>
        }
      />
      {items.length === 0 ? (
        <EmptyState role="status" title={copy.emptyLowStockTitle} description={copy.emptyLowStockDescription} />
      ) : (
        <div className="@container overflow-hidden rounded-xl border border-border bg-surface">
          {/* La cabecera visible es solo para la vista; cada celda lleva su etiqueta (visible en estrecho). */}
          <div
            aria-hidden
            className={cn(
              't-label hidden gap-x-3 border-b border-border-subtle bg-surface-sunken px-4 py-2 text-muted sm:px-6 @md:grid',
              stockGrid,
            )}
          >
            <span>{copy.colItem}</span>
            <span className="text-right">{copy.colStock}</span>
            <span className="text-right">{copy.colMinStock}</span>
            <span className="text-right">{copy.colMissing}</span>
          </div>
          <ul className="divide-y divide-border-subtle">
            {items.map((item) => {
              const missing = Math.max(item.minStock - item.stock, 0);
              return (
                <li
                  key={item.id}
                  className={cn('grid grid-cols-3 items-baseline gap-x-3 gap-y-1 px-4 py-2.5 sm:px-6 @md:items-center', stockGrid)}
                >
                  <div className="col-span-3 min-w-0 @md:col-span-1">
                    <p className="break-words text-sm font-medium text-ink">{item.name}</p>
                    <p className="truncate text-xs text-muted">{item.unit}</p>
                  </div>
                  <StockCell label={copy.colStock} value={count(item.stock, fmt)} />
                  <StockCell label={copy.colMinStock} value={count(item.minStock, fmt)} />
                  <StockCell
                    label={copy.colMissing}
                    value={count(missing, fmt)}
                    valueClassName={missing > 0 ? 'font-semibold text-warning-text' : 'text-muted'}
                  />
                </li>
              );
            })}
          </ul>
          {total > items.length ? (
            <p className="border-t border-border-subtle px-4 py-2.5 text-sm text-muted sm:px-6">
              {copy.lowStockShowing(items.length, total)}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Celda numérica: etiqueta visible en estrecho, solo para lectores con la cabecera de tabla a la vista. */
function StockCell({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <p className="text-sm @md:text-right">
      <span className="text-muted @md:sr-only">{label} </span>
      <span className={cn('t-data text-ink', valueClassName)}>{value}</span>
    </p>
  );
}

/* ──────────────────────────────── Carga ──────────────────────────────── */

/** Esqueleto con la forma del panel: tira de cifras y dos secciones. */
export function DashboardSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label={label}>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
      <div className="grid gap-8 xl:grid-cols-12 xl:gap-6">
        <div className="flex flex-col gap-3 xl:col-span-7">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-3 xl:col-span-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
