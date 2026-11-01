import { wallInstant } from '../../src/lib/time/wall-clock';

/**
 * Fechas y horas de la SEDE en los specs (DX-070, TST-008).
 *
 * El navegador corre en `America/Bogota` (playwright.config.ts), pero Node —
 * donde el spec calcula lo que espera ver — corre en la zona de la máquina
 * (UTC en GitHub). Todo lo que el spec compara con la UI se calcula aquí, en la
 * zona de la sede, nunca con `getHours()`/`setHours()` del proceso.
 */
export const SEDE_TZ = 'America/Bogota';
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * DX-449 (TST-053): zona de las sedes de los specs que necesitan citas de HOY
 * ya empezadas o por empezar. La API decide «hoy» con su reloj real y la zona
 * de la sede: a las 00:05 de Bogotá no cabe una cita «de hace 10 min» y a las
 * 23:54 no queda franja de hoy por agendar, y la CI de los merges nocturnos
 * (04:40–06:00 UTC) salía en rojo. Bogotá mientras queden al menos
 * `SEDE_TODAY_MARGIN_MINUTES` desde y hasta su medianoche; si no, una zona sin
 * horario de verano en la que ahora es cerca del mediodía.
 */
export const SEDE_TODAY_MARGIN_MINUTES = 180;

/** Una zona por desfase entero de UTC−11 a UTC+12, todas sin horario de verano. */
export const NOON_ZONE_CANDIDATES: readonly string[] = [
  'Pacific/Pago_Pago',
  'Pacific/Honolulu',
  'Pacific/Gambier',
  'Pacific/Pitcairn',
  'America/Phoenix',
  'America/Regina',
  SEDE_TZ,
  'America/La_Paz',
  'America/Sao_Paulo',
  'America/Noronha',
  'Atlantic/Cape_Verde',
  'Africa/Abidjan',
  'Africa/Lagos',
  'Africa/Maputo',
  'Africa/Nairobi',
  'Asia/Dubai',
  'Asia/Tashkent',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Brisbane',
  'Pacific/Guadalcanal',
  'Pacific/Tarawa',
];

/** Minutos transcurridos del día civil de `zone` en `at`. */
export function minutesIntoDay(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: 'hour' | 'minute') => Number(parts.find((p) => p.type === type)?.value);
  return part('hour') * 60 + part('minute');
}

function minutesFromMidnight(at: Date, zone: string): number {
  const minutes = minutesIntoDay(at, zone);
  return Math.min(minutes, 24 * 60 - minutes);
}

/** Bogotá si su medianoche queda a más del margen; si no, la candidata más cerca del mediodía. */
export function sedeTodayZone(now = new Date()): string {
  if (minutesFromMidnight(now, SEDE_TZ) >= SEDE_TODAY_MARGIN_MINUTES) return SEDE_TZ;
  let best = SEDE_TZ;
  for (const zone of NOON_ZONE_CANDIDATES) {
    if (minutesFromMidnight(now, zone) > minutesFromMidnight(now, best)) best = zone;
  }
  return best;
}

/**
 * La zona «de hoy» de ESTA corrida: playwright.config.ts la elige una vez al
 * arrancar (`E2E_SEDE_TODAY_TZ`) y los workers la heredan, así todos los specs
 * y la sede que registran usan la misma aunque la suite cruce una frontera.
 */
export const SEDE_TODAY_TZ = process.env.E2E_SEDE_TODAY_TZ ?? sedeTodayZone();

/** `YYYY-MM-DD` de un instante, en la zona de la sede. */
export function sedeDate(at: Date, zone = SEDE_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(at);
}

/** El día de la sede que cae `days` días después de hoy (`YYYY-MM-DD`). */
export function sedeDayFromToday(days: number, zone = SEDE_TZ): string {
  return sedeDate(new Date(Date.now() + days * DAY_MS), zone);
}

