'use client';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AttendanceBadge } from '@/components/appointments/attendance-badge';
import { OverbookedChip } from '@/components/appointments/overbooked-chip';
import type { Appointment } from '@/lib/appointments/appointments-api';
import {
  ROW_HEIGHT_PX,
  GRID_HEIGHT_PX,
  SLOT_MINUTES,
  DAY_MINUTES,
  blockGeometry,
  layoutLanes,
} from '@/lib/appointments/week-grid-layout';
import {
  ConfirmationBadge,
  STATUS_LABELS,
  AppointmentStatusLabel,
  STATUS_BADGE_CLASSES,
  patientLabel,
} from './appointment-display';
import { weekDayHeader } from '@/lib/appointments/calendar-grid';
import { formatMinute } from '@/lib/appointments/day-grid';
import { sedeMinute, sedeTimeRange, type AgendaClock } from '@/lib/locations/sede-clock';
import { addCivilDays, wallDay, wallMinuteOfDay } from '@/lib/time/wall-clock';
import {
  blockBandForDay,
  blockLabel,
  type ScheduleBlockLike,
} from '@/lib/appointments/schedule-blocks';
import { OverdueChip } from '@/components/collections/overdue-chip';
import { CoverageMarker } from '@/components/patients/coverage-chip';
import { MedicalAlertIndicator } from '@/components/clinical/medical-alert-indicator';
import { medicalAlertSeverity } from '@/lib/clinical/medical-alerts';
import { chairDisplayName } from '@/lib/chairs/chair-columns';
import { cn } from '@/lib/utils';

const copy = {
  heading: 'Agenda de la semana',
  createSlotLabel: (date: string, time: string, blocked: string | null) =>
    `Crear cita el ${date} a las ${time}${blocked ? ` · bloqueado: ${blocked}` : ''}`,
  blockAria: (label: string) => `Bloqueo: ${label}`,
};

const SLOTS_PER_DAY = DAY_MINUTES / SLOT_MINUTES; // 48

/** Los 7 días civiles (lun..dom) de la semana que empieza en `weekStart`. */
function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addCivilDays(weekStart, i));
}

/** "HH:mm" del slot `index` (0 => "00:00", 18 => "09:00"): el valor que recibe el formulario. */
function slotTime(index: number): string {
  return formatMinute(index * SLOT_MINUTES);
}

interface WeekTimeGridProps {
  appointments: Appointment[];
  /**
   * DX-378: la rejilla (días, filas y posición de cada cita) va en el reloj de
   * la sede de la pantalla; la hora de cada cita, con el de su sede.
   */
  clock: AgendaClock;
  weekStart: string;
  patientNames?: Record<string, string>;
  onSelectDay: (date: string) => void;
  onSelectSlot: (date: string, startTime: string) => void;
  onSelectAppointment: (appointment: Appointment) => void;
  /**
   * DX-122: bloqueos de la semana (ya filtrados por quien llama: el profesional
   * elegido y la sede). Se pintan con trama y etiqueta, sin tapar los huecos.
   */
  blocks?: ScheduleBlockLike[];
  /** Nombre del profesional de un bloqueo (para la etiqueta). */
  providerName?: (providerId: string) => string | undefined;
  /**
   * Profesional elegido. Con uno, sus bloqueos se pintan con trama; con
   * «Todos», solo los de toda la sede: la trama de las vacaciones de UNA
   * doctora no puede tapar el día de las demás (sale como etiqueta arriba).
   */
  selectedProviderId?: string | null;
}

/**
 * DX-492: el sillón junto al paciente. DX-492-bis (medido en Semana a media
 * columna, chip de 160 px): los nombres cortos (≈12 caracteres, «Sillón
 * Ávila») caben enteros; los largos se recortan y ocupan como mucho el 45 % del
 * chip. El paciente (`PATIENT_CLASS`) cede antes, hasta 4 caracteres; solo
 * entonces encoge el sillón, así que la fila compacta nunca desborda. El
 * paciente sigue entero en el `title` y en el detalle.
 */
