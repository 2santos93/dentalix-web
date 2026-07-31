'use client';
import { CalendarDays, ChevronDown } from 'lucide-react';
import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';
import { StatusBadge, STATUS_BADGE_CLASSES, formatTimeRange, patientLabel } from './appointment-display';
import { Skeleton } from '@/components/ui/skeleton';

// Copy as constants (i18n-ready, es-first) — matches patients-table.tsx /
// clinical-entries-list.tsx convention until next-intl wiring lands.
const copy = {
  loading: 'Cargando agenda…',
  empty: 'No hay citas para este día.',
  emptyHint: 'Crea una nueva cita para empezar a llenar el día.',
  genericLoadError: 'No pudimos cargar la agenda. Intenta de nuevo.',
  colTime: 'Hora',
  colPatient: 'Paciente',
  colReason: 'Motivo',
  colStatus: 'Estado',
  reasonFallback: '—',
  heading: 'Agenda del día',
  statusLabels: {
    SCHEDULED: 'Agendada',
    CONFIRMED: 'Confirmada',
    COMPLETED: 'Completada',
    CANCELLED: 'Cancelada',
    NO_SHOW: 'No asistió',
  } satisfies Record<AppointmentStatus, string>,
  /** `aria-label` for the status <select>, filled in with the row's time range — e.g. "Estado de la cita de 09:00–09:30". */
  statusSelectLabel: (timeRange: string) => `Estado de la cita de ${timeRange}`,
  updatingStatus: 'Actualizando…',
};

// Fixed display order for the status <select> options — same 5 values as
// `STATUS_BADGE_CLASSES`, order matches the natural appointment lifecycle.
const STATUS_OPTIONS: AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

interface DayAgendaProps {
  /** Appointments to render — any order; this component sorts by `start` ASC. */
  appointments: Appointment[];
  loading: boolean;
  /** Error message to show instead of the list/empty state, if loading failed. */
  error?: string | null;
  /**
   * Optional `patientId -> fullName` lookup (e.g. built from `GET /patients`
   * by the page in Task 5). Falls back to the raw `patientId` when a
   * patient isn't in the map — the appointment itself never carries a name.
   */
  patientNames?: Record<string, string>;
  /**
   * When provided, each row renders a status `<select>` (in addition to the
   * read-only badge) letting the caller change an appointment's status —
   * see `AgendaView.handleStatusChange`. When omitted, rows render the
   * badge only (read-only) — existing callers/tests are unaffected.
   */
  onStatusChange?: (appointmentId: string, status: AppointmentStatus) => void;
  /** The `id` of the appointment currently being updated, if any — disables that row's status select and shows a small "Actualizando…" hint next to it. */
  updatingId?: string | null;
}

interface StatusSelectProps {
  appointment: Appointment;
  timeRange: string;
  onStatusChange: (appointmentId: string, status: AppointmentStatus) => void;
  updating: boolean;
}

/**
 * Interactive status control for one appointment row — a single colored pill
 * that both SHOWS the current status (tinted with the same semantic token as
 * `StatusBadge`) and lets the user CHANGE it. A native `<select>` under the
 * hood (kept for a11y + `selectOptions` tests), styled `appearance-none` with
 * a chevron so it reads as one status chip instead of a bare dropdown stacked
 * under a badge. Rendered once per row per responsive variant when
 * `onStatusChange` is passed to `DayAgenda`.
 */
function StatusSelect({ appointment, timeRange, onStatusChange, updating }: StatusSelectProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-flex items-center">
        <select
          aria-label={copy.statusSelectLabel(timeRange)}
          data-testid="appointment-status-select"
          value={appointment.status}
          disabled={updating}
          onChange={(e) => onStatusChange(appointment.id, e.target.value as AppointmentStatus)}
          className={`cursor-pointer appearance-none rounded-full border py-1 pl-3 pr-7 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60 ${STATUS_BADGE_CLASSES[appointment.status]}`}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status} className="bg-surface font-normal text-ink">
              {copy.statusLabels[status]}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2 h-3.5 w-3.5 opacity-70"
        />
      </span>
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
  loading,
  error,
  patientNames,
  onStatusChange,
  updatingId,
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
    return (
      <div
        role="alert"
        className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm font-medium text-danger"
      >
        {error || copy.genericLoadError}
      </div>
    );
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
    // clipped — inside the narrow drawer. `@container` + `@2xl` (42rem) switches
    // on the space this component actually has.
    <div className="@container">
      {/* Wide table — `hidden @2xl:block` on the WRAPPER (not the <table>, which
          would drop table-layout and collapse the columns to content width). */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface @2xl:block">
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
              <th scope="col" className="px-4 py-2.5 text-xs font-medium tracking-wide text-muted">
                {copy.colReason}
              </th>
              <th scope="col" className="px-4 py-2.5 text-xs font-medium tracking-wide text-muted">
                {copy.colStatus}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((appointment) => {
              const timeRange = formatTimeRange(appointment.start, appointment.end);
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
                    {patientLabel(appointment, patientNames)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {appointment.reason ?? copy.reasonFallback}
                  </td>
                  <td className="px-4 py-3">
                    {onStatusChange ? (
                      <StatusSelect
                        appointment={appointment}
                        timeRange={timeRange}
                        onStatusChange={onStatusChange}
                        updating={updating}
                      />
                    ) : (
                      <StatusBadge status={appointment.status} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Narrow-container cards (mobile, and the day drawer on any screen) */}
      <ul aria-label={copy.heading} className="flex flex-col gap-3 @2xl:hidden">
        {sorted.map((appointment) => {
          const timeRange = formatTimeRange(appointment.start, appointment.end);
          const updating = updatingId === appointment.id;
          const label = `${timeRange} · ${patientLabel(appointment, patientNames)} · ${copy.statusLabels[appointment.status]}`;
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
              <p className="mt-2 font-medium text-ink">
                {patientLabel(appointment, patientNames)}
              </p>
              <p className="mt-0.5 text-muted">{appointment.reason ?? copy.reasonFallback}</p>
              {onStatusChange && (
                <div className="mt-3">
                  <StatusSelect
                    appointment={appointment}
                    timeRange={timeRange}
                    onStatusChange={onStatusChange}
                    updating={updating}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
