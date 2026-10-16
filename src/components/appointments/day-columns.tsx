'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, MoveRight } from 'lucide-react';
import type { Appointment } from '@/lib/appointments/appointments-api';
import type { StaffMember } from '@/lib/appointments/staff-api';
import type { BusinessHours } from '@/lib/locations/schedule-api';
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
  type ScheduleBlockLike,
} from '@/lib/appointments/schedule-blocks';
import { appointmentTypeTextColor, isAppointmentTypeColor } from '@/lib/color/contrast';
import {
  STATUS_LABELS,
  formatTimeRange,
  patientLabel,
} from '@/components/appointments/appointment-display';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/errors/section-error';
import { cn } from '@/lib/utils';

// Copy as constants (i18n-ready, es-first).
const copy = {
  gridLabel: 'Agenda del día por profesional',
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
  providerPicker: 'Profesional visible',
  appointmentsCount: (n: number) => (n === 1 ? '1 cita' : `${n} citas`),
  dragPreview: (time: string, provider: string) => `Mover a las ${time} · ${provider}`,
  blockAria: (label: string, range: string) => `Bloqueo: ${label}, ${range}`,
  blockLegend: 'Horario bloqueado (vacaciones, reunión, almuerzo…)',
  blockRemove: (label: string) => `Quitar bloqueo: ${label}`,
};

/** Distancia (px) que hay que mover el ratón para que un clic pase a arrastre. */
const DRAG_THRESHOLD_PX = 4;
/** Hasta 6 columnas caben en 1440 px sin scroll; de 7 a 12, scroll interno. */
const MAX_COLUMNS_WITHOUT_SCROLL = 6;