/** El día civil `days` días después de `day` (`YYYY-MM-DD`; calendario puro, sin zona). */
export function addDays(day: string, days: number): string {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/**
 * DX-209 (TST-025): fecha de nacimiento SEGURA de alguien que cumplió `years`
 * años el mes pasado, vista desde `today` (`YYYY-MM-DD` de la sede): el día 15
 * del mes anterior, `years` años antes. El 15 existe en todos los meses y años
 * (restar días y años a «hoy» daba un 29/02 de un año no bisiesto o un 31 que
 * no existe), y entre ese 15 y hoy hay de 2 a 7 semanas: la edad es `years` a
 * cualquier hora y en cualquier zona, lejos del cumpleaños.
 */
export function birthDateTurnedLastMonth(years: number, today: string): string {
  const [year, month] = today.split('-').map(Number);
  const birthMonth = month === 1 ? 12 : month - 1;
  const birthYear = (month === 1 ? year - 1 : year) - years;
  return `${birthYear}-${String(birthMonth).padStart(2, '0')}-15`;
}

/**
 * El instante de `day` (`YYYY-MM-DD`) a la hora `hhmm` (`HH:MM`) de la sede.
 *
 * DX-520: con `wallInstant` del producto, el desfase es el de ESA hora y no el
 * del mediodía UTC del día: el día de un cambio de horario (Nueva York el
 * 1-nov-2026 o el 14-mar-2027, Berlín el 25-oct-2026) las horas de antes del
 * cambio salían corridas una hora. Hora repetida → la primera; hora que no
 * existe → corrida hacia delante, como la agenda.
 */
export function atSede(day: string, hhmm: string, zone = SEDE_TZ): Date {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) throw new RangeError(`Hora no válida: ${hhmm}`);
  return wallInstant(day, Number(match[1]) * 60 + Number(match[2]), zone);
}

/** `HH:MM` como lo pinta la app (`toLocaleTimeString('es', …)`), en la sede. */
export function sedeTime(at: Date, zone = SEDE_TZ): string {
  return at.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', timeZone: zone });
}

/**
 * DX-252 (TST-030): hora fija del NAVEGADOR (`page.clock.install`) en los specs
 * que trabajan con citas de «hoy»: las 23:30 de la sede, la hora a la que antes
 * se saltaban (`test.skip` cerca de medianoche). Cada ejecución ve la misma
 * agenda, corra la suite a la hora que corra.
 */
export const LATE_BROWSER_TIME = '23:30';

/** Una franja de «hoy» de la sede con su rótulo `HH:MM–HH:MM` de la agenda. */
export interface SedeSlot {
  /** `YYYY-MM-DD` de la sede. */
  day: string;
  start: Date;
  end: Date;
  label: string;
}

/**
 * La última franja del día de HOY de la sede (23:55–23:59), siempre la misma
 * hora: el navegador va a las 23:30 (`LATE_BROWSER_TIME`) y la cita está por
 * venir. La API sí usa su reloj real: rechaza agendar en el pasado, marca la
 * llegada solo el día de la cita y no liga una evolución a un día futuro. Por
 * eso «hoy» es el día de la sede en el reloj de la máquina (el mismo de la API
 * en la CI y en local), y la franja va al final del día.
 *
 * DX-449: con `zone` = `SEDE_TODAY_TZ` (y la sede registrada en esa zona) la
 * franja vale a cualquier hora: esa zona deja al menos 3 h hasta la
 * medianoche. Con otra zona, si ya no hay margen, falla diciendo qué zona
 * usar en vez de pedir que se relance el spec.
 */
export function lastSlotToday(start = '23:55', end = '23:59', zone = SEDE_TZ): SedeSlot {
  const now = new Date();
  const day = sedeDate(now, zone);
  const slot = { day, start: atSede(day, start, zone), end: atSede(day, end, zone), label: `${start}–${end}` };
  const marginMs = 2 * 60_000;
  if (slot.start.getTime() - now.getTime() < marginMs) {
    throw new Error(
      `Son las ${sedeTime(now, zone)} en ${zone}: la franja de hoy ${slot.label} ya no se puede agendar con margen. Registra la sede en SEDE_TODAY_TZ y pásala como zona (DX-449).`,
    );
  }
  return slot;
}
