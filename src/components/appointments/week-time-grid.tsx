'use client';
import { useEffect, useRef } from 'react';
import type { Appointment } from '@/lib/appointments/appointments-api';
import {
  ROW_HEIGHT_PX,
  GRID_HEIGHT_PX,
  SLOT_MINUTES,
  DAY_MINUTES,
  blockGeometry,
  layoutLanes,
} from '@/lib/appointments/week-grid-layout';
import { STATUS_BADGE_CLASSES, formatTimeRange, patientLabel } from './appointment-display';

const copy = {
  heading: 'Agenda de la semana',
  createSlotLabel: (date: string, time: string) => `Crear cita ${date} ${time}`,
};

const SLOTS_PER_DAY = DAY_MINUTES / SLOT_MINUTES; // 48

/** Local YYYY-MM-DD del instante `iso` (mismo criterio que week-agenda.tsx). */
function localDateString(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Los 7 YYYY-MM-DD (lun..dom) de la semana que empieza en `weekStart`. */
function weekDates(weekStart: string): string[] {
  const monday = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

/** Etiqueta de encabezado, p. ej. "lun, 09/03". */
function dayHeaderLabel(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/** "HH:mm" del slot `index` (0 => "00:00", 18 => "09:00"). */
function slotTime(index: number): string {
  const mins = index * SLOT_MINUTES;
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

interface WeekTimeGridProps {
  appointments: Appointment[];
  weekStart: string;
  patientNames?: Record<string, string>;
  onSelectDay: (date: string) => void;
  onSelectSlot: (date: string, startTime: string) => void;
  onSelectAppointment: (appointment: Appointment) => void;
}

export function WeekTimeGrid({
  appointments,
  weekStart,
  patientNames,
  onSelectDay,
  onSelectSlot,
  onSelectAppointment,
}: WeekTimeGridProps) {
  const dates = weekDates(weekStart);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll: a la primera cita de la semana, o a las 07:00 si no hay.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstStartMin = appointments.length
      ? Math.min(
          ...appointments.map((a) => {
            const d = new Date(a.start);
            return d.getHours() * 60 + d.getMinutes();
          }),
        )
      : 7 * 60;
    el.scrollTop = (firstStartMin / SLOT_MINUTES) * ROW_HEIGHT_PX;
  }, [appointments, weekStart]);

  return (
    <div
      aria-label={copy.heading}
      className="overflow-auto rounded-lg border border-border bg-surface"
      ref={scrollRef}
    >
      {/* min-width fuerza scroll horizontal en pantallas chicas */}
      <div className="grid min-w-[720px]" style={{ gridTemplateColumns: '4rem repeat(7, 1fr)' }}>
        {/* Fila de encabezados (sticky-top) */}
        <div className="sticky top-0 z-20 bg-surface" />
        {dates.map((date) => (
          <button
            key={date}
            type="button"
            data-testid="week-day-header"
            data-date={date}
            onClick={() => onSelectDay(date)}
            className="sticky top-0 z-20 border-b border-border bg-surface px-2 py-2 text-left text-sm font-medium text-ink hover:underline"
          >
            {dayHeaderLabel(date)}
          </button>
        ))}

        {/* Gutter de horas (sticky-left) */}
        <div className="sticky left-0 z-10 bg-surface" style={{ height: GRID_HEIGHT_PX }}>
          {Array.from({ length: SLOTS_PER_DAY }, (_, i) =>
            i % 2 === 0 ? (
              <div
                key={i}
                className="pr-1 text-right text-xs text-muted"
                style={{ height: ROW_HEIGHT_PX * 2 }}
              >
                {slotTime(i)}
              </div>
            ) : null,
          )}
        </div>

        {/* Columnas de día */}
        {dates.map((date) => (
          <div
            key={date}
            data-testid="week-grid-day-column"
            className="relative border-l border-border"
            style={{ height: GRID_HEIGHT_PX }}
          >
            {/* Celdas-hueco clickeables (una por slot) */}
            {Array.from({ length: SLOTS_PER_DAY }, (_, i) => (
              <button
                key={i}
                type="button"
                data-testid={`week-grid-slot-${date}-${slotTime(i)}`}
                onClick={() => onSelectSlot(date, slotTime(i))}
                className="block w-full border-b border-border/40 hover:bg-primary/5"
                style={{ height: ROW_HEIGHT_PX }}
                aria-label={copy.createSlotLabel(date, slotTime(i))}
              />
            ))}
            {layoutLanes(
              appointments
                .filter((a) => localDateString(a.start) === date)
                .map((a) => ({
                  appointment: a,
                  start: new Date(a.start).getTime(),
                  end: new Date(a.end).getTime(),
                })),
            ).map(({ appointment: a, lane, laneCount }) => {
              const { topPx, heightPx } = blockGeometry(a.start, a.end);
              const widthPct = 100 / laneCount;
              return (
                <button
                  key={a.id}
                  type="button"
                  data-testid="week-grid-appointment"
                  data-id={a.id}
                  onClick={() => onSelectAppointment(a)}
                  className={`absolute overflow-hidden rounded-md border px-1 py-0.5 text-left text-xs ${STATUS_BADGE_CLASSES[a.status]}`}
                  style={{
                    top: topPx,
                    height: heightPx,
                    left: `${lane * widthPct}%`,
                    width: `calc(${widthPct}% - 2px)`,
                  }}
                >
                  <span className="block font-medium">{formatTimeRange(a.start, a.end)}</span>
                  <span className="block truncate">{patientLabel(a, patientNames)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