interface DayColumnsProps {
  /** Día que se mira (`YYYY-MM-DD` local). */
  date: string;
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
}: DayColumnsProps) {
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const columnRefs = useRef(new Map<string, HTMLDivElement>());
  // Un arrastre que termina dispara también un `click` en la tarjeta: este
  // indicador lo descarta para que soltar no abra el detalle.
  const suppressClick = useRef(false);

  const weekday = new Date(`${date}T00:00:00`).getDay();
  const span: MinuteRange = gridWindow(
    hours,
    weekday,
    appointments.map((a) => ({
      start: minuteOfDay(a.start),
      end: Math.max(minuteOfDay(a.start) + 5, minuteOfDay(a.start) + durationMinutes(a)),
    })),
  );
  const bands = closedBands(hours, weekday, span);
  const gridHeight = (span.end - span.start) * PX_PER_MINUTE;
  const active =
    providers.find((p) => p.userId === activeProviderId)?.userId ?? providers[0]?.userId ?? null;

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
        target.providerId === a.providerId && target.minute === minuteOfDay(a.start);
      if (unchanged) return;
      onDrop(a, moveTarget(a, date, target.minute, target.providerId));
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
  }, [drag, date, onDrop, spanStart, spanEnd]);

  function startDrag(e: React.PointerEvent<HTMLDivElement>, appointment: Appointment) {
    // Solo ratón: en táctil el gesto es desplazar la página, y para eso está
    // «Mover a…». Solo botón principal.
    if (!canMove || e.pointerType !== 'mouse' || e.button !== 0) return;
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
          {Array.from({ length: Math.max(1, Math.min(providers.length, 4)) }, (_, i) => (
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

  const scrolls = providers.length > MAX_COLUMNS_WITHOUT_SCROLL;
  const providerName = (id: string) => providers.find((p) => p.userId === id)?.fullName ?? '';
  const hourMarks: number[] = [];
  for (let m = Math.ceil(span.start / 60) * 60; m < span.end; m += 60) hourMarks.push(m);

  return (
    <div className="flex flex-col gap-3">
      {/* Móvil: una columna; el selector se desliza en horizontal. */}
      <div
        role="group"
        aria-label={copy.providerPicker}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:hidden"
      >
        {providers.map((p) => (
          <button
            key={p.userId}
            type="button"
            aria-pressed={p.userId === active}
            onClick={() => setActiveProviderId(p.userId)}
            className={cn(
              'h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              p.userId === active
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface text-muted hover:text-ink',
            )}
          >
            {p.fullName}
          </button>
        ))}
      </div>

      <div
        role="region"
        aria-label={copy.gridLabel}
        tabIndex={scrolls ? 0 : undefined}
        className={cn(
          'rounded-lg border border-border bg-surface',
          scrolls && 'overflow-x-auto scroll-x-shadows focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        <div
          className={cn(
            'grid grid-cols-[3.5rem_minmax(0,1fr)]',
            scrolls
              ? 'sm:min-w-max sm:[grid-template-columns:3.5rem_repeat(var(--cols),minmax(10rem,1fr))]'
              : 'sm:[grid-template-columns:3.5rem_repeat(var(--cols),minmax(0,1fr))]',
          )}
          style={{ '--cols': providers.length } as React.CSSProperties}
        >
          {/* Cabecera: nombre y nº de citas por columna. */}
          <div className="sticky left-0 z-10 border-b border-border bg-surface-2" />
          {providers.map((p) => {
            const count = appointments.filter((a) => a.providerId === p.userId).length;
            return (
              <div
                key={p.userId}
                data-testid="day-column-header"
                className={cn(
                  'min-w-0 border-b border-l border-border bg-surface-2 px-3 py-2',
                  p.userId !== active && 'hidden sm:block',
                )}
              >
                <p className="truncate text-sm font-semibold text-ink">{p.fullName}</p>
                <p className="text-xs tabular-nums text-muted">{copy.appointmentsCount(count)}</p>
              </div>
            );
          })}

          {/* Columna de horas. */}
          <div className="relative sticky left-0 z-10 bg-surface" style={{ height: gridHeight }} aria-hidden>
            {hourMarks.map((m) => (
              <span
                key={m}
                className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-muted"
                style={{ top: offsetFromMinute(m, span) }}
              >
                {formatMinute(m)}
              </span>
            ))}
          </div>

          {providers.map((p) => {
            const columnAppointments = appointments.filter((a) => a.providerId === p.userId);
            const laid = layoutLanes(
              columnAppointments.map((a) => ({
                appointment: a,
                start: minuteOfDay(a.start),
                end: minuteOfDay(a.start) + Math.max(durationMinutes(a), 5),
              })),
            );
            const dragTarget = drag?.started && drag.target?.providerId === p.userId ? drag.target : null;
            const columnBlocks = blocks.filter((block) =>
              blockShownInColumn(block, p.userId, activeLocationId),
            );
            return (
              <div
                key={p.userId}
                ref={(el) => {
                  if (el) columnRefs.current.set(p.userId, el);
                  else columnRefs.current.delete(p.userId);
                }}
                data-provider-id={p.userId}
                data-testid="day-column"
                aria-label={p.fullName}
                role="group"
                onClick={(e) => handleColumnClick(e, p.userId)}
                className={cn(
                  'relative min-w-0 border-l border-border',
                  p.userId !== active && 'hidden sm:block',
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
                    className="pointer-events-none absolute inset-x-0 bg-surface-2/80 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,var(--color-border)_6px_7px)]"
                    style={{
                      top: offsetFromMinute(band.start, span),
                      height: (band.end - band.start) * PX_PER_MINUTE,
                    }}
                  />
                ))}

                {columnBlocks.map((block) => {
                    const band = blockBandForDay(block, date, span);
                    if (!band) return null;
                    const label = blockLabel(block);
                    const aria = copy.blockAria(label, `${formatMinute(band.start)}–${formatMinute(band.end)}`);
                    return (
                      <div
                        key={block.id}
                        data-testid="schedule-block"
                        data-block-id={block.id}
                        role="note"
                        aria-label={aria}
                        className={cn(
                          'pointer-events-none absolute inset-x-0 border-y border-dashed border-warning/50 [background-image:repeating-linear-gradient(45deg,transparent_0_7px,color-mix(in_oklab,var(--color-warning)_22%,transparent)_7px_9px)]',
                          block.allowsBooking ? 'bg-warning/5' : 'bg-warning/10',
                        )}
                        style={{
                          top: offsetFromMinute(band.start, span),
                          height: (band.end - band.start) * PX_PER_MINUTE,
                        }}
                      >
                        {onSelectBlock ? (
                          <button
                            type="button"
                            aria-label={copy.blockRemove(label)}
                            onClick={() => onSelectBlock(block)}
                            className="pointer-events-auto m-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-surface/90 px-1.5 py-0.5 text-left text-xs font-medium text-ink shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                      aria-label={copy.newAppointmentFor(p.fullName)}
                      onClick={() => onNewAppointment(p.userId)}
                    >
                      <CalendarPlus aria-hidden /> {copy.newAppointment}
                    </Button>
                  </div>
                )}

                {laid.map(({ appointment: a, start, end, lane, laneCount }) => {
                  const colors = cardColors(a);
                  const patient = patientLabel(a);
                  const range = formatTimeRange(a.start, a.end);
                  const dragging = drag?.started && drag.appointment.id === a.id;
                  const inactive = a.status === 'CANCELLED' || a.status === 'NO_SHOW';
                  return (
                    <div
                      key={a.id}
                      data-testid="day-column-appointment"
                      data-appointment-id={a.id}
                      aria-busy={pendingId === a.id || undefined}
                      onPointerDown={(e) => startDrag(e, a)}
                      className={cn(
                        'group absolute overflow-hidden rounded-md border text-left shadow-sm',
                        !colors && 'border-border bg-surface-2 text-ink',
                        canMove && 'cursor-grab active:cursor-grabbing',
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
                      <button
                        type="button"
                        aria-label={copy.detailFor(range, patient, p.fullName)}
                        onClick={() => handleCardClick(a)}
                        className="flex h-full w-full flex-col items-start gap-0.5 px-2 py-1 pr-8 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <span className="text-xs font-medium tabular-nums">{range}</span>
                        <span className={cn('truncate text-sm font-semibold', inactive && 'line-through')}>
                          {patient}
                        </span>
                        <span className="truncate text-xs">
                          {[a.appointmentType?.name, STATUS_LABELS[a.status]].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                      {canMove && (
                        <button
                          type="button"
                          data-no-drag
                          aria-label={copy.moveToFor(patient)}
                          title={copy.moveTo}
                          onClick={() => onMoveRequest(a)}
                          className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-md bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                    className="pointer-events-none absolute inset-x-1 rounded-md border-2 border-dashed border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-ink"
                    style={{
                      top: offsetFromMinute(dragTarget.minute, span),
                      height: Math.max(durationMinutes(drag.appointment) * PX_PER_MINUTE, 24),
                    }}
                  >
                    {copy.dragPreview(formatMinute(dragTarget.minute), providerName(dragTarget.providerId))}
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
            className="inline-block size-3 rounded-sm border border-dashed border-warning/50 bg-warning/10"
          />
          {copy.blockLegend}
        </p>
      )}

      {bands.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <span
            aria-hidden
            className="inline-block size-3 rounded-sm border border-border bg-surface-2 [background-image:repeating-linear-gradient(135deg,transparent_0_3px,var(--color-border)_3px_4px)]"
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
