'use client';
import { regionalFormat, type RegionalFormat } from '@/lib/format/regional-format';
import type { ClinicLocation } from './locations-api';
import { locationFormat } from './location-settings';
import { useLocationsState } from './use-locations-state';
import { NO_ACTIVE_LOCATION_ERROR } from './use-sede-time-zone';

/** El mismo texto que `SedeConfigError kind="locale"` (spec G1-B §10). */
export const SEDE_LOCALE_ERROR =
  'No se pudo saber el formato regional o el reloj de la sede. Vuelve a intentarlo o revisa la sede en Ajustes → Sedes.';

/**
 * Estado del formato de la sede para una pantalla (G1-B): cargando, listo, o
 * error con su reintento. En error no hay formato con el que pintar: los
 * valores que dependen de él salen «—» y la pantalla muestra
 * `SedeConfigError kind="locale"`, nunca otro formato.
 */
export type SedeFormatState =
  | { status: 'loading' }
  | { status: 'ready'; fmt: RegionalFormat }
  | { status: 'error'; message: string; retry: () => void };

/**
 * El formato con el que se pinta en pantalla, con la misma regla que
 * `pickSedeTimeZone`: el de la sede activa; en «Todas las sedes» (o con una
 * sede activa que ya no está), el de la sede principal (la activa más antigua,
 * R6). Sin formato o sin reloj utilizables, `null`: nunca el de otra sede ni el
 * del navegador.
 */
export function pickSedeFormat(
  locations: readonly ClinicLocation[],
  activeLocationId: string | null,
): RegionalFormat | null {
  const active = activeLocationId ? locations.find((l) => l.id === activeLocationId) : undefined;
  const settings = locationFormat(active ?? locations.find((l) => l.isActive));
  return settings ? regionalFormat(settings) : null;
}

/**
 * Formato regional y reloj de la sede activa, leídos de la API (nunca del
 * navegador ni del país). `loading` mientras carga; si la lista de sedes falla
 * o la sede no tiene formato o reloj, `error` con su reintento (que vuelve a
 * leer las sedes). Se recalcula al cambiar de sede.
 */
export function useSedeFormat(token: string): SedeFormatState {
  const state = useLocationsState(token);
  if (state.status === 'loading') return { status: 'loading' };
  if (state.status === 'error') return { status: 'error', message: SEDE_LOCALE_ERROR, retry: state.retry };
  if (!state.locations.some((l) => l.isActive)) {
    return { status: 'error', message: NO_ACTIVE_LOCATION_ERROR, retry: state.retry };
  }
  const fmt = pickSedeFormat(state.locations, state.activeLocationId);
  return fmt ? { status: 'ready', fmt } : { status: 'error', message: SEDE_LOCALE_ERROR, retry: state.retry };
}

/** El formato con el que pintar, o `null` mientras carga o en error (los valores salen «—»). */
export function readyFormat(state: SedeFormatState): RegionalFormat | null {
  return state.status === 'ready' ? state.fmt : null;
}
