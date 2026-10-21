import { WEEKDAY_LABELS, minutesToTime, timeToMinutes } from '@/lib/locations/schedule-api';
import type {
  MinuteRangeDto,
  ProviderSchedule,
  ReplaceProviderScheduleInput,
  Roster,
  RosterDay,
} from './provider-schedule-api';

/**
 * Lógica pura del horario de los profesionales por sede (DX-233): el borrador
 * del editor semanal (una columna por sede), su validación (espejo de la API,
 * que es la autoridad), el texto del cuadrante y el sombreado de la agenda.
 */

/** Los días en el orden de la clínica: de lunes a domingo (0 = domingo). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
/** Como la API: minutos múltiplos de 5 y como mucho 7 tramos por día y sede. */
export const MINUTE_STEP = 5;
export const MAX_RANGES_PER_DAY = 7;
const DAY_END = 24 * 60;

export const scheduleValidationCopy = {
  invalidRange: (where: string) => `${where}: cada tramo debe terminar después de empezar.`,
  step: (where: string) => `${where}: las horas van de 5 en 5 minutos (p. ej. 08:05 o 08:10).`,
  tooMany: (where: string) => `${where}: como mucho ${MAX_RANGES_PER_DAY} tramos por día y sede.`,
  overlapping: (where: string) => `${where}: hay tramos solapados; únelos en uno.`,
  crossLocation: (day: string, a: string, b: string) =>
    `${day}: el tramo de ${a} se solapa con el de ${b}. Un profesional no puede estar en dos sedes a la vez.`,
};

/** Tramo en edición: horas `HH:MM`, lo que usan los `<input type="time">`. */
export interface DraftRange {
  start: string;
  end: string;
}

/** Los 7 días (índice = weekday, 0 = domingo), cada uno con sus tramos. */
export type DraftWeek = DraftRange[][];

/** Semana de cada sede, por `locationId`. */
export type ScheduleDraft = Record<string, DraftWeek>;

export function emptyWeek(): DraftWeek {
  return [[], [], [], [], [], [], []];
}

/** El fin de día (1440 = 24:00) se edita como `00:00`. */
function endToTime(minute: number): string {
  return minute >= DAY_END ? '00:00' : minutesToTime(minute);
}

/** `00:00` como fin de tramo es medianoche del MISMO día (24:00). */
function timeToEnd(time: string): number | null {
  const minute = timeToMinutes(time);
  return minute === 0 ? DAY_END : minute;
}

/** Borrador del editor: una semana vacía por sede y, encima, lo guardado. */
export function toScheduleDraft(schedule: ProviderSchedule, locationIds: string[]): ScheduleDraft {
  const draft: ScheduleDraft = {};
  for (const id of locationIds) draft[id] = emptyWeek();
  for (const loc of schedule.locations) {
    const week = draft[loc.locationId] ?? emptyWeek();
    for (const r of loc.ranges) {
      if (r.weekday < 0 || r.weekday > 6) continue;
      week[r.weekday].push({ start: minutesToTime(r.startMinute), end: endToTime(r.endMinute) });
    }
    for (const day of week) day.sort((a, b) => a.start.localeCompare(b.start));
    draft[loc.locationId] = week;
  }
  return draft;
}

type RangesResult = { ok: true; ranges: MinuteRangeDto[] } | { ok: false; message: string };

/** Valida los tramos de UN día en UNA sede; `where` nombra el día y la sede. */
function validateDay(day: DraftRange[], where: string): RangesResult {
  if (day.length > MAX_RANGES_PER_DAY) return { ok: false, message: scheduleValidationCopy.tooMany(where) };
  const ranges: MinuteRangeDto[] = [];
  for (const r of day) {
    const startMinute = timeToMinutes(r.start);
    const endMinute = timeToEnd(r.end);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      return { ok: false, message: scheduleValidationCopy.invalidRange(where) };
    }
    if (startMinute % MINUTE_STEP !== 0 || endMinute % MINUTE_STEP !== 0) {
      return { ok: false, message: scheduleValidationCopy.step(where) };
    }
    ranges.push({ startMinute, endMinute });
  }
  ranges.sort((a, b) => a.startMinute - b.startMinute);
  // Medio abierto, como la API: contiguo no es solape.
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].startMinute < ranges[i - 1].endMinute) {
      return { ok: false, message: scheduleValidationCopy.overlapping(where) };
    }
  }
  return { ok: true, ranges };
}

/** Los tramos de una excepción (vacío = «no trabaja»). */
export function validateOverrideRanges(day: DraftRange[]): RangesResult {
  return validateDay(day, 'Ese día');
}

export type SchedulePayloadResult =
  | { ok: true; payload: ReplaceProviderScheduleInput }
  | { ok: false; message: string };

/**
 * Arma el `PUT` (el horario COMPLETO; las sedes sin tramos no viajan) o
 * devuelve el primer error en español, incluido el solape del mismo día en dos
 * sedes, que la API también rechaza con 400.
 */