function WeekChairLabel({ chair }: { chair: string | null }) {
  if (!chair) return null;
  return (
    <span data-testid="week-appointment-chair" className="min-w-0 max-w-[45%] truncate glyph-room font-normal">
      {chair}
    </span>
  );
}

/**
 * El paciente parte de 0 y crece hasta su nombre con el hueco que dejan los
 * demás (`flex-1 max-w-max`), con un mínimo de 4 caracteres. Así el sillón no
 * encoge mientras quepa; un peso de encogimiento no basta: le quitaría una
 * fracción de píxel y saldría «Silló…».
 */
const PATIENT_CLASS = 'min-w-[4ch] max-w-max flex-1 truncate glyph-room font-semibold';

const WHOLE_DAY = { start: 0, end: DAY_MINUTES };

export function WeekTimeGrid({
  appointments,
  clock,
  weekStart,
  patientNames,
  onSelectDay,
  onSelectSlot,
  onSelectAppointment,
  blocks = [],
  providerName,
  selectedProviderId = null,
}: WeekTimeGridProps) {
  const labelOf = (block: ScheduleBlockLike) =>
    blockLabel(
      block,
      block.providerId ? providerName?.(block.providerId) : undefined,
      (m) => sedeMinute(m, clock.fmt),
    );
  const dates = weekDates(weekStart);
  const timeZone = clock.timeZone;
  const dayLayouts = dates.map((date) =>
    layoutLanes(
      appointments
        .filter((appointment) => wallDay(appointment.start, timeZone) === date)
        .map((appointment) => ({
          appointment,
          start: new Date(appointment.start).getTime(),
          end: new Date(appointment.end).getTime(),
        })),
    ),
  );
  const laneCount = Math.max(1, ...dayLayouts.flatMap((day) => day.map((item) => item.laneCount)));
  const gutter = clock.fmt.hourCycle === 'h12' ? '5.5rem' : '4rem';
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstStartMin = appointments.length
    ? Math.min(...appointments.map((a) => wallMinuteOfDay(a.start, timeZone)))
    : 7 * 60;

  // Auto-scroll: a la primera cita de la semana, o a las 07:00 si no hay.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = (firstStartMin / SLOT_MINUTES) * ROW_HEIGHT_PX;
  }, [firstStartMin, weekStart]);

  // DX-180: el marco solo es una parada de tabulador y lleva sombras si desborda.
  const [overflowsX, setOverflowsX] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setOverflowsX(el.scrollWidth > el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // DX-180: la rejilla de huecos es UNA parada de tabulador (antes, 336 botones):
  // las flechas se mueven entre horas y días; Inicio y Fin, al principio y al final del día.
  const [cursor, setCursor] = useState<{ day: number; slot: number } | null>(null);
  const activeCell = cursor ?? { day: 0, slot: Math.floor(firstStartMin / SLOT_MINUTES) };

  function moveCursor(event: KeyboardEvent<HTMLButtonElement>, day: number, slot: number) {
    const next = {
      ArrowUp: { day, slot: Math.max(0, slot - 1) },
      ArrowDown: { day, slot: Math.min(SLOTS_PER_DAY - 1, slot + 1) },
      ArrowLeft: { day: Math.max(0, day - 1), slot },
      ArrowRight: { day: Math.min(dates.length - 1, day + 1), slot },
      Home: { day, slot: 0 },
      End: { day, slot: SLOTS_PER_DAY - 1 },
    }[event.key];
    if (!next) return;
    event.preventDefault();
    setCursor(next);
    scrollRef.current
      ?.querySelector<HTMLButtonElement>(`[data-testid="week-grid-slot-${dates[next.day]}-${slotTime(next.slot)}"]`)
      ?.focus();
  }

  /** El bloqueo sin citas que cubre el hueco, si lo hay, para anunciarlo. */
  function blockedLabel(date: string, slot: number): string | null {
    const minute = slot * SLOT_MINUTES;
    const block = blocks.find((b) => {
      if (b.allowsBooking || (b.providerId !== null && b.providerId !== selectedProviderId)) return false;
      const band = blockBandForDay(b, date, WHOLE_DAY, timeZone);
      return band !== null && minute >= band.start && minute < band.end;
    });
    return block ? labelOf(block) : null;
  }

  return (
    <div
      role="region"
      aria-label={copy.heading}
      tabIndex={overflowsX ? 0 : undefined}
      className={cn(
        'max-h-[70vh] overflow-auto rounded-lg border border-border bg-surface',
        overflowsX &&
          'scroll-x-shadows focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text',
      )}
      ref={scrollRef}
    >
      {/* Cada carril mantiene espacio para paciente y estado; el scroll pertenece a la rejilla. */}
      <div
        className="grid"
        style={{
          minWidth: `calc(${gutter} + ${7 * laneCount * 12}rem)`,
          gridTemplateColumns: `${gutter} repeat(7, 1fr)`,
        }}
      >
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
            {weekDayHeader(date, clock.fmt)}
            {/* Bloqueos del día, siempre visibles (la rejilla abre a las 07:00
                y un bloqueo de día completo empieza a las 00:00). */}
            {blocks
              .filter((block) => blockBandForDay(block, date, WHOLE_DAY, timeZone))
              .map((block) => (
                <span
                  key={block.id}
                  data-testid="week-block-chip"
                  className="mt-1 block truncate rounded border border-dashed border-warning/50 bg-warning-subtle px-1 text-xs font-medium text-ink"
                >
                  {labelOf(block)}
                </span>
              ))}
          </button>
        ))}

        {/* Gutter de horas (sticky-left) */}
        <div className="sticky left-0 z-10 bg-surface" style={{ height: GRID_HEIGHT_PX }}>
          {Array.from({ length: SLOTS_PER_DAY }, (_, i) =>
            i % 2 === 0 ? (
              <div
                key={i}
                className="whitespace-nowrap pr-1 text-right text-xs tabular-nums text-muted"
                style={{ height: ROW_HEIGHT_PX * 2 }}
              >
                {sedeMinute(i * SLOT_MINUTES, clock.fmt)}
              </div>
            ) : null,
          )}
        </div>

        {/* Columnas de día */}
        {dates.map((date, dayIndex) => (
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
                tabIndex={activeCell.day === dayIndex && activeCell.slot === i ? 0 : -1}
                onClick={() => onSelectSlot(date, slotTime(i))}
                onKeyDown={(event) => moveCursor(event, dayIndex, i)}
                onFocus={() => setCursor({ day: dayIndex, slot: i })}
                className="block w-full scroll-mt-16 scroll-ml-20 border-b border-border/40 hover:bg-primary-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-text"
                style={{ height: ROW_HEIGHT_PX }}
                aria-label={copy.createSlotLabel(
                  clock.fmt.civilLongDate(date, { year: false }).replace(/,/g, ''),
                  sedeMinute(i * SLOT_MINUTES, clock.fmt),
                  blockedLabel(date, i),
                )}
              />
            ))}
            {blocks
              .filter((block) => block.providerId === null || block.providerId === selectedProviderId)
              .map((block) => {
                const band = blockBandForDay(block, date, WHOLE_DAY, timeZone);
                if (!band) return null;
                return (
                  <div
                    key={block.id}
                    data-testid="week-schedule-block"
                    role="note"
                    aria-label={copy.blockAria(labelOf(block))}
                    className="pointer-events-none absolute inset-x-0 border-y border-dashed border-warning/50 bg-warning-subtle [background-image:repeating-linear-gradient(45deg,transparent_0_7px,color-mix(in_oklab,var(--color-warning)_22%,transparent)_7px_9px)]"
                    style={{
                      top: (band.start / SLOT_MINUTES) * ROW_HEIGHT_PX,
                      height: ((band.end - band.start) / SLOT_MINUTES) * ROW_HEIGHT_PX,
                    }}
                  />
                );
              })}
            {dayLayouts[dayIndex].map(({ appointment: a, lane, laneCount }) => {
              const { topPx, heightPx } = blockGeometry(a.start, a.end, timeZone);
              const range = sedeTimeRange(a.start, a.end, clock.of(a.locationId));
              const widthPct = 100 / laneCount;
              const patient = patientLabel(a, patientNames);
              const chair = a.chair ? chairDisplayName(a.chair) : null;
              // DX-247: el icono va junto a la tarjeta, no dentro (no se anidan
              // botones); también en las de 15 min (20 px de alto).
              const hasMedicalAlert = medicalAlertSeverity(a.medicalAlerts) !== null;
              return (
                <div
                  key={a.id}
                  className="absolute"
                  style={{
                    top: topPx,
                    height: heightPx,
                    left: `${lane * widthPct}%`,
                    width: `calc(${widthPct}% - 2px)`,
                  }}
                >
                  <button
                    type="button"
                    data-testid="week-grid-appointment"
                    data-id={a.id}
                    title={[patient, STATUS_LABELS[a.status], range, a.appointmentType?.name, chair].filter(Boolean).join(' · ')}
                    onClick={() => onSelectAppointment(a)}
                    className={`h-full w-full overflow-hidden rounded-md border px-1 py-0.5 text-left text-xs ${hasMedicalAlert ? 'pr-6' : ''} ${STATUS_BADGE_CLASSES[a.status]}`}
                  >
                    {/* En 20 px paciente y estado comparten una fila; en las demás el paciente mantiene prioridad. */}
                    {heightPx < 40 ? (
                      <span className="flex min-w-0 items-center gap-1 font-medium leading-none">
                        <span className={PATIENT_CLASS}>{patient}</span>{' '}
                        <WeekChairLabel chair={chair} />{' '}
                        <AppointmentStatusLabel status={a.status} compact />{' '}
                        <ConfirmationBadge appointment={a} compact />{' '}
                        <CoverageMarker coverage={a.coverage} srText />{' '}
                        <span className="sr-only">{range}</span>
                      </span>
                    ) : (
                      <>
                        <span className="flex min-w-0 items-center gap-1">
                          <span className={PATIENT_CLASS}>{patient}</span>{' '}
                          <WeekChairLabel chair={chair} />
                        </span>{' '}
                        <span className="flex min-w-0 items-center gap-1">
                          <AppointmentStatusLabel status={a.status} compact={heightPx < 60} />{' '}
                          <span className="truncate tabular-nums">{range}</span>{' '}
                          <ConfirmationBadge appointment={a} compact />{' '}
                          <CoverageMarker coverage={a.coverage} srText />
                        </span>
                      </>
                    )}{' '}
                    {/* DX-150: «Saldo vencido» (el importe, solo ADMIN/RECEPTION). */}
                    <OverdueChip balance={a.balance} compact className="mt-0.5 px-1" fmt={clock.fmt} />{' '}
                    {/* DX-279: inasistencias y cancelaciones tardías (12 meses). */}
                    <AttendanceBadge counts={a.attendance} compact className="mt-0.5 px-1" />{' '}
                    {/* DX-509: solo mientras es sobrecupo. */}
                    <OverbookedChip overbooked={a.overbooked} status={a.status} className="mt-0.5 px-1 py-0" />{' '}
                    {heightPx < 60 && <span className="sr-only">{STATUS_LABELS[a.status]}</span>}
                    {a.appointmentType?.name && <span className="sr-only">{a.appointmentType.name}</span>}
                  </button>
                  {hasMedicalAlert ? (
                    <MedicalAlertIndicator
                      flags={a.medicalAlerts}
                      patientName={patient}
                      className="absolute right-0.5 top-0"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
