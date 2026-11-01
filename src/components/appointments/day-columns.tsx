'use client';
import { OverdueChip } from '@/components/collections/overdue-chip';
import { AttendanceBadge } from '@/components/appointments/attendance-badge';
import { overdueChipText } from '@/lib/collections/presentation';
import { CoverageMarker } from '@/components/patients/coverage-chip';
import { MedicalAlertIndicator } from '@/components/clinical/medical-alert-indicator';
import { medicalAlertSeverity, medicalAlertSummary } from '@/lib/clinical/medical-alerts';
import { coverageChipText } from '@/lib/patients/coverage-presentation';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, MoveRight, UserPlus } from 'lucide-react';
import type { Appointment } from '@/lib/appointments/appointments-api';
import type { StaffMember } from '@/lib/appointments/staff-api';
import type { BusinessHours } from '@/lib/locations/schedule-api';
import { outsideBands } from '@/lib/locations/provider-schedule';
import { sedeMinute, sedeMinuteRanges, sedeTimeRange, type AgendaClock } from '@/lib/locations/sede-clock';
import { civilWeekday } from '@/lib/time/civil-day';
import type { MinuteRangeDto } from '@/lib/locations/provider-schedule-api';
import {
  GRID_LINE_MINUTES,
  PX_PER_MINUTE,
  closedBands,
  formatMinute,
  gridWindow,
  minuteFromOffset,
  minuteOfDay,
  moveTarget,
  offsetFromMinute,
  type MinuteRange,
  type MoveTarget,
} from '@/lib/appointments/day-grid';
import { layoutLanes } from '@/lib/appointments/week-grid-layout';
import {
  blockBandForDay,
  blockLabel,
  blockShownInColumn,
  reservedBlockColor,
  type ScheduleBlockLike,
} from '@/lib/appointments/schedule-blocks';
import { appointmentTypeTextColor, isAppointmentTypeColor } from '@/lib/color/contrast';
import { freeGaps } from '@/lib/appointments/opening-candidates';
import { WANTS_EARLIER_LABEL, WantsEarlierChip } from '@/components/appointments/wants-earlier-chip';
import {
  STATUS_LABELS,
  patientLabel,
} from '@/components/appointments/appointment-display';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { cn } from '@/lib/utils';
import { statusTone, TONE_CLASSES } from '@/lib/status/tones';

// Copy as constants (i18n-ready, es-first).
const copy = {
  gridLabel: 'Agenda del día por profesional',
  gridLabelByChair: 'Agenda del día por sillón',
  chairPicker: 'Sillón visible',
  newAppointmentIn: (chair: string) => `Nueva cita en ${chair}`,
  loading: 'Cargando agenda…',
  loadError: 'No pudimos cargar la agenda.',
  retry: 'Reintentar',
  emptyColumn: 'Sin citas hoy',
  newAppointment: 'Nueva cita',
  newAppointmentFor: (name: string) => `Nueva cita con ${name}`,
  moveTo: 'Mover a…',
  moveToFor: (patient: string) => `Mover a… la cita de ${patient}`,
  detailFor: (range: string, patient: string, provider: string) =>
    `Detalle de la cita de ${range} · ${patient} · ${provider}`,
  closedHours: 'Fuera del horario de la sede',
  providerOffHours: 'Fuera del horario del profesional en esta sede',
  providerNotHere: 'No atiende en esta sede este día',
  providerPicker: 'Profesional visible',
  appointmentsCount: (n: number) => (n === 1 ? '1 cita' : `${n} citas`),
  dragPreview: (time: string, provider: string) => `Mover a las ${time} · ${provider}`,
  blockAria: (label: string, range: string) => `Bloqueo: ${label}, ${range}`,
  blockLegend: 'Horario bloqueado (vacaciones, reunión, almuerzo…)',
  blockRemove: (label: string) => `Quitar bloqueo: ${label}`,
  freeGap: 'Hueco libre',
  freeGapFor: (range: string, provider: string) =>
    `Ocupar el hueco libre de ${range} · ${provider}`,
  fillCancelledFor: (range: string, patient: string) =>
    `Ocupar el hueco de la cita cancelada de ${range} · ${patient}`,
  fillCancelled: 'Ocupar este hueco',
};

