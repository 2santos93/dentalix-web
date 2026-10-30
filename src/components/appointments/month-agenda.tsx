'use client';
import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';
import { monthGridDays } from '@/lib/appointments/calendar-grid';
import { civilDateLabel } from '@/lib/format/date';
import { sedeTime, type AgendaClock } from '@/lib/locations/sede-clock';
import { wallDay } from '@/lib/time/wall-clock';
import { patientLabel } from './appointment-display';
import { MedicalAlertIndicator } from '@/components/clinical/medical-alert-indicator';
import { SectionError } from '@/components/errors/section-error';

// Copy as constants (i18n-ready, es-first) — matches day-agenda.tsx convention.
const copy = {
  loading: 'Cargando calendario…',
  genericLoadError: 'No pudimos cargar el calendario.',
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
  ARRIVED: 'bg-ink',
  IN_CHAIR: 'bg-primary',
  READY_FOR_CHECKOUT: 'bg-success',
};

interface MonthAgendaProps {
  /** Appointments across the whole visible grid range (see `monthGridRange`). */
  appointments: Appointment[];
  /** DX-378: la sede de la pantalla cuenta los días; cada hora sale con el reloj de la sede de su cita. */
  clock: AgendaClock;
  /** Any civil `YYYY-MM-DD` inside the month to render. */
  monthDate: string;
  /** The currently selected day (`YYYY-MM-DD`) — its cell is highlighted. */
  selectedDate: string;
  /** Today in the sede (`YYYY-MM-DD`), passed in so the component stays pure/testable. */
  today: string;
  onSelectDay: (date: string) => void;
  patientNames?: Record<string, string>;
  loading: boolean;
  error?: string | null;
  /** Retries the load that produced `error` — renders as `SectionError`'s own retry button. */
  onRetry?: () => void;
  /** Max appointment chips per cell before collapsing to "+N más" (default 3). */
  maxPerCell?: number;
}

/** Groups appointments by their day in the sede zone (`YYYY-MM-DD`), each list sorted by start ASC. */
function groupByDay(appointments: Appointment[], timeZone: string): Record<string, Appointment[]> {
  const map: Record<string, Appointment[]> = {};
  for (const a of appointments) {
    (map[wallDay(a.start, timeZone)] ??= []).push(a);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }
  return map;
}

function longDayLabel(date: string): string {
  return civilDateLabel(date, { day: 'numeric', month: 'long' });
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
  clock,
  monthDate,
  selectedDate,
  today,
  onSelectDay,
  patientNames,
  loading,
  error,
  onRetry,
  maxPerCell = 3,
}: MonthAgendaProps) {
  if (error) {
    return <SectionError description={error || copy.genericLoadError} onRetry={onRetry} />;
  }

  const days = monthGridDays(monthDate);
  const byDay = groupByDay(appointments, clock.timeZone);

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
            <div
              key={day.date}
              data-testid="calendar-day"
              data-date={day.date}
              className={[
                'relative flex min-w-0 min-h-[76px] flex-col gap-1 border-b border-r border-hairline p-1.5 text-left align-top transition-colors md:min-h-[104px]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                day.inMonth ? 'hover:bg-surface-2' : 'bg-surface-2/40 hover:bg-surface-2',
                isSelected ? 'ring-2 ring-inset ring-primary' : '',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day.date)}
                aria-pressed={isSelected}
                aria-label={copy.dayLabel(longDayLabel(day.date), count)}
                className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              />
              <div className="pointer-events-none relative flex items-center justify-between">
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

              {/* A single row per appointment at every width. 48 px keeps the
                  indicator's 44 px touch area clear of neighbouring alerts. */}
              <div className="pointer-events-none relative flex min-w-0 flex-col">
                {visible.map((a) => (
                  <span
                    key={a.id}
                    data-testid="month-appointment"
                    className="relative flex min-h-12 min-w-0 items-center justify-center gap-1 rounded text-[11px] leading-tight text-ink md:justify-start md:bg-surface-2 md:px-1"
                  >
                    <span aria-hidden className={`hidden h-1.5 w-1.5 shrink-0 rounded-full md:inline ${STATUS_DOT[a.status]}`} />
                    <span className="hidden shrink-0 tabular-nums text-muted md:inline">{sedeTime(a.start, clock.of(a.locationId))}</span>
                    <span className="hidden min-w-0 flex-1 truncate md:inline">{patientLabel(a, patientNames)}</span>
                    <MedicalAlertIndicator
                      flags={a.medicalAlerts}
                      patientName={patientLabel(a, patientNames)}
                      className="pointer-events-auto md:mr-1"
                    />
                    <span aria-hidden className={`absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full md:hidden ${STATUS_DOT[a.status]}`} />
                  </span>
                ))}
                {overflow > 0 && (
                  <span className="text-center text-[10px] font-medium text-muted md:px-1 md:text-left md:text-[11px]">{copy.more(overflow)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
