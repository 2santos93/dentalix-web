'use client';
import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';

// Copy as constants (i18n-ready, es-first) — matches day-agenda.tsx's convention.
const copy = {
  loading: 'Cargando agenda…',
  genericLoadError: 'No pudimos cargar la agenda. Intenta de nuevo.',
  emptyDay: 'Sin citas',
  heading: 'Agenda de la semana',
  statusLabels: {
    SCHEDULED: 'Agendada',
    CONFIRMED: 'Confirmada',
    COMPLETED: 'Completada',
    CANCELLED: 'Cancelada',
    NO_SHOW: 'No asistió',
  } satisfies Record<AppointmentStatus, string>,
};

// Mirrored from `day-agenda.tsx` rather than imported/refactored — neither
// `STATUS_BADGE_CLASSES`, `formatTimeRange`, `patientLabel` nor `StatusBadge`
// are exported there, and hoisting them into a shared module is a bigger,
// riskier change than this task's scope (see AGENTS-facing task brief). Kept
// byte-for-byte identical so the two views stay visually consistent.
const STATUS_BADGE_CLASSES: Record<AppointmentStatus, string> = {
  SCHEDULED: 'border-muted bg-muted/10 text-muted',
  CONFIRMED: 'border-primary bg-primary/10 text-primary',
  COMPLETED: 'border-success bg-success/10 text-success',
  CANCELLED: 'border-danger bg-danger/10 text-danger',
  NO_SHOW: 'border-warning bg-warning/10 text-warning',
};

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

/** Local (not UTC) `YYYY-MM-DD` for the instant `iso` represents — same convention as `day-range.ts`'s date-string inputs, used here to bucket appointments by their local calendar day. */
function localDateString(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** The 7 `YYYY-MM-DD` local dates of the week starting at `weekStart` (expected to be a Monday, e.g. from `localWeekRange`'s implicit boundary) — Mon..Sun. */
function weekDates(weekStart: string): string[] {
  const monday = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

/** Header label for a day column, e.g. "lun, 09/03". */
function dayHeaderLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

interface WeekAgendaProps {
  /** Appointments to render — any order; grouped by local day and sorted by `start` ASC within each day. */
  appointments: Appointment[];
  /** `YYYY-MM-DD` local date of the Monday starting this week (e.g. `localWeekRange`'s implicit boundary). */
  weekStart: string;
  loading: boolean;
  /** Error message to show instead of the grid, if loading failed. */
  error?: string | null;
  /** Optional `patientId -> fullName` lookup — see `DayAgenda`'s prop of the same name. */
  patientNames?: Record<string, string>;
  /** Called with a day's `YYYY-MM-DD` local date when its header is clicked. */
  onSelectDay: (date: string) => void;
}

/**
 * Presentational week agenda: a 7-column Mon..Sun grid. Each column groups
 * `appointments` falling on that local day (sorted by `start` ASC) and shows
 * time + patient + status badge per appointment — read-only, no status
 * <select> and no drag-and-drop (out of scope for the week view, see
 * `day-agenda.tsx` for those). Clicking a day header calls `onSelectDay` so
 * the caller (`AgendaView`) can switch back to the day view on that date.
 */
export function WeekAgenda({
  appointments,
  weekStart,
  loading,
  error,
  patientNames,
  onSelectDay,
}: WeekAgendaProps) {
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

  const dates = weekDates(weekStart);
  const byDay = new Map<string, Appointment[]>();
  for (const apt of appointments) {
    const day = localDateString(apt.start);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(apt);
    else byDay.set(day, [apt]);
  }

  return (
    <div
      aria-label={copy.heading}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7"
    >
      {dates.map((date) => {
        const dayAppointments = (byDay.get(date) ?? []).sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
        );
        return (
          <div
            key={date}
            data-testid="week-day-column"
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
          >
            <button
              type="button"
              data-testid="week-day-header"
              data-date={date}
              onClick={() => onSelectDay(date)}
              className="text-left text-sm font-medium text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded"
            >
              {dayHeaderLabel(date)}
            </button>
            <ul className="flex flex-col gap-2">
              {dayAppointments.length === 0 ? (
                <li className="text-xs text-muted">{copy.emptyDay}</li>
              ) : (
                dayAppointments.map((appointment) => (
                  <li
                    key={appointment.id}
                    className="rounded-md border border-border p-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <time dateTime={appointment.start} className="text-ink">
                        {formatTimeRange(appointment.start, appointment.end)}
                      </time>
                      <StatusBadge status={appointment.status} />
                    </div>
                    <p className="mt-1 text-ink">{patientLabel(appointment, patientNames)}</p>
                  </li>
                ))
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
