'use client';
import type { ReactNode } from 'react';
import { AttendanceBadge } from '@/components/appointments/attendance-badge';
import { OverdueChip } from '@/components/collections/overdue-chip';
import { CoverageChip } from '@/components/patients/coverage-chip';
import { MedicalAlertIndicator } from '@/components/clinical/medical-alert-indicator';
import { CalendarDays, ChevronRight } from 'lucide-react';
import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';
import {
  ConfirmationBadge,
  StatusBadge,
  STATUS_LABELS,
  patientLabel,
} from './appointment-display';
import { sedeTimeRange, type AgendaClock } from '@/lib/locations/sede-clock';
import { AppointmentStatusSelect } from './appointment-status-select';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { statusOptionsFor } from '@/lib/appointments/patient-flow';
import type { ClinicRole } from '@/lib/me/me-api';

// Copy as constants (i18n-ready, es-first) — matches patients-table.tsx /
// clinical-entries-list.tsx convention until next-intl wiring lands.
const copy = {
  loading: 'Cargando agenda…',
  empty: 'No hay citas para este día.',
  emptyHint: 'Crea una nueva cita para empezar a llenar el día.',
  genericLoadError: 'No pudimos cargar la agenda.',
  colTime: 'Hora',
  colPatient: 'Paciente',
  colReason: 'Motivo',
  colProvider: 'Profesional',
  colStatus: 'Estado',
  reasonFallback: '—',
  heading: 'Agenda del día',
  /** Nombre accesible del selector de estado (más el estado actual), filled in with the row's time range — e.g. "Estado de la cita de 09:00–09:30". */
  statusSelectLabel: (timeRange: string) => `Estado de la cita de ${timeRange}`,
  updatingStatus: 'Actualizando…',
  detail: 'Detalle',
  /** `aria-label` del botón de detalle de una fila, p. ej. "Detalle de la cita de 09:00–09:30". */
  detailLabel: (timeRange: string) => `Detalle de la cita de ${timeRange}`,
};


interface DayAgendaProps {
  /** Appointments to render — any order; this component sorts by `start` ASC. */
  appointments: Appointment[];
  /** DX-378: cada hora, con la zona y el reloj de la sede de su cita. */
  clock: AgendaClock;
  loading: boolean;
  /** Error message to show instead of the list/empty state, if loading failed. */
  error?: string | null;
  /** Retries the load that produced `error` — renders as `SectionError`'s own retry button. */
  onRetry?: () => void;
  /**
   * Optional `patientId -> fullName` lookup (e.g. built from `GET /patients`
   * by the page in Task 5). Falls back to the raw `patientId` when a
   * patient isn't in the map — the appointment itself never carries a name.
   */
  patientNames?: Record<string, string>;
  /**
   * When provided, each row renders a status selector (in addition to the
   * read-only badge) letting the caller change an appointment's status —
   * see `AgendaView.handleStatusChange`. When omitted, rows render the
   * badge only (read-only) — existing callers/tests are unaffected.
   */
  onStatusChange?: (
    appointmentId: string,
    status: AppointmentStatus,
    trigger?: HTMLElement | null,
  ) => void;
  /** The `id` of the appointment currently being updated, if any — disables that row's status select and shows a small "Actualizando…" hint next to it. */
  updatingId?: string | null;
  /**
   * Cuando se pasa, cada fila lleva un botón "Detalle" que abre el detalle de
   * la cita (donde vive, p. ej., "Enviar confirmación" — DX-005).
   */
  onSelectAppointment?: (appointment: Appointment) => void;
  /**
   * DX-200: botones rápidos del flujo en la clínica (Llegó, En sillón…) de cada
   * fila; nada si no devuelve nada.
   */
  renderActions?: (appointment: Appointment) => ReactNode;
  /** DX-273: rol del usuario; de «Completada» solo salen ADMIN y DENTIST. */
  role?: ClinicRole | null;
  /**
   * Nombre del profesional de la cita. Con él, la lista dice quién atiende
   * (columna en la tabla, línea en la tarjeta): en el teléfono la lista es la
   * agenda de toda la clínica.
   */
  providerName?: (providerId: string) => string | undefined;
}

