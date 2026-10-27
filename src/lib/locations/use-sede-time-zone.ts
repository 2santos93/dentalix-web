'use client';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { useCallback, useEffect, useState } from 'react';
import { civilDateInZone } from '@/lib/format/date';
import type { ClinicLocation } from './locations-api';
import { getActiveLocationId, onLocationChange } from './location-store';
import { locationTimeZone } from './location-settings';

/** El mismo texto que `SedeConfigError kind="timeZone"` (spec G1 §5). */
export const SEDE_TIME_ZONE_ERROR = 'No se pudo saber la zona horaria de la sede. Vuelve a intentarlo.';

/**
 * Estado de la zona de la sede para una pantalla (GLOBAL-G1): cargando, lista,
 * o error con su reintento. En error no hay zona con la que contar «hoy»: la
 * pantalla muestra `SedeConfigError` en vez de calcular el día con otra zona.
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
 * sede principal (la primera de `GET /locations`), que es la que la clínica
 * toma como referencia. Cada sede sigue cortando SU día en su zona en la API;
 * esto solo decide qué día es «hoy» para los atajos y los rótulos. Sin zona
 * utilizable (sede sin configurar, sin sedes), `null`: nunca otra zona.
 */
export function pickSedeTimeZone(
  locations: readonly ClinicLocation[],
  activeLocationId: string | null,
): string | null {
  const active = activeLocationId ? locations.find((l) => l.id === activeLocationId) : undefined;
  return locationTimeZone(active ?? locations[0]);
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
  const requestLocations = useSessionLocations(token);
  // `undefined` = cargando; `null` = la lista no cargó.
  const [locations, setLocations] = useState<ClinicLocation[] | null | undefined>(undefined);
  const [activeId, setActiveId] = useState<string | null>(() => getActiveLocationId());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    requestLocations()
      .then((data) => {
        if (!cancelled) setLocations(data);
      })
      .catch(() => {
        if (!cancelled) setLocations(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, requestLocations, attempt]);

  useEffect(() => onLocationChange(() => setActiveId(getActiveLocationId())), []);

  const { invalidate } = requestLocations;
  const retry = useCallback(() => {
    setLocations(undefined);
    // Con la caché de la sesión, invalidar ya relee; sin ella, el intento nuevo.
    invalidate();
    setAttempt((n) => n + 1);
  }, [invalidate]);

  if (locations === undefined) return { status: 'loading' };
  const timeZone = locations ? pickSedeTimeZone(locations, activeId) : null;
  return timeZone
    ? { status: 'ready', timeZone }
    : { status: 'error', message: SEDE_TIME_ZONE_ERROR, retry };
}
