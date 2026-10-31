'use client';
import type { Appointment } from '@/lib/appointments/appointments-api';
import { StatusBadge, patientLabel } from './appointment-display';
import { SectionError } from '@/components/errors/section-error';
import { sedeTimeRange, type AgendaClock } from '@/lib/locations/sede-clock';
import { addCivilDays, wallDay } from '@/lib/time/wall-clock';
import { weekDayHeader } from '@/lib/appointments/calendar-grid';

// Copy as constants (i18n-ready, es-first) — matches day-agenda.tsx's convention.
const copy = {
  loading: 'Cargando agenda…',
  genericLoadError: 'No pudimos cargar la agenda.',
  emptyDay: 'Sin citas',
  heading: 'Agenda de la semana',
};

/** The 7 civil `YYYY-MM-DD` days of the week starting at `weekStart` (a Monday) — Mon..Sun. */
function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addCivilDays(weekStart, i));
}

interface WeekAgendaProps {
  /** Appointments to render — any order; grouped by day of the sede and sorted by `start` ASC within each day. */
  appointments: Appointment[];
  /** DX-378: la sede de la pantalla cuenta los días; cada hora sale con el reloj de la sede de su cita. */
  clock: AgendaClock;
  /** Civil `YYYY-MM-DD` of the Monday starting this week. */
  weekStart: string;
  loading: boolean;
  /** Error message to show instead of the grid, if loading failed. */
  error?: string | null;
  /**
   * Retries the load that produced `error` — renders as `SectionError`'s own
   * retry button. NOT wired today: `WeekAgenda` itself isn't rendered
   * anywhere in the app (`agenda-view.tsx`'s Semana view uses `WeekTimeGrid`
   * instead, whose hand-rolled error branch has its own retry) — this prop
   * only exists for parity with `DayAgenda`/`MonthAgenda` and is exercised by
   * this component's own test, not by a real caller.
   */
  onRetry?: () => void;
  /** Optional `patientId -> fullName` lookup — see `DayAgenda`'s prop of the same name. */
  patientNames?: Record<string, string>;
  /** Called with a day's `YYYY-MM-DD` local date when its header is clicked. */
  onSelectDay: (date: string) => void;
}

/**
 * Presentational week agenda: a 7-column Mon..Sun grid. Each column groups
 * `appointments` falling on that local day (sorted by `start` ASC) and shows
 * time + patient + status badge per appointment — read-only, no status
 * status select and no drag-and-drop (out of scope for the week view, see
 * `day-agenda.tsx` for those). Clicking a day header calls `onSelectDay` so
 * the caller (`AgendaView`) can switch back to the day view on that date.
 */
export function WeekAgenda({
  appointments,
  clock,
  weekStart,
  loading,
  error,
  onRetry,
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
    return <SectionError description={error || copy.genericLoadError} onRetry={onRetry} />;
  }

  const dates = weekDates(weekStart);
  const byDay = new Map<string, Appointment[]>();
  for (const apt of appointments) {
    const day = wallDay(apt.start, clock.timeZone);
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
              className="text-left text-sm font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text rounded"
            >
              {weekDayHeader(date, clock.fmt)}
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
                        {sedeTimeRange(appointment.start, appointment.end, clock.of(appointment.locationId))}
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