function DetailButton({
  appointment,
  timeRange,
  onSelect,
}: {
  appointment: Appointment;
  timeRange: string;
  onSelect: (appointment: Appointment) => void;
}) {
  return (
    <button
      type="button"
      aria-label={copy.detailLabel(timeRange)}
      onClick={() => onSelect(appointment)}
      className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
    >
      {copy.detail}
      <ChevronRight aria-hidden className="size-3.5" />
    </button>
  );
}

interface StatusSelectProps {
  appointment: Appointment;
  timeRange: string;
  onStatusChange: (
    appointmentId: string,
    status: AppointmentStatus,
    trigger?: HTMLElement | null,
  ) => void;
  updating: boolean;
  role?: ClinicRole | null;
}

/**
 * Interactive status control for one appointment row — a single colored pill
 * that both SHOWS the current status (tinted with the same semantic token as
 * `StatusBadge`) and lets the user CHANGE it. DX-295: `AppointmentStatusSelect`
 * (no un `<select>` nativo), así que las flechas no cambian la cita: solo se
 * aplica con Enter o con un clic/toque en una opción. Rendered once per row
 * per responsive variant when `onStatusChange` is passed to `DayAgenda`.
 */
function StatusSelect({ appointment, timeRange, onStatusChange, updating, role }: StatusSelectProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <AppointmentStatusSelect
        variant="chip"
        label={copy.statusSelectLabel(timeRange)}
        data-testid="appointment-status-select"
        value={appointment.status}
        options={statusOptionsFor(appointment.status, role)}
        disabled={updating}
        onChange={(status, trigger) => onStatusChange(appointment.id, status, trigger)}
      />
      {updating && (
        <span role="status" className="text-xs text-muted">
          {copy.updatingStatus}
        </span>
      )}
    </span>
  );
}

/**
 * Presentational day agenda for a single provider: renders whatever
 * `appointments` it's given (already scoped to a day/provider by the caller
 * via `listAppointments({ from, to, providerId })`), sorted by `start` ASC.
 * Fetching, the day/provider selectors and the "new appointment" flow live
 * in the `/agenda` page (Task 5) — this component owns rendering only, so
 * it stays a plain (server-renderable) component with no state of its own.
 */
