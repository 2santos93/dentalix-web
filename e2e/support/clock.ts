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

/** El instante de `day` (`YYYY-MM-DD`) a la hora `hhmm` (`HH:MM`) de la sede. */
export function atSede(day: string, hhmm: string): Date {
  return new Date(`${day}T${hhmm}:00${SEDE_OFFSET}`);
}

/** `HH:MM` como lo pinta la app (`toLocaleTimeString('es', …)`), en la sede. */
export function sedeTime(at: Date): string {
  return at.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', timeZone: SEDE_TZ });
}