export function buildSchedulePayload(
  draft: ScheduleDraft,
  locationNames: Record<string, string>,
): SchedulePayloadResult {
  const locations: ReplaceProviderScheduleInput['locations'] = [];
  const byDay: { locationId: string; range: MinuteRangeDto }[][] = [[], [], [], [], [], [], []];
  for (const [locationId, week] of Object.entries(draft)) {
    const name = locationNames[locationId] ?? '';
    const ranges: ReplaceProviderScheduleInput['locations'][number]['ranges'] = [];
    for (let weekday = 0; weekday <= 6; weekday++) {
      const result = validateDay(week[weekday] ?? [], `${WEEKDAY_LABELS[weekday]} en ${name}`);
      if (!result.ok) return result;
      for (const range of result.ranges) {
        ranges.push({ weekday, ...range });
        byDay[weekday].push({ locationId, range });
      }
    }
    if (ranges.length > 0) locations.push({ locationId, ranges });
  }
  for (const weekday of WEEKDAY_ORDER) {
    const entries = byDay[weekday];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        if (a.locationId === b.locationId) continue;
        if (a.range.startMinute < b.range.endMinute && b.range.startMinute < a.range.endMinute) {
          return {
            ok: false,
            message: scheduleValidationCopy.crossLocation(
              WEEKDAY_LABELS[weekday],
              locationNames[a.locationId] ?? '',
              locationNames[b.locationId] ?? '',
            ),
          };
        }
      }
    }
  }
  return { ok: true, payload: { locations } };
}

/** Copia el día `from` (en todas las sedes) a los días `targets`. */
export function copyDay(draft: ScheduleDraft, from: number, targets: number[]): ScheduleDraft {
  const next: ScheduleDraft = {};
  for (const [locationId, week] of Object.entries(draft)) {
    next[locationId] = week.map((day, weekday) =>
      targets.includes(weekday) && weekday !== from
        ? week[from].map((r) => ({ ...r }))
        : day.map((r) => ({ ...r })),
    );
  }
  return next;
}

// ---------------------------------------------------------------------------
// Fechas civiles (`YYYY-MM-DD`), sin zonas: el cuadrante habla en días.
// ---------------------------------------------------------------------------

function parseIso(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` del día local del navegador (el «hoy» de la agenda). */
export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysIso(date: string, n: number): string {
  const d = parseIso(date);
  d.setUTCDate(d.getUTCDate() + n);
  return formatIso(d);
}

/** El lunes de la semana de `date` (el domingo cierra la semana). */
export function mondayOf(date: string): string {
  const weekday = parseIso(date).getUTCDay();
  return addDaysIso(date, weekday === 0 ? -6 : 1 - weekday);
}

/** `"08:00–13:00, 15:00–19:00"`. */
export function describeRanges(ranges: MinuteRangeDto[]): string {
  return [...ranges]
    .sort((a, b) => a.startMinute - b.startMinute)
    // 1440 sale como «24:00», que es lo que significa en un horario.
    .map((r) => `${minutesToTime(r.startMinute)}–${minutesToTime(r.endMinute)}`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Cuadrante
// ---------------------------------------------------------------------------

export type RosterEntry =
  | { kind: 'unrestricted'; text: string }
  | { kind: 'off'; text: string }
  | {
      kind: 'works' | 'override-off';
      locationId: string;
      location: string;
      text: string;
      override: boolean;
    };

export const rosterCopy = {
  unrestricted: 'Sin horario',
  off: 'Libre',
  overrideOff: 'No trabaja',
};

/** Qué se pinta en la celda profesional × día del cuadrante. */
export function rosterCell(day: RosterDay, locationNames: Record<string, string>): RosterEntry[] {
  if (day.unrestricted) return [{ kind: 'unrestricted', text: rosterCopy.unrestricted }];
  if (day.assignments.length === 0) return [{ kind: 'off', text: rosterCopy.off }];
  return day.assignments.map((a) => ({
    kind: a.ranges.length === 0 ? 'override-off' : 'works',
    locationId: a.locationId,
    location: locationNames[a.locationId] ?? '',
    text: a.ranges.length === 0 ? rosterCopy.overrideOff : describeRanges(a.ranges),
    override: a.source === 'OVERRIDE',
  }));
}

// ---------------------------------------------------------------------------
// Agenda (vista Día en columnas)
// ---------------------------------------------------------------------------

export interface MinuteBand {
  start: number;
  end: number;
}

/**
 * La franja FUERA de los tramos del profesional en la sede (se sombrea).
 * `null` = sin restricción: nada. Sin tramos = no trabaja allí: toda.
 */
export function outsideBands(ranges: MinuteRangeDto[] | null, window: MinuteBand): MinuteBand[] {
  if (ranges === null) return [];
  const open = [...ranges].sort((a, b) => a.startMinute - b.startMinute);
  const bands: MinuteBand[] = [];
  let cursor = window.start;
  for (const r of open) {
    if (r.startMinute > cursor) bands.push({ start: cursor, end: Math.min(r.startMinute, window.end) });
    cursor = Math.max(cursor, r.endMinute);
  }
  if (cursor < window.end) bands.push({ start: cursor, end: window.end });
  return bands.filter((b) => b.end > b.start);
}

/** ¿La cita cabe ENTERA en un tramo? `null` = sin restricción. */
export function fitsRanges(ranges: MinuteRangeDto[] | null, startMinute: number, endMinute: number): boolean {
  if (ranges === null) return true;
  return ranges.some((r) => startMinute >= r.startMinute && endMinute <= r.endMinute);
}

/** El día `date` de un profesional en el cuadrante, si lo trae. */
export function rosterDayOf(
  roster: Pick<Roster, 'providers'> | null,
  providerId: string,
  date: string,
): RosterDay | null {
  return (
    roster?.providers.find((p) => p.providerId === providerId)?.days.find((d) => d.date === date) ??
    null
  );
}

/**
 * Quién no trabaja `date` en la sede del cuadrante (`worksAtLocation`
 * false). Sin cuadrante o sin sede (`null`) no se oculta a nadie.
 */
export function hiddenProviderIds(roster: Pick<Roster, 'providers'> | null, date: string): Set<string> {
  const hidden = new Set<string>();
  for (const p of roster?.providers ?? []) {
    if (p.days.find((d) => d.date === date)?.worksAtLocation === false) hidden.add(p.providerId);
  }
  return hidden;
}
