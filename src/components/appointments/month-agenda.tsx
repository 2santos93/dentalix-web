'use client';
import { TriangleAlert } from 'lucide-react';
import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';
import { monthGridDays } from '@/lib/appointments/calendar-grid';
import { civilDateLabel } from '@/lib/format/date';
import { sedeTime, type AgendaClock } from '@/lib/locations/sede-clock';
import { wallDay } from '@/lib/time/wall-clock';
import { patientLabel, patientShortLabel, STATUS_LABELS } from './appointment-display';
import { STATUS_PRESENTATION, statusTone, TONE_CLASSES, type StatusTone } from '@/lib/status/tones';
import { medicalAlertSeverity, medicalAlertSummary, MEDICAL_ALERTS_TITLE } from '@/lib/clinical/medical-alerts';
import { SectionError } from '@/components/errors/section-error';
import { cn } from '@/lib/utils';

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
  legend: 'Leyenda de estados',
};

// Punto por estado: el tono del mapa único (`@/lib/status/tones`), nunca el acento.
const statusDot = (s: AppointmentStatus) => TONE_CLASSES[statusTone('appointment', s)].dot;

/** Una cita que ya no ocupa la silla se lee tachada: forma además de color. */
const isInactive = (s: AppointmentStatus) => s === 'CANCELLED' || s === 'NO_SHOW';

/**
 * En el Mes solo se marca la alerta que de verdad importa antes de abrir la
 * cita: la crítica (premedicación, alergias…). La anamnesis caducada o
 * ausente salía en casi todas las citas y dejaba de avisar; vive en el Día,
 * la Semana y el detalle de la cita.
 */
const hasCriticalAlert = (a: Appointment) => medicalAlertSeverity(a.medicalAlerts) === 'critical';

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
  /**
   * Teléfono: cada celda es el número del día y un punto por cita (hasta
   * `maxPerCell`); la lista del día elegido la pinta quien llama, debajo. Un
   * chip de 50 px no deja leer ni la hora ni el nombre.
   */
  compact?: boolean;
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
 * cell shows up to `maxPerCell` one-line chips («09:00 Laura C.» with the
 * status dot), then a quiet "+N más"; the whole cell is a button that selects
 * the day (the caller shows that day's list — see `AgendaView`).
 * Presentational: all fetching lives in `AgendaView`.
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
  compact = false,
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
      className={cn('overflow-hidden rounded-xl border border-border bg-surface', loading && 'animate-pulse')}
    >
      {loading && <span className="sr-only" role="status">{copy.loading}</span>}

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border bg-surface-sunken">
        {copy.weekdays.map((wd) => (
          <div key={wd} className="t-caption px-2 py-2 text-center font-medium text-muted">
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
              data-today={isToday || undefined}
              className={cn(
                'relative flex min-w-0 flex-col border-b border-r border-border-subtle text-left align-top transition-colors',
                compact ? 'min-h-14 items-center gap-1 p-1' : 'min-h-[104px] gap-1 p-1.5',
                isToday
                  ? 'bg-primary-subtle'
                  : day.inMonth
                    ? 'hover:bg-surface-sunken'
                    : 'bg-surface-sunken/60 hover:bg-surface-sunken',
                isSelected && 'ring-2 ring-inset ring-primary',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day.date)}
                aria-pressed={isSelected}
                aria-label={copy.dayLabel(longDayLabel(day.date), count)}
                className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              />
              <span
                className={cn(
                  'pointer-events-none relative inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums',
                  isToday
                    ? 'font-semibold text-primary-subtle-text'
                    : day.inMonth
                      ? 'font-medium text-ink'
                      : 'text-faint',
                )}
              >
                {dayNum}
              </span>

              {compact ? (
                // Teléfono: densidad y estado, sin texto que no cabe.
                count > 0 ? (
                  <span aria-hidden className="pointer-events-none relative flex items-center gap-0.5">
                    {visible.map((a) => (
                      <span
                        key={a.id}
                        data-testid="month-appointment"
                        className={cn('size-1.5 rounded-full', statusDot(a.status), isInactive(a.status) && 'opacity-50')}
                      />
                    ))}
                    {overflow > 0 ? <span className="text-xs leading-none font-medium text-muted">+</span> : null}
                  </span>
                ) : null
              ) : (
                <div className={cn('pointer-events-none relative flex min-w-0 flex-col gap-0.5', !day.inMonth && 'opacity-70')}>
                  {visible.map((a) => {
                    const full = patientLabel(a, patientNames);
                    const critical = hasCriticalAlert(a);
                    const alertText = critical ? medicalAlertSummary(a.medicalAlerts) : null;
                    return (
                      <span
                        key={a.id}
                        data-testid="month-appointment"
                        data-status={a.status}
                        title={[full, STATUS_LABELS[a.status], alertText].filter(Boolean).join(' · ')}
                        className={cn(
                          'flex h-5 min-w-0 items-center gap-[3px] rounded px-1 text-xs leading-none text-ink',
                          isToday ? 'bg-surface/80' : 'bg-surface-sunken',
                        )}
                      >
                        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', statusDot(a.status))} />
                        <span className="shrink-0 tabular-nums text-muted">
                          {sedeTime(a.start, clock.of(a.locationId))}
                        </span>
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate font-medium',
                            isInactive(a.status) && 'text-muted line-through',
                          )}
                        >
                          {patientShortLabel(a, patientNames)}
                        </span>
                        <span className="sr-only">{`, ${STATUS_LABELS[a.status]}`}</span>
                        {critical ? (
                          // Marca de 12 px, no un botón: la celda entera es el
                          // objetivo y el detalle (lista del día, ficha de la
                          // cita) trae las alertas completas.
                          <span data-testid="month-alert-marker" className="inline-flex shrink-0 text-danger-text">
                            <TriangleAlert aria-hidden className="size-3" />
                            <span className="sr-only">{`, ${alertText}`}</span>
                          </span>
                        ) : null}
                      </span>
                    );
                  })}
                  {overflow > 0 && (
                    <span className="px-1 text-xs font-medium text-muted underline decoration-border-input underline-offset-2">
                      {copy.more(overflow)}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Los tonos de la cita, agrupados como los ve la agenda (derivados del mapa único). */
function appointmentToneGroups(): { tone: StatusTone; labels: string[] }[] {
  const order: StatusTone[] = ['neutral', 'info', 'warning', 'success', 'danger'];
  const entries = Object.values(STATUS_PRESENTATION.appointment);
  return order
    .map((tone) => ({ tone, labels: entries.filter((e) => e.tone === tone).map((e) => e.label) }))
    .filter((g) => g.labels.length > 0);
}

/**
 * Leyenda compacta de los puntos de estado (y del icono de alerta del Mes).
 * Un color sin leyenda no dice nada; el texto sale del mapa único de estados.
 */
export function AgendaStatusLegend({ showAlert = false, className }: { showAlert?: boolean; className?: string }) {
  return (
    <ul
      aria-label={copy.legend}
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 t-caption text-muted', className)}
    >
      {appointmentToneGroups().map(({ tone, labels }) => (
        <li key={tone} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_CLASSES[tone].dot)} />
          {labels.join(' · ')}
        </li>
      ))}
      {showAlert ? (
        <li className="inline-flex items-center gap-1.5">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-danger-text" />
          {MEDICAL_ALERTS_TITLE}
        </li>
      ) : null}
    </ul>
  );
}
