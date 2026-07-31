'use client';
import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';
import { monthGridDays } from '@/lib/appointments/calendar-grid';
import { formatTime } from '@/lib/format/date';
import { patientLabel } from './appointment-display';

// Copy as constants (i18n-ready, es-first) — matches day-agenda.tsx convention.
const copy = {
  loading: 'Cargando calendario…',
  genericLoadError: 'No pudimos cargar el calendario. Intenta de nuevo.',
  heading: 'Calendario del mes',
  weekdays: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  more: (n: number) => `+${n} más`,
  /** cell aria-label, e.g. "15 de marzo · 3 citas". */
  dayLabel: (long: string, count: number) =>
    `${long} · ${count === 0 ? 'sin citas' : count === 1 ? '1 cita' : `${count} citas`}`,
};

// One neutral-safe dot color per status (semantic tokens only — never a raw
// color utility). Mirrors STATUS_BADGE_CLASSES' hue assignment.
const STATUS_DOT: Record<AppointmentStatus, string> = {
  SCHEDULED: 'bg-muted',
  CONFIRMED: 'bg-primary',
  COMPLETED: 'bg-success',
  CANCELLED: 'bg-danger',
  NO_SHOW: 'bg-warning',
};

interface MonthAgendaProps {
  /** Appointments across the whole visible grid range (see `monthGridRange`). */
  appointments: Appointment[];
  /** Any local `YYYY-MM-DD` inside the month to render. */
  monthDate: string;
  /** The currently selected day (`YYYY-MM-DD`) — its cell is highlighted. */
  selectedDate: string;
  /** Today's local `YYYY-MM-DD`, passed in so the component stays pure/testable. */
  today: string;
  onSelectDay: (date: string) => void;
  patientNames?: Record<string, string>;
  loading: boolean;
  error?: string | null;
  /** Max appointment chips per cell before collapsing to "+N más" (default 3). */
  maxPerCell?: number;
}

/** Groups appointments by their LOCAL day (`YYYY-MM-DD`), each list sorted by start ASC. */
function groupByDay(appointments: Appointment[]): Record<string, Appointment[]> {
  const map: Record<string, Appointment[]> = {};
  for (const a of appointments) {
    const d = new Date(a.start);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    (map[key] ??= []).push(a);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }
  return map;
}

function longDayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'long' });
}

/**
 * Month calendar grid (6 weeks × 7, Monday-first) for a single month. Each day
 * cell shows up to `maxPerCell` appointment chips (time + patient), then a
 * "+N más" hint; the whole cell is a button that selects the day (the caller
 * renders the selected day's full list + "new appointment" flow beside/below
 * this — see `AgendaView`). Presentational: all fetching lives in `AgendaView`.
 */
export function MonthAgenda({
  appointments,
  monthDate,
  selectedDate,
  today,
  onSelectDay,
  patientNames,
  loading,
  error,
  maxPerCell = 3,
}: MonthAgendaProps) {
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

  const days = monthGridDays(monthDate);
  const byDay = groupByDay(appointments);

  return (
    <div
      aria-label={copy.heading}
      aria-busy={loading || undefined}
      className={`overflow-hidden rounded-xl border border-border bg-surface ${loading ? 'animate-pulse' : ''}`}
    >
      {loading && <span className="sr-only" role="status">{copy.loading}</span>}

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border bg-surface-2">
        {copy.weekdays.map((wd) => (
          <div
            key={wd}
            className="px-2 py-2 text-center text-xs font-medium tracking-wide text-muted"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayAppts = byDay[day.date] ?? [];
          const count = dayAppts.length;
          const visible = dayAppts.slice(0, maxPerCell);
          const overflow = count - visible.length;
          const isToday = day.date === today;
          const isSelected = day.date === selectedDate;
          const dayNum = Number(day.date.slice(8, 10));

          return (
            <button
              type="button"
              key={day.date}
              onClick={() => onSelectDay(day.date)}
              aria-pressed={isSelected}
              aria-label={copy.dayLabel(longDayLabel(day.date), count)}
              data-testid="calendar-day"
              data-date={day.date}
              className={[
                'flex min-h-[76px] flex-col gap-1 border-b border-r border-hairline p-1.5 text-left align-top transition-colors md:min-h-[104px]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                day.inMonth ? 'hover:bg-surface-2' : 'bg-surface-2/40 hover:bg-surface-2',
                isSelected ? 'ring-2 ring-inset ring-primary' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <span
                  className={
                    isToday
                      ? 'inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground'
                      : `text-xs font-medium tabular-nums ${day.inMonth ? 'text-ink' : 'text-muted'}`
                  }
                >
                  {dayNum}
                </span>
                {count > 0 && (
                  <span
                    aria-hidden
                    className="rounded-full bg-surface-2 px-1.5 text-[10px] font-medium tabular-nums text-muted md:hidden"
                  >
                    {count}
                  </span>
                )}
              </div>

              {/* Desktop: chips with time + patient */}
              <div className="hidden flex-col gap-0.5 md:flex">
                {visible.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-1 truncate rounded bg-surface-2 px-1 py-0.5 text-[11px] leading-tight text-ink"
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[a.status]}`}
                    />
                    <span className="shrink-0 tabular-nums text-muted">{formatTime(a.start)}</span>
                    <span className="truncate">{patientLabel(a, patientNames)}</span>
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="px-1 text-[11px] font-medium text-muted">{copy.more(overflow)}</span>
                )}
              </div>

              {/* Mobile: compact dots */}
              {count > 0 && (
                <div className="flex flex-wrap gap-1 md:hidden">
                  {visible.map((a) => (
                    <span
                      key={a.id}
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[a.status]}`}
                    />
                  ))}
                  {overflow > 0 && <span aria-hidden className="text-[10px] leading-none text-muted">+{overflow}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
