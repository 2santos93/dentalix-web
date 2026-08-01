import { apiFetch } from '@/lib/api/client';

/** Un tramo de atención, en minutos de pared desde 00:00. */
export interface ScheduleRange {
  /** 0=domingo .. 6=sábado (convención de `Date.getDay()`). */
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface BusinessHours {
  /** Zona IANA de la sede (ej. `America/Bogota`). */
  timezone: string;
  ranges: ScheduleRange[];
}

/**
 * `GET /locations/schedule` — horario de la sede ACTIVA (el cliente ya envía
 * `X-Location-Id`, ver `api/client.ts`), o `null` si esa sede no tiene horario
 * configurado, que el backend interpreta como "sin restricción".
 */
export async function getLocationSchedule(
  token: string,
): Promise<BusinessHours | null> {
  return apiFetch<BusinessHours | null>('/locations/schedule', { token });
}

/**
 * `PUT /locations/schedule` — reemplaza la semana COMPLETA de la sede activa
 * (no hay parches por día: el cliente manda el horario entero). Solo ADMIN.
 */
export async function replaceLocationSchedule(
  token: string,
  input: BusinessHours,
): Promise<BusinessHours> {
  return apiFetch<BusinessHours>('/locations/schedule', {
    method: 'PUT',
    body: input,
    token,
  });
}

// ---------------------------------------------------------------------------
// Helpers de hora de pared, compartidos por la pantalla de configuración y por
// la validación del formulario de cita.
// ---------------------------------------------------------------------------

/** `"09:30"` -> 570. Devuelve `null` si el texto no es un `HH:MM` válido. */
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 570 -> `"09:30"`. */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const WEEKDAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

/**
 * ¿La cita cabe COMPLETA en un tramo del día? Espeja la regla del backend
 * (`fitsBusinessHours`): sin horario no se restringe, un día sin tramos está
 * cerrado, y no vale repartir la cita entre dos tramos.
 *
 * Acá NO hace falta convertir zonas: `date`/`startTime`/`endTime` vienen del
 * formulario, así que YA son hora de pared. El backend, que recibe un instante,
 * sí convierte con la zona de la sede — y es el que manda. Si el navegador
 * estuviera en otra zona que la sede, esta comprobación podría diferir; el 400
 * del backend sigue siendo la autoridad.
 */
export function fitsBusinessHoursLocal(
  date: string,
  startTime: string,
  endTime: string,
  hours: BusinessHours | null,
): boolean {
  if (!hours || hours.ranges.length === 0) return true;
  const startMinute = timeToMinutes(startTime);
  const endMinute = timeToMinutes(endTime);
  if (startMinute === null || endMinute === null) return true; // otra validación lo cubre
  const weekday = new Date(`${date}T00:00:00`).getDay();
  return hours.ranges
    .filter((r) => r.weekday === weekday)
    .some((r) => startMinute >= r.startMinute && endMinute <= r.endMinute);
}

/** `"09:00–13:00, 15:00–19:00"`, o `""` si el día está cerrado. */
export function describeDay(weekday: number, hours: BusinessHours | null): string {
  if (!hours) return '';
  return hours.ranges
    .filter((r) => r.weekday === weekday)
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((r) => `${minutesToTime(r.startMinute)}–${minutesToTime(r.endMinute)}`)
    .join(', ');
}