/** Distancia (px) que hay que mover el ratón para que un clic pase a arrastre. */
const DRAG_THRESHOLD_PX = 4;
/** Hasta 6 columnas caben en 1440 px sin scroll; de 7 a 12, scroll interno. */
const MAX_COLUMNS_WITHOUT_SCROLL = 6;

interface DayColumnsProps {
  /** Día que se mira (`YYYY-MM-DD` civil, de la sede). */
  date: string;
  /**
   * DX-378: la rejilla (filas, posición de cada cita, arrastre) va en el reloj
   * de la sede de la pantalla; la hora de cada cita, con el de su sede.
   */
  clock: AgendaClock;
  /** Una columna por profesional, en este orden. */
  providers: StaffMember[];
  appointments: Appointment[];
  /** Horario de la sede (null = sin configurar: nada sombreado). */
  hours: BusinessHours | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** El rol puede mover citas (arrastre y «Mover a…»). */
  canMove: boolean;
  onSelectAppointment: (appointment: Appointment) => void;
  /** «Mover a…» (teclado / táctil): abre el modal de fecha, hora y profesional. */
  onMoveRequest: (appointment: Appointment) => void;
  /** Arrastre soltado en un hueco distinto: el padre hace el PATCH (y el rollback). */
  onDrop: (appointment: Appointment, target: MoveTarget) => void;
  /** «Nueva cita» de una columna, o clic en un hueco libre (con su hora). */
  onNewAppointment: (providerId: string, startTime?: string) => void;
  /** Cita con un movimiento en curso (se marca `aria-busy`). */
  pendingId?: string | null;
  /** DX-122: bloqueos de agenda del día (de profesional o de toda la sede). */
  blocks?: ScheduleBlockLike[];
  /** Sede activa (null = «Todas las sedes»): decide qué bloqueos se pintan. */
  activeLocationId?: string | null;
  /** DX-122: abrir un bloqueo (para quitarlo); sin ella la etiqueta no es un botón. */
  onSelectBlock?: (block: ScheduleBlockLike) => void;
  /** Qué bloqueos puede quitar quien mira (el odontólogo, solo los suyos). */
  canSelectBlock?: (block: ScheduleBlockLike) => boolean;
  /**
   * DX-210 «Ocupar este hueco»: un hueco libre o una cita recién cancelada de
   * la columna. Sin ella no se pintan los huecos.
   */
  onFillOpening?: (
    providerId: string,
    slot: { start: string; end: string },
    /** La sede de la cita cancelada (un hueco libre es de la sede activa). */
    locationId?: string,
  ) => void;
  /** En qué columnas puede mirarlo quien mira (el odontólogo, solo la suya). */
  canFillOpening?: (providerId: string) => boolean;
  /** «Ahora» para no proponer huecos pasados (los tests lo fijan). */
  now?: Date;
  /**
   * DX-233: tramos de cada profesional ese día en la sede activa (del
   * cuadrante). `null` o sin clave = sin restricción (no se sombrea); vacío =
   * no trabaja allí ese día (toda la columna).
   */
  providerRanges?: Record<string, MinuteRangeDto[] | null>;
  /**
   * DX-211: columnas por SILLÓN en vez de por profesional (`providers` queda
   * solo para nombrar al profesional de cada cita). Sin arrastre ni huecos
   * libres por profesional; «Nueva cita» y el clic en un hueco pasan el id de
   * la columna (el sillón, o la de «Sin sillón»).
   */
  chairColumns?: { columns: { id: string; label: string }[]; columnOf: (a: Appointment) => string };
}

interface DragState {
  appointment: Appointment;
  pointerId: number;
  originX: number;
  originY: number;
  /** Distancia del puntero al borde superior de la tarjeta al agarrarla. */
  grabOffsetY: number;
  started: boolean;
  target: { providerId: string; minute: number } | null;
}

