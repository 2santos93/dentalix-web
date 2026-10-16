import type { BusinessHours } from '@/lib/locations/schedule-api';

/**
 * Geometría de la vista Día en columnas (DX-121): qué franja horaria se pinta,
 * dónde está sombreado «fuera de horario», y la conversión posición ⇄ hora que
 * usa el arrastre. Puro: lo prueban los tests sin DOM.
 *
 * Todo en minutos de pared desde 00:00 del día que se mira (hora local del
 * navegador, la misma que usa el resto de la agenda).
 */

/** Rejilla de 15 min (líneas) con ajuste de 5 min al soltar una cita. */
export const GRID_LINE_MINUTES = 15;
export const GRID_SNAP_MINUTES = 5;
/** 1,6 px por minuto: una cita de 15 min mide 24 px (legible y clicable). */
export const PX_PER_MINUTE = 1.6;

/** Franja sin horario configurado (o día cerrado). */
const DEFAULT_WINDOW = { start: 7 * 60, end: 20 * 60 } as const;
/** Margen alrededor del horario de la sede. */
const WINDOW_PADDING = 30;

export interface MinuteRange {
  start: number;
  end: number;
}

function floorTo(minute: number, step: number): number {
  return Math.floor(minute / step) * step;
}

function ceilTo(minute: number, step: number): number {
  return Math.ceil(minute / step) * step;
}

/**
 * Franja que se pinta: el horario del día con media hora de margen (o 07–20 si
 * no hay), estirada para que quepan las citas que lo exceden.
 */
export function gridWindow(
  hours: BusinessHours | null,
  weekday: number,
  appointments: MinuteRange[],
): MinuteRange {
  const ranges = hours?.ranges.filter((r) => r.weekday === weekday) ?? [];
  let start: number = DEFAULT_WINDOW.start;
  let end: number = DEFAULT_WINDOW.end;
  if (ranges.length > 0) {
    start = Math.max(0, Math.min(...ranges.map((r) => r.startMinute)) - WINDOW_PADDING);
    end = Math.min(24 * 60, Math.max(...ranges.map((r) => r.endMinute)) + WINDOW_PADDING);
  }
  for (const a of appointments) {
    start = Math.min(start, a.start);
    end = Math.max(end, a.end);
  }
  // A la media hora: las etiquetas de la rejilla caen en horas y medias.
  return {
    start: Math.max(0, floorTo(start, 30)),
    end: Math.min(24 * 60, ceilTo(end, 30)),
  };
}

/**
 * Tramos de la franja FUERA del horario de la sede (se pintan sombreados).
 * Sin horario configurado no hay restricción: nada sombreado. Un día sin
 * tramos está cerrado: toda la franja.
 */
export function closedBands(
  hours: BusinessHours | null,
  weekday: number,
  window: MinuteRange,
): MinuteRange[] {
  if (!hours || hours.ranges.length === 0) return [];
  const open = hours.ranges
    .filter((r) => r.weekday === weekday)
    .map((r) => ({ start: r.startMinute, end: r.endMinute }))
    .sort((a, b) => a.start - b.start);
  const bands: MinuteRange[] = [];
  let cursor = window.start;
  for (const range of open) {
    if (range.start > cursor) {
      bands.push({ start: cursor, end: Math.min(range.start, window.end) });
    }
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < window.end) bands.push({ start: cursor, end: window.end });
  return bands.filter((b) => b.end > b.start);
}

/** Desplazamiento vertical (px) de un minuto del día dentro de la franja. */
export function offsetFromMinute(minute: number, window: MinuteRange): number {
  return (minute - window.start) * PX_PER_MINUTE;
}

/**
 * Minuto del día bajo un desplazamiento vertical, ajustado a la rejilla y
 * acotado a la franja (una cita no puede empezar en su último hueco).
 */
export function minuteFromOffset(offsetPx: number, window: MinuteRange): number {
  const raw = window.start + offsetPx / PX_PER_MINUTE;
  const snapped = Math.round(raw / GRID_SNAP_MINUTES) * GRID_SNAP_MINUTES;
  return Math.min(Math.max(snapped, window.start), window.end - GRID_SNAP_MINUTES);
}

/** Minutos locales desde 00:00 del instante `iso`. */
export function minuteOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** "HH:mm" de un minuto del día. */
export function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export interface MoveTarget {
  start: string;
  end: string;
  providerId: string;
}

/**
 * Destino de un movimiento: el día (`YYYY-MM-DD` local), la hora de inicio y el
 * profesional nuevos, conservando la duración de la cita.
 */
export function moveTarget(
  appointment: { start: string; end: string },
  date: string,
  startMinute: number,
  providerId: string,
): MoveTarget {
  const duration = new Date(appointment.end).getTime() - new Date(appointment.start).getTime();
  const start = new Date(`${date}T${formatMinute(startMinute)}:00`);
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + duration).toISOString(),
    providerId,
  };
}