export function DayAgenda({
  appointments,
  clock,
  loading,
  error,
  onRetry,
  patientNames,
  onStatusChange,
  updatingId,
  onSelectAppointment,
  renderActions,
  role,
  providerName,
}: DayAgendaProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2" role="status">
        <span className="sr-only">{copy.loading}</span>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3.5"
          >
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <SectionError description={error || copy.genericLoadError} onRetry={onRetry} />;
  }

  if (appointments.length === 0) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center"
      >
        <CalendarDays aria-hidden className="h-8 w-8 text-muted" />
        <p className="text-sm font-medium text-ink">{copy.empty}</p>
        <p className="text-sm text-muted">{copy.emptyHint}</p>
      </div>
    );
  }

  const sorted = [...appointments].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  return (
    // CONTAINER query, not a viewport one: this list renders both full-width on
    // the page (Día view) and inside the agenda's ~384px day drawer. Keyed on
    // the viewport (`md:`), the wide 4-column table used to render — and get
    // clipped — inside the narrow drawer. `@container` + `@[40rem]` switches
    // on the space this component actually has. 40rem, not 42: at 1280 px the
    // agenda's side column (En clínica · Pendientes) leaves the Día ~664 px,
    // and a desktop must keep the table (the drawer is ~384 px either way).
    <div className="@container">
      {/* Wide table — `hidden @[40rem]:block` on the WRAPPER (not the <table>, which
          would drop table-layout and collapse the columns to content width). */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface @[40rem]:block">
        <table aria-label={copy.heading} className="w-full border-collapse text-sm text-ink">
          <caption className="sr-only">{copy.heading}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left">
              <th scope="col" className="px-4 py-2.5 text-xs font-medium tracking-wide text-muted">
                {copy.colTime}
              </th>
              <th scope="col" className="px-4 py-2.5 text-xs font-medium tracking-wide text-muted">
                {copy.colPatient}
              </th>
              {providerName && (
                <th scope="col" className="px-4 py-2.5 text-xs font-medium tracking-wide text-muted">
                  {copy.colProvider}
                </th>
              )}
              <th scope="col" className="px-4 py-2.5 text-xs font-medium tracking-wide text-muted">
                {copy.colReason}
              </th>
              <th scope="col" className="px-4 py-2.5 text-xs font-medium tracking-wide text-muted">
                {copy.colStatus}
              </th>
              {onSelectAppointment && (
                <th scope="col" className="px-4 py-2.5">
                  <span className="sr-only">{copy.detail}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((appointment) => {
              const timeRange = sedeTimeRange(appointment.start, appointment.end, clock.of(appointment.locationId));
              const updating = updatingId === appointment.id;
              return (
                <tr
                  key={appointment.id}
                  className="border-b border-hairline transition-colors last:border-0 hover:bg-surface-2"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums text-ink">
                    <time dateTime={appointment.start}>{timeRange}</time>
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">
                    <span className="flex flex-wrap items-center gap-2">
                      {patientLabel(appointment, patientNames)}
                      <MedicalAlertIndicator
                        flags={appointment.medicalAlerts}
                        patientName={patientLabel(appointment, patientNames)}
                      />
                      <ConfirmationBadge appointment={appointment} />
                      <OverdueChip balance={appointment.balance} />
                      <CoverageChip coverage={appointment.coverage} compact />
                      <AttendanceBadge counts={appointment.attendance} />
                    </span>
                    {renderActions?.(appointment)}
                  </td>
                  {providerName && (
                    <td className="px-4 py-3 text-ink">
                      {providerName(appointment.providerId) ?? copy.reasonFallback}
                    </td>
                  )}
                  <td className="px-4 py-3 text-muted">
                    {appointment.reason ?? copy.reasonFallback}
                  </td>
                  <td className="px-4 py-3">
                    {onStatusChange ? (
                      <StatusSelect
                        appointment={appointment}
                        timeRange={timeRange}
                        onStatusChange={onStatusChange}
                        role={role}
                        updating={updating}
                      />
                    ) : (
                      <StatusBadge status={appointment.status} />
                    )}
                  </td>
                  {onSelectAppointment && (
                    <td className="px-4 py-3 text-right">
                      <DetailButton
                        appointment={appointment}
                        timeRange={timeRange}
                        onSelect={onSelectAppointment}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Narrow-container cards (mobile, and the day drawer on any screen) */}
      <ul aria-label={copy.heading} className="flex flex-col gap-3 @[40rem]:hidden">
        {sorted.map((appointment) => {
          const timeRange = sedeTimeRange(appointment.start, appointment.end, clock.of(appointment.locationId));
          const updating = updatingId === appointment.id;
          const label = `${timeRange} · ${patientLabel(appointment, patientNames)} · ${STATUS_LABELS[appointment.status]}`;
          return (
            <li
              key={appointment.id}
              aria-label={label}
              className="rounded-xl border border-border bg-surface p-4 text-sm text-ink"
            >
              <div className="flex items-center justify-between gap-2">
                <time dateTime={appointment.start} className="font-medium tabular-nums text-ink">
                  {timeRange}
                </time>
                {!onStatusChange && <StatusBadge status={appointment.status} />}
              </div>
              <p className="mt-2 flex items-center gap-2 font-medium text-ink">
                {patientLabel(appointment, patientNames)}
                <MedicalAlertIndicator
                  flags={appointment.medicalAlerts}
                  patientName={patientLabel(appointment, patientNames)}
                  size="default"
                />
              </p>
              <p className="mt-0.5 text-muted">
                {[providerName?.(appointment.providerId), appointment.reason ?? copy.reasonFallback]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <ConfirmationBadge appointment={appointment} className="mt-2" />
              <OverdueChip balance={appointment.balance} className="mt-2" />
              <CoverageChip coverage={appointment.coverage} compact className="mt-2" />
              <AttendanceBadge counts={appointment.attendance} className="mt-2" />
              {renderActions?.(appointment)}
              {(onStatusChange || onSelectAppointment) && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  {onStatusChange ? (
                    <StatusSelect
                      appointment={appointment}
                      timeRange={timeRange}
                      onStatusChange={onStatusChange}
                        role={role}
                      updating={updating}
                    />
                  ) : (
                    <span />
                  )}
                  {onSelectAppointment && (
                    <DetailButton
                      appointment={appointment}
                      timeRange={timeRange}
                      onSelect={onSelectAppointment}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
