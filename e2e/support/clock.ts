/**
 * Fechas y horas de la SEDE en los specs (DX-070, TST-008).
 *
 * El navegador corre en `America/Bogota` (playwright.config.ts), pero Node —
 * donde el spec calcula lo que espera ver — corre en la zona de la máquina
 * (UTC en GitHub). Todo lo que el spec compara con la UI se calcula aquí, en la
 * zona de la sede, nunca con `getHours()`/`setHours()` del proceso.
 */
export const SEDE_TZ = 'America/Bogota';
/** Bogotá no tiene horario de verano: -05:00 todo el año. */
const SEDE_OFFSET = '-05:00';
export const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` de un instante, en la zona de la sede. */
export function sedeDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SEDE_TZ }).format(at);
}

/** El día de la sede que cae `days` días después de hoy (`YYYY-MM-DD`). */
export function sedeDayFromToday(days: number): string {
  return sedeDate(new Date(Date.now() + days * DAY_MS));
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

/** El instante de `day` (`YYYY-MM-DD`) a la hora `hhmm` (`HH:MM`) de la sede. */
export function atSede(day: string, hhmm: string): Date {
  return new Date(`${day}T${hhmm}:00${SEDE_OFFSET}`);
}

/** `HH:MM` como lo pinta la app (`toLocaleTimeString('es', …)`), en la sede. */
export function sedeTime(at: Date): string {
  return at.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', timeZone: SEDE_TZ });
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
 * en la CI y en local), y la franja va al final del día para que valga a
 * cualquier hora en la que se pueda crear. Si el reloj ya pasó de las 23:53
 * (no queda margen ni para la llegada puntual), falla con un mensaje que lo
 * dice en vez de saltarse el test.
 */
export function lastSlotToday(start = '23:55', end = '23:59'): SedeSlot {
  const now = new Date();
  const day = sedeDate(now);
  const slot = { day, start: atSede(day, start), end: atSede(day, end), label: `${start}–${end}` };
  const marginMs = 2 * 60_000;
  if (slot.start.getTime() - now.getTime() < marginMs) {
    throw new Error(
      `Son las ${sedeTime(now)} en la sede: la franja de hoy ${slot.label} ya no se puede agendar con margen (la API usa su reloj real). Vuelve a lanzar el spec pasada la medianoche de Bogotá.`,
    );
  }
  return slot;
}
