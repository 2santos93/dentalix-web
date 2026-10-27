'use client';
import { civilDateInZone } from '@/lib/format/date';
import type { ClinicLocation } from './locations-api';
import { locationTimeZone } from './location-settings';
import { useLocationsState } from './use-locations-state';

/** El mismo texto que `SedeConfigError kind="timeZone"` (spec G1 §5). */
export const SEDE_TIME_ZONE_ERROR = 'No se pudo saber la zona horaria de la sede. Vuelve a intentarlo.';

/** Clínica sin ninguna sede activa (spec G1 §5, el mensaje de `LOCATION_REQUIRED`): reintentar no lo arregla. */
export const NO_ACTIVE_LOCATION_ERROR = 'La clínica no tiene ninguna sede activa. Crea una en Ajustes → Sedes.';

/**
 * Estado de la zona de la sede para una pantalla (GLOBAL-G1): cargando, lista,
 * o error con su reintento. En error no hay zona con la que contar «hoy»: la
 * pantalla muestra `SedeConfigError` en vez de calcular el día con otra zona.
 * `message` dice qué pasó (sede sin zona utilizable, o ninguna sede activa).
 */
export type SedeZoneState =
  | { status: 'loading' }
  | { status: 'ready'; timeZone: string }
  | { status: 'error'; message: string; retry: () => void };

/** La zona si ya está, o `null` (cargando o en error). */
export function readyTimeZone(state: SedeZoneState): string | null {
  return state.status === 'ready' ? state.timeZone : null;
}

/**
 * La zona con la que se cuentan los días en pantalla (DX-097): la de la sede
 * activa; en «Todas las sedes» (o con una sede activa que ya no está), la de la
 * sede principal (la activa más antigua: `GET /locations` va por `createdAt` e
 * incluye las desactivadas), la misma regla que la API (R6). Cada sede sigue cortando SU día en su zona en la API;
 * esto solo decide qué día es «hoy» para los atajos y los rótulos. Sin zona
 * utilizable (sede sin configurar, sin sedes), `null`: nunca otra zona.
 */
export function pickSedeTimeZone(
  locations: readonly ClinicLocation[],
  activeLocationId: string | null,
): string | null {
  const active = activeLocationId ? locations.find((l) => l.id === activeLocationId) : undefined;
  return locationTimeZone(active ?? locations.find((l) => l.isActive));
}

/**
 * Hoy (`YYYY-MM-DD`) en la zona de la sede (DX-097): la fecha por defecto de
 * los formularios. Exige la zona; con una zona que no existe lanza en vez de
 * contar el día en otra.
 */
export function sedeToday(timeZone: string, now: Date = new Date()): string {
  const today = civilDateInZone(now, timeZone);
  if (today === null) throw new RangeError(`Zona horaria no válida: ${timeZone}`);
  return today;
}

/**
 * Zona IANA de la sede activa, leída de la API (nunca del navegador ni del
 * país). `loading` mientras carga, para que la pantalla no consulte «hoy» con
 * un día que luego cambie. Si la lista de sedes falla, o la sede no tiene una
 * zona válida, `error` con su reintento (que vuelve a leer las sedes). Se
 * recalcula al cambiar de sede.
 */
export function useSedeTimeZone(token: string): SedeZoneState {
  const state = useLocationsState(token);
  if (state.status === 'loading') return { status: 'loading' };
  if (state.status === 'error') return { status: 'error', message: SEDE_TIME_ZONE_ERROR, retry: state.retry };
  if (!state.locations.some((l) => l.isActive)) {
    return { status: 'error', message: NO_ACTIVE_LOCATION_ERROR, retry: state.retry };
  }
  const timeZone = pickSedeTimeZone(state.locations, state.activeLocationId);
  return timeZone
    ? { status: 'ready', timeZone }
    : { status: 'error', message: SEDE_TIME_ZONE_ERROR, retry: state.retry };
}