/** Fondo y texto de la tarjeta: el color del tipo (validado) o neutro. */
function cardColors(appointment: Appointment): React.CSSProperties | undefined {
  const color = appointment.appointmentType?.color;
  if (!color || !isAppointmentTypeColor(color)) return undefined;
  return { backgroundColor: color, color: appointmentTypeTextColor(color), borderColor: color };
}

/**
 * Vista Día en columnas (DX-121): una columna por profesional, rejilla de
 * 15 min, la franja fuera del horario de la sede sombreada y cada cita con el
 * color de su tipo. Se mueve una cita arrastrándola con el ratón (a otra hora
 * y/o a otra columna) o, sin ratón, con «Mover a…».
 *
 * En móvil se ve UNA columna con un selector de profesional deslizable; en
 * escritorio, hasta 6 columnas sin scroll y de 7 a 12 con scroll interno (la
 * página nunca se desplaza en horizontal).
 */
export function DayColumns({
  date,
  clock,
  providers,
  appointments,
  hours,
  loading,
  error,
  onRetry,
  canMove,
  onSelectAppointment,
  onMoveRequest,
  onDrop,
  onNewAppointment,
  pendingId = null,
  blocks = [],
  activeLocationId = null,
  onSelectBlock,
  canSelectBlock = () => true,
  onFillOpening,
  canFillOpening = () => true,
  now: nowProp,
  providerRanges = {},
  chairColumns,
}: DayColumnsProps) {
  const byChair = chairColumns !== undefined;
  const columns = byChair
    ? chairColumns.columns
    : providers.map((p) => ({ id: p.userId, label: p.fullName }));
  const columnOf = byChair ? chairColumns.columnOf : (a: Appointment) => a.providerId;
  // DX-211: en la vista por sillón no se arrastra (porción siguiente); «Mover a…» sigue.
  const canDrag = canMove && !byChair;
  const [mountedAt] = useState(() => new Date());
  const now = nowProp ?? mountedAt;
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const columnRefs = useRef(new Map<string, HTMLDivElement>());
  // Un arrastre que termina dispara también un `click` en la tarjeta: este
  // indicador lo descarta para que soltar no abra el detalle.
  const suppressClick = useRef(false);

  const { timeZone, fmt } = clock;
  const weekday = civilWeekday(date);
  const span: MinuteRange = gridWindow(
    hours,
    weekday,
    appointments.map((a) => ({
      start: minuteOfDay(a.start, timeZone),
      end: Math.max(minuteOfDay(a.start, timeZone) + 5, minuteOfDay(a.start, timeZone) + durationMinutes(a)),
    })),
  );
  const bands = closedBands(hours, weekday, span);
  const gridHeight = (span.end - span.start) * PX_PER_MINUTE;
  const active = columns.find((c) => c.id === activeProviderId)?.id ?? columns[0]?.id ?? null;

  // Arrastre: los movimientos se escuchan en `window` (el puntero sale de la
  // tarjeta y de su columna). Escape lo cancela sin mover nada.
  const spanStart = span.start;
  const spanEnd = span.end;
  useEffect(() => {
    if (!drag) return;
    const current = drag;
    const visible = { start: spanStart, end: spanEnd };

    function locate(clientX: number, clientY: number) {
      for (const [providerId, el] of columnRefs.current) {
        const rect = el.getBoundingClientRect();
        if (clientX >= rect.left && clientX < rect.right) {
          const minute = minuteFromOffset(clientY - rect.top - current.grabOffsetY, visible);
          return { providerId, minute };
        }
      }
      return null;
    }

    function handleMove(e: PointerEvent) {
      if (e.pointerId !== current.pointerId) return;
      const distance = Math.hypot(e.clientX - current.originX, e.clientY - current.originY);
      const started = current.started || distance > DRAG_THRESHOLD_PX;
      if (!started) return;
      setDrag({ ...current, started, target: locate(e.clientX, e.clientY) ?? current.target });
    }

    function handleUp(e: PointerEvent) {
      if (e.pointerId !== current.pointerId) return;
      setDrag(null);
      if (!current.started) return;
      // El `click` que sigue a soltar llega en esta misma tanda de eventos; si
      // cae fuera de la tarjeta, el indicador se limpia solo después.
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      const target = current.target;
      if (!target) return;
      const a = current.appointment;
      const unchanged =
        target.providerId === a.providerId && target.minute === minuteOfDay(a.start, timeZone);
      if (unchanged) return;
      onDrop(a, moveTarget(a, date, target.minute, target.providerId, timeZone));
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        suppressClick.current = current.started;
        setDrag(null);
      }
    }

    globalThis.addEventListener('pointermove', handleMove);
    globalThis.addEventListener('pointerup', handleUp);
    globalThis.addEventListener('keydown', handleKey);
    return () => {
      globalThis.removeEventListener('pointermove', handleMove);
      globalThis.removeEventListener('pointerup', handleUp);
      globalThis.removeEventListener('keydown', handleKey);
    };
  }, [drag, date, onDrop, spanStart, spanEnd, timeZone]);

  function startDrag(e: React.PointerEvent<HTMLDivElement>, appointment: Appointment) {
    // Solo ratón: en táctil el gesto es desplazar la página, y para eso está
    // «Mover a…». Solo botón principal.
    if (!canDrag || e.pointerType !== 'mouse' || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDrag({
      appointment,
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      grabOffsetY: e.clientY - rect.top,
      started: false,
      target: null,
    });
  }

  function handleCardClick(appointment: Appointment) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSelectAppointment(appointment);
  }

  /** Clic en un hueco libre de la columna: nueva cita a esa hora. */
  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>, providerId: string) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minute = minuteFromOffset(e.clientY - rect.top, span);
    onNewAppointment(providerId, formatMinute(minute));
  }

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <span className="sr-only">{copy.loading}</span>
        <div className="flex gap-3" aria-hidden>
          {Array.from({ length: Math.max(1, Math.min(columns.length, 4)) }, (_, i) => (
            <div key={i} className={cn('flex flex-1 flex-col gap-2', i > 0 && 'hidden sm:flex')}>
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <SectionError description={error} onRetry={onRetry} retryLabel={copy.retry} />;
  }

  const scrolls = columns.length > MAX_COLUMNS_WITHOUT_SCROLL;
  const providerName = (id: string) => providers.find((p) => p.userId === id)?.fullName ?? '';
  const hourMarks: number[] = [];
  for (let m = Math.ceil(span.start / 60) * 60; m < span.end; m += 60) hourMarks.push(m);

  return (
    <div className="flex flex-col gap-3">
      {/* Móvil: una columna; el selector se desliza en horizontal. */}
      <SegmentedControl
        semantics="toggle"
        className="sm:hidden"
        aria-label={byChair ? copy.chairPicker : copy.providerPicker}
        value={active ?? ''}
        onValueChange={setActiveProviderId}
        options={columns.map((c) => ({ value: c.id, label: c.label }))}
      />

      <div
        role="region"
        aria-label={byChair ? copy.gridLabelByChair : copy.gridLabel}
        tabIndex={scrolls ? 0 : undefined}
        className={cn(
          'rounded-lg border border-border bg-surface',
          scrolls && 'overflow-x-auto scroll-x-shadows focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text',
        )}
      >
        <div
          className={cn(
            'grid grid-cols-[var(--hours)_minmax(0,1fr)]',
            scrolls
              ? 'sm:min-w-max sm:[grid-template-columns:var(--hours)_repeat(var(--cols),minmax(10rem,1fr))]'
              : 'sm:[grid-template-columns:var(--hours)_repeat(var(--cols),minmax(0,1fr))]',
          )}
          // Con 12 h, «12:30 p. m.» necesita más sitio que «12:30».
          style={{ '--cols': columns.length, '--hours': fmt.hourCycle === 'h12' ? '5.5rem' : '3.5rem' } as React.CSSProperties}
        >
          {/* Cabecera: nombre y nº de citas por columna. */}
          <div className="sticky left-0 z-10 border-b border-border bg-surface-sunken" />
          {columns.map((p) => {
            const count = appointments.filter((a) => columnOf(a) === p.id).length;
            return (
              <div
                key={p.id}
                data-testid="day-column-header"
                className={cn(
                  'min-w-0 border-b border-l border-border bg-surface-sunken px-3 py-2',
                  p.id !== active && 'hidden sm:block',
                )}
              >
                <p className="truncate text-sm font-semibold text-ink">{p.label}</p>
                <p className="text-xs tabular-nums text-ink/80">{copy.appointmentsCount(count)}</p>
                {(() => {
                  const ranges = byChair ? null : (providerRanges[p.id] ?? null);
                  if (ranges === null) return null;
                  return (
                    <p data-testid="provider-hours" className="truncate text-xs tabular-nums text-muted">
                      {ranges.length > 0 ? sedeMinuteRanges(ranges, fmt) : copy.providerNotHere}
                    </p>
                  );
                })()}
              </div>
            );
          })}

          {/* Columna de horas. */}
          <div className="relative sticky left-0 z-10 bg-surface" style={{ height: gridHeight }} aria-hidden>
            {hourMarks.map((m) => (
              <span
                key={m}
                className="absolute right-2 -translate-y-1/2 whitespace-nowrap text-xs tabular-nums text-muted"
                style={{ top: offsetFromMinute(m, span) }}
              >
                {sedeMinute(m, fmt)}
              </span>
            ))}
          </div>

          {columns.map((p) => {
            const columnAppointments = appointments.filter((a) => columnOf(a) === p.id);
            const laid = layoutLanes(
              columnAppointments.map((a) => ({
                appointment: a,
                start: minuteOfDay(a.start, timeZone),
                end: minuteOfDay(a.start, timeZone) + Math.max(durationMinutes(a), 5),
              })),
            );
            const dragTarget = drag?.started && drag.target?.providerId === p.id ? drag.target : null;
            // Por sillón, solo los bloqueos de toda la sede (los de un
            // profesional no son de ningún sillón).
            const columnBlocks = blocks.filter((block) =>
              blockShownInColumn(block, p.id, activeLocationId),
            );
            const ranges = byChair ? null : (providerRanges[p.id] ?? null);
            const offBands = outsideBands(ranges, span);
            const fills = !byChair && onFillOpening !== undefined && canFillOpening(p.id);
            const gaps = fills
              ? freeGaps({
                  date,
                  hours,
                  appointments: columnAppointments,
                  blocks: columnBlocks,
                  providerId: p.id,
                  activeLocationId,
                  now,
                  timeZone,
                  providerRanges: ranges,
                })
              : [];
            return (
              <div
                key={p.id}
                ref={(el) => {
                  if (el) columnRefs.current.set(p.id, el);
                  else columnRefs.current.delete(p.id);
                }}
                {...(byChair ? { 'data-chair-column': p.id } : { 'data-provider-id': p.id })}
                data-testid="day-column"
                aria-label={p.label}
                role="group"
                onClick={(e) => handleColumnClick(e, p.id)}
                className={cn(
                  'relative min-w-0 border-l border-border',
                  p.id !== active && 'hidden sm:block',
                )}
                style={{
                  height: gridHeight,
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--color-hairline) 0 1px, transparent 1px ${GRID_LINE_MINUTES * PX_PER_MINUTE}px)`,
                }}
              >
                {bands.map((band) => (
                  <div
                    key={band.start}
                    data-testid="closed-band"
                    aria-hidden
                    title={copy.closedHours}
                    className="pointer-events-none absolute inset-x-0 bg-surface-sunken/80 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,var(--color-border)_6px_7px)]"
                    style={{
                      top: offsetFromMinute(band.start, span),
                      height: (band.end - band.start) * PX_PER_MINUTE,
                    }}
                  />
                ))}

                {offBands.map((band) => (
                  <div
                    key={`off-${band.start}`}
                    data-testid="provider-off-band"
                    aria-hidden
                    title={copy.providerOffHours}
                    className="pointer-events-none absolute inset-x-0 bg-[color-mix(in_oklab,var(--color-ink)_7%,transparent)] [background-image:repeating-linear-gradient(45deg,transparent_0_8px,var(--color-border)_8px_9px)]"
                    style={{
                      top: offsetFromMinute(band.start, span),
                      height: (band.end - band.start) * PX_PER_MINUTE,
                    }}
                  />
                ))}

                {columnBlocks.map((block) => {
                    const band = blockBandForDay(block, date, span, timeZone);
                    if (!band) return null;
                    const label = blockLabel(block, undefined, (m) => sedeMinute(m, fmt));
                    // DX-446: un hueco reservado lleva el color de su tipo; liberado, apenas un tinte.
                    const reservedColor = reservedBlockColor(block);
                    const aria = copy.blockAria(label, sedeMinuteRanges([{ startMinute: band.start, endMinute: band.end }], fmt));
                    return (
                      <div
                        key={block.id}
                        data-testid="schedule-block"
                        data-block-id={block.id}
                        data-block-kind={block.kind}
                        role="note"
                        aria-label={aria}
                        className={cn(
                          'pointer-events-none absolute inset-x-0 border-y border-dashed',
                          // DX-446: el hueco reservado lleva el color de su tipo (inline,
                          // abajo); el bloqueo normal, el rayado de aviso sobre warning-subtle.
                          reservedColor
                            ? // Sin franja lateral gruesa (DESIGN): el color del tipo va en el borde y el fondo.
                              'border-x'
                            : 'border-warning/50 bg-warning-subtle [background-image:repeating-linear-gradient(45deg,transparent_0_7px,color-mix(in_oklab,var(--color-warning)_22%,transparent)_7px_9px)]',
                        )}
                        style={{
                          top: offsetFromMinute(band.start, span),
                          height: (band.end - band.start) * PX_PER_MINUTE,
                          ...(reservedColor
                            ? {
                                borderColor: `color-mix(in oklab, ${reservedColor} 55%, transparent)`,
                                backgroundColor: `color-mix(in oklab, ${reservedColor} ${block.released ? 4 : 12}%, transparent)`,
                              }
                            : {}),
                        }}
                      >
                        {onSelectBlock && canSelectBlock(block) ? (
                          <button
                            type="button"
                            aria-label={copy.blockRemove(label)}
                            onClick={() => onSelectBlock(block)}
                            className="pointer-events-auto m-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-surface/90 px-1.5 py-0.5 text-left text-xs font-medium text-ink shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
                          >
                            {label}
                          </button>
                        ) : (
                          <span className="m-1 inline-block max-w-[calc(100%-0.5rem)] truncate rounded bg-surface/90 px-1.5 py-0.5 text-xs font-medium text-ink">
                            {label}
                          </span>
                        )}
                      </div>
                    );
                  })}

                {gaps.map((gap) => {
                  const range = sedeMinuteRanges([gap], fmt);
                  const top = offsetFromMinute(gap.startMinute, span);
                  const height = (gap.endMinute - gap.startMinute) * PX_PER_MINUTE;
                  return (
                    <button
                      key={gap.start}
                      type="button"
                      data-testid="free-gap"
                      aria-label={copy.freeGapFor(range, p.label)}
                      onClick={() => onFillOpening?.(p.id, { start: gap.start, end: gap.end })}
                      className="absolute inset-x-1 z-[1] flex h-6 items-center justify-center gap-1 rounded-md border border-dashed border-border bg-surface/80 px-2 text-xs font-medium text-muted transition-colors hover:border-primary hover:text-primary-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
                      // Centrado en el hueco: no tapa «Sin citas hoy» de arriba.
                      style={{ top: top + Math.max(0, (height - 24) / 2) }}
                    >
                      <UserPlus className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate tabular-nums">
                        {copy.freeGap} · {range}
                      </span>
                    </button>
                  );
                })}

                {columnAppointments.length === 0 && (
                  <div
                    className={cn(
                      'absolute inset-x-2 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-surface/90 px-3 py-4 text-center',
                      // Debajo de la etiqueta de un bloqueo, que va arriba a la izquierda.
                      columnBlocks.length > 0 ? 'top-9' : 'top-2',
                    )}
                  >
                    <p className="text-sm text-muted">{copy.emptyColumn}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      aria-label={byChair ? copy.newAppointmentIn(p.label) : copy.newAppointmentFor(p.label)}
                      onClick={() => onNewAppointment(p.id)}
                    >
                      <CalendarPlus aria-hidden /> {copy.newAppointment}
                    </Button>
                  </div>
                )}

                {laid.map(({ appointment: a, start, end, lane, laneCount }) => {
                  const colors = cardColors(a);
                  const patient = patientLabel(a);
                  const range = sedeTimeRange(a.start, a.end, clock.of(a.locationId));
                  const dragging = drag?.started && drag.appointment.id === a.id;
                  const inactive = a.status === 'CANCELLED' || a.status === 'NO_SHOW';
                  const wantsEarlier = a.wantsEarlier && !inactive;
                  // DX-247: también en las citas de 15 min (24 px de alto).
                  const hasMedicalAlert = medicalAlertSeverity(a.medicalAlerts) !== null;
                  return (
                    <div
                      key={a.id}
                      data-testid="day-column-appointment"
                      data-appointment-id={a.id}
                      aria-busy={pendingId === a.id || undefined}
                      onPointerDown={(e) => startDrag(e, a)}
                      className={cn(
                        // Sin overflow-hidden aquí: lo lleva el contenido de
                        // dentro. Así la zona táctil de 44 px del icono de
                        // alerta (DX-247) no se recorta en las citas de 15 min.
                        'group absolute rounded-md border text-left',
                        !colors && 'border-border bg-surface-sunken text-ink',
                        canDrag && 'cursor-grab active:cursor-grabbing',
                        (dragging || pendingId === a.id) && 'opacity-50',
                        inactive && 'opacity-60',
                      )}
                      style={{
                        ...colors,
                        top: offsetFromMinute(start, span),
                        height: Math.max((end - start) * PX_PER_MINUTE, 24),
                        left: `calc(${(lane / laneCount) * 100}% + 2px)`,
                        width: `calc(${100 / laneCount}% - 4px)`,
                      }}
                    >
                      <div className="relative h-full overflow-hidden rounded-[inherit]">
                        <button
                          type="button"
                          aria-label={[
                            copy.detailFor(range, patient, byChair ? providerName(a.providerId) : p.label),
                            STATUS_LABELS[a.status],
                            a.appointmentType?.name,
                            overdueChipText(a.balance),
                            coverageChipText(a.coverage),
                            medicalAlertSummary(a.medicalAlerts),
                            wantsEarlier ? WANTS_EARLIER_LABEL : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          onClick={() => handleCardClick(a)}
                          className={cn(
                            'flex h-full w-full flex-col items-start gap-0.5 px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                            hasMedicalAlert ? 'pr-[4.5rem]' : 'pr-8',
                          )}
                        >
                          {/* La hora y el nombre no se encogen: en una cita corta
                              lo que no cabe (estado, chips) lo recorta la tarjeta,
                              nunca el nombre. El chip DX-210 y la marca de cobertura
                              vencida (DX-153) van en la fila de la hora para
                              seguir viéndose en las citas de 30 min. */}
                          <span className="flex w-full min-w-0 shrink-0 items-center gap-1.5">
                            <span className="shrink-0 text-xs font-medium tabular-nums">{range}</span>
                            <WantsEarlierChip wantsEarlier={wantsEarlier} className="min-w-0 py-0" />
                            <CoverageMarker coverage={a.coverage} />
                          </span>
                          <span
                            className={cn('w-full shrink-0 truncate text-sm font-semibold', inactive && 'line-through')}
                          >
                            {patient}
                          </span>
                          {/* El fondo es el color del tipo; el estado, su punto de
                              tono (nunca el acento) + la etiqueta. */}
                          <span className="flex w-full min-w-0 items-center gap-1.5 text-xs">
                            <span
                              aria-hidden
                              data-testid="day-column-status-dot"
                              className={cn(
                                'size-2 shrink-0 rounded-full ring-1 ring-surface',
                                TONE_CLASSES[statusTone('appointment', a.status)].dot,
                              )}
                            />
                            <span className="min-w-0 truncate">
                              {[a.appointmentType?.name, STATUS_LABELS[a.status]].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <OverdueChip balance={a.balance} compact />
                          {/* DX-279: inasistencias y cancelaciones tardías (12 meses). */}
                          <AttendanceBadge counts={a.attendance} compact />
                        </button>
                      </div>
                      {hasMedicalAlert ? (
                        // Fuera del botón de la tarjeta (no se anidan botones)
                        // y del contenido recortado: su ::after de 44 px no se
                        // corta y queda por encima de las tarjetas vecinas.
                        // A 44 px del borde: llega justo hasta «Mover» /
                        // «Ocupar este hueco» (los últimos 32 px), sin pisarlos.
                        <MedicalAlertIndicator
                          flags={a.medicalAlerts}
                          patientName={patient}
                          className="absolute right-11 top-0.5 z-10"
                        />
                      ) : null}
                      {fills && a.status === 'CANCELLED' && new Date(a.end) > now ? (
                        <button
                          type="button"
                          data-no-drag
                          data-testid="fill-cancelled"
                          aria-label={copy.fillCancelledFor(range, patient)}
                          title={copy.fillCancelled}
                          onClick={() =>
                            // La hora de la cita, como el detalle y el aviso
                            // «Cita cancelada.»; el hueco libre más largo que
                            // la rodea tiene su propio botón.
                            onFillOpening?.(p.id, { start: a.start, end: a.end }, a.locationId)
                          }
                          className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-md bg-surface text-primary-text shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
                        >
                          <UserPlus className="size-4" aria-hidden />
                        </button>
                      ) : canMove && (
                        <button
                          type="button"
                          data-no-drag
                          aria-label={copy.moveToFor(patient)}
                          title={copy.moveTo}
                          onClick={() => onMoveRequest(a)}
                          className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-md bg-surface/90 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text"
                        >
                          <MoveRight className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  );
                })}

                {dragTarget && drag && (
                  <div
                    data-testid="drag-preview"
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-dashed border-primary bg-primary-subtle px-2 py-1 text-xs font-medium text-ink"
                    style={{
                      top: offsetFromMinute(dragTarget.minute, span),
                      height: Math.max(durationMinutes(drag.appointment) * PX_PER_MINUTE, 24),
                    }}
                  >
                    {copy.dragPreview(sedeMinute(dragTarget.minute, fmt), providerName(dragTarget.providerId))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {blocks.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <span
            aria-hidden
            className="inline-block size-3 rounded-sm border border-dashed border-warning/50 bg-warning-subtle"
          />
          {copy.blockLegend}
        </p>
      )}

      {!byChair && providers.some((p) => (providerRanges[p.userId] ?? null) !== null) && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <span
            aria-hidden
            className="inline-block size-3 rounded-sm border border-border bg-[color-mix(in_oklab,var(--color-ink)_7%,transparent)] [background-image:repeating-linear-gradient(45deg,transparent_0_3px,var(--color-border)_3px_4px)]"
          />
          {copy.providerOffHours}
        </p>
      )}

      {bands.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <span
            aria-hidden
            className="inline-block size-3 rounded-sm border border-border bg-surface-sunken [background-image:repeating-linear-gradient(135deg,transparent_0_3px,var(--color-border)_3px_4px)]"
          />
          {copy.closedHours}
        </p>
      )}
    </div>
  );
}

function durationMinutes(a: Appointment): number {
  return Math.round((new Date(a.end).getTime() - new Date(a.start).getTime()) / 60000);
}
