import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';

// Copy as constants (i18n-ready, es-first) — matches patients-table.tsx /
// clinical-entries-list.tsx convention until next-intl wiring lands.
const copy = {
  loading: 'Cargando agenda…',
  empty: 'No hay citas para este día.',
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
};

// One semantic-token class per status — never a raw color utility
// (`bg-*-500`, `text-[#...]`). SCHEDULED/CONFIRMED use the neutral/brand
// tokens (nothing has happened yet / it's been acknowledged); COMPLETED maps
// to success, CANCELLED to danger, NO_SHOW to warning (attention-worthy but
// not an error).
const STATUS_BADGE_CLASSES: Record<AppointmentStatus, string> = {
  SCHEDULED: 'border-muted bg-muted/10 text-muted',
  CONFIRMED: 'border-primary bg-primary/10 text-primary',
  COMPLETED: 'border-success bg-success/10 text-success',
  CANCELLED: 'border-danger bg-danger/10 text-danger',
  NO_SHOW: 'border-warning bg-warning/10 text-warning',
};

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
}

function formatTimeRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  return `${fmt(start)}–${fmt(end)}`;
}

function patientLabel(appointment: Appointment, patientNames?: Record<string, string>): string {
  return patientNames?.[appointment.patientId] ?? appointment.patientId;
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      data-testid="appointment-status-badge"
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}
    >
      {copy.statusLabels[status]}
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
export function DayAgenda({ appointments, loading, error, patientNames }: DayAgendaProps) {
  if (loading) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.loading}
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {error || copy.genericLoadError}
      </p>
    );
  }

  if (appointments.length === 0) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.empty}
      </p>
    );
  }

  const sorted = [...appointments].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  return (
    <>
      {/* Desktop table */}
      <table
        aria-label={copy.heading}
        className="hidden md:block w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink"
      >
        <caption className="sr-only">{copy.heading}</caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              {copy.colTime}
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              {copy.colPatient}
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              {copy.colReason}
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              {copy.colStatus}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((appointment) => (
            <tr key={appointment.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 text-ink">
                <time dateTime={appointment.start}>
                  {formatTimeRange(appointment.start, appointment.end)}
                </time>
              </td>
              <td className="px-4 py-3 text-ink">{patientLabel(appointment, patientNames)}</td>
              <td className="px-4 py-3 text-ink">{appointment.reason ?? copy.reasonFallback}</td>
              <td className="px-4 py-3">
                <StatusBadge status={appointment.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <ul aria-label={copy.heading} className="flex flex-col gap-3 md:hidden">
        {sorted.map((appointment) => {
          const label = `${formatTimeRange(appointment.start, appointment.end)} · ${patientLabel(appointment, patientNames)} · ${copy.statusLabels[appointment.status]}`;
          return (
            <li
              key={appointment.id}
              aria-label={label}
              className="rounded-lg border border-border bg-surface p-4 text-sm text-ink"
            >
              <div className="flex items-center justify-between gap-2">
                <time dateTime={appointment.start} className="font-medium text-ink">
                  {formatTimeRange(appointment.start, appointment.end)}
                </time>
                <StatusBadge status={appointment.status} />
              </div>
              <p className="mt-2 text-ink">{patientLabel(appointment, patientNames)}</p>
              <p className="mt-1 text-muted">{appointment.reason ?? copy.reasonFallback}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
