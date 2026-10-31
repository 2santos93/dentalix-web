'use client';
import { useCallback, useEffect, useState } from 'react';
import { getTokenUserId } from '@/lib/auth/token-role';
import { zoneShortLabel } from '@/lib/format/zone';
import type { ClinicLocation } from './locations-api';
import { activeSedeCurrency, hasActiveLocationWithoutCurrency, locationTimeZone } from './location-settings';
import { useLocationsState } from './use-locations-state';
import { NO_ACTIVE_LOCATION_ERROR, SEDE_TIME_ZONE_ERROR } from './use-sede-time-zone';

/**
 * R1 (2026-10-31): lo que una pantalla como Inicio necesita para decir en qué
 * zona cuenta los días y en qué moneda suma, sin decidir nada por su cuenta.
 * Todo sale de las sedes (`GET /locations`) y de la sede activa; nunca del
 * navegador, del país ni de un valor fijo.
 */

/** Ruta de Ajustes → Sedes con el modal de esa sede abierto (`?sede=<id>`, el mismo enlace que `SedeConfigError`). */
export function sedeSettingsHref(locationId: string): string {
  return `/settings/sedes?sede=${encodeURIComponent(locationId)}`;
}

export const sedeZoneNoteCopy = {
  /** «Días en hora de Caracas (UTC−4).» */
  days: (zone: string) => `Días en hora de ${zone}.`,
  /** En «Todas las sedes» los días son los de la sede principal; cada sede corta los suyos en la API. */
  daysPrincipal: (zone: string, sede: string) => `Días en hora de ${zone} (${sede}).`,
  change: 'Cambiar zona',
};

export type SedeZoneNote =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | {
      status: 'ready';
      /** Zona IANA con la que se cuentan los días en pantalla. */
      timeZone: string;
      /** «Caracas (UTC−4)». */
      label: string;
      /** Frase lista para pintar: «Días en hora de Caracas (UTC−4).» */
      text: string;
      /** Sede de la que sale la zona: la activa, o la principal en «Todas las sedes». */
      locationId: string;
      locationName: string;
      scope: 'sede' | 'clinic';
      /** Ajustes → Sedes con esa sede abierta (solo ADMIN puede guardar; el resto la ve). */
      settingsHref: string;
    };

/** La sede que da la zona: la activa; en «Todas» (o si la activa ya no está), la activa más antigua (como `pickSedeTimeZone`). */
function zoneSede(locations: readonly ClinicLocation[], activeLocationId: string | null) {
  const active = activeLocationId ? locations.find((l) => l.id === activeLocationId) : undefined;
  return active
    ? { sede: active, scope: 'sede' as const }
    : { sede: locations.find((l) => l.isActive), scope: 'clinic' as const };
}

/** Versión pura de {@link useSedeZoneNote}, para pruebas y para quien ya tenga las sedes. */
export function sedeZoneNote(
  locations: readonly ClinicLocation[],
  activeLocationId: string | null,
  retry: () => void,
  at: Date = new Date(),
): SedeZoneNote {
  if (!locations.some((l) => l.isActive)) return { status: 'error', message: NO_ACTIVE_LOCATION_ERROR, retry };
  const { sede, scope } = zoneSede(locations, activeLocationId);
  const timeZone = locationTimeZone(sede);
  if (!sede || !timeZone) return { status: 'error', message: SEDE_TIME_ZONE_ERROR, retry };
  const label = zoneShortLabel(timeZone, at);
  return {
    status: 'ready',
    timeZone,
    label,
    text: scope === 'clinic' && locations.filter((l) => l.isActive).length > 1
      ? sedeZoneNoteCopy.daysPrincipal(label, sede.name)
      : sedeZoneNoteCopy.days(label),
    locationId: sede.id,
    locationName: sede.name,
    scope,
    settingsHref: sedeSettingsHref(sede.id),
  };
}

/**
 * La nota de zona de una pantalla con días (Inicio, Caja): qué zona, cómo
 * nombrarla y dónde cambiarla. Sigue a la sede activa.
 */
export function useSedeZoneNote(token: string): SedeZoneNote {
  const state = useLocationsState(token);
  if (state.status === 'loading') return { status: 'loading' };
  if (state.status === 'error') return { status: 'error', message: SEDE_TIME_ZONE_ERROR, retry: state.retry };
  return sedeZoneNote(state.locations, state.activeLocationId, state.retry);
}

// ---------------------------------------------------------------------------
// Moneda del panel, recordada por usuario.

const CURRENCY_CODE = /^[A-Z]{3}$/;
const STORAGE_PREFIX = 'dentalix.dashboardCurrency';

/**
 * Clave de la moneda elegida: por usuario (`sub` del token) y por alcance
 * (la sede o «Todas las sedes»). El origen ya es el de la clínica (subdominio),
 * así que dos clínicas no comparten la elección. `null` sin usuario.
 */
export function dashboardCurrencyKey(token: string, activeLocationId: string | null): string | null {
  const user = getTokenUserId(token);
  return user ? `${STORAGE_PREFIX}.${user}.${activeLocationId ?? 'all'}` : null;
}

function readStored(key: string | null): string | null {
  if (!key || typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    return value && CURRENCY_CODE.test(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStored(key: string | null, value: string | null): void {
  if (!key || typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* almacenamiento no disponible: la elección vale solo para esta visita */
  }
}

export type DashboardCurrency =
  | { status: 'loading' }
  /** La lista de sedes no cargó, o la sede activa no tiene moneda: `SedeConfigError kind="currency"` con `retry`. */
  | { status: 'error'; retry: () => void; settingsHref: string | null }
  | {
      status: 'ready';
      /** Moneda en la que pedir `GET /dashboard`; `null` = hay que elegirla (sedes con monedas distintas). */
      currency: string | null;
      /** De dónde sale: elegida por el usuario, la de la sede activa o la común de la clínica. */
      source: 'chosen' | 'sede' | 'clinic' | null;
      /** La moneda por defecto de este alcance (la de la sede o la común), o `null` si no hay una. */
      defaultCurrency: string | null;
      scope: 'sede' | 'clinic';
      /** Elegir otra moneda (se recuerda); elegir la de por defecto olvida la elección. */
      choose: (code: string) => void;
      /** Volver a la moneda por defecto. */
      reset: () => void;
    };

/**
 * Moneda de Inicio (R1): por defecto la de la sede activa; en «Todas las
 * sedes», la común de la clínica o, si sus sedes usan monedas distintas,
 * ninguna (hay que elegir). Cualquier moneda se puede elegir y la elección se
 * recuerda por usuario y por sede en `localStorage`. La API convierte cada
 * cobro con la tasa congelada del cobro o, si no tiene, con la de su propio
 * día (`GET /dashboard`); aquí no se convierte nada.
 */
export function useDashboardCurrency(token: string): DashboardCurrency {
  const state = useLocationsState(token);
  const activeLocationId = state.status === 'ready' ? state.activeLocationId : null;
  const key = state.status === 'ready' ? dashboardCurrencyKey(token, activeLocationId) : null;
  const [stored, setStored] = useState<{ key: string | null; value: string | null }>({ key: null, value: null });

  // Se lee tras montar (en el servidor no hay `localStorage`) y al cambiar de sede.
  useEffect(() => {
    function read() {
      setStored({ key, value: readStored(key) });
    }
    read();
  }, [key]);

  const scopeDefault =
    state.status === 'ready' ? activeSedeCurrency(state.locations, state.activeLocationId) : null;
  const defaultCurrency = scopeDefault?.currency ?? null;

  const choose = useCallback(
    (code: string) => {
      const value = CURRENCY_CODE.test(code) && code !== defaultCurrency ? code : null;
      writeStored(key, value);
      setStored({ key, value });
    },
    [key, defaultCurrency],
  );
  const reset = useCallback(() => {
    writeStored(key, null);
    setStored({ key, value: null });
  }, [key]);

  if (state.status === 'loading') return { status: 'loading' };
  if (state.status === 'error') return { status: 'error', retry: state.retry, settingsHref: null };
  const scope = scopeDefault!.scope;
  const chosen = stored.key === key ? stored.value : null;
  if (chosen) return { status: 'ready', currency: chosen, source: 'chosen', defaultCurrency, scope, choose, reset };
  if (defaultCurrency) {
    return { status: 'ready', currency: defaultCurrency, source: scope, defaultCurrency, scope, choose, reset };
  }
  // Sin moneda por un dato que falta (sede sin configurar) es un error; con monedas distintas, solo hay que elegir.
  const missing =
    scope === 'sede' || hasActiveLocationWithoutCurrency(state.locations)
      ? (state.locations.find((l) => l.id === activeLocationId) ??
        state.locations.find((l) => l.isActive && !l.currency))
      : undefined;
  if (missing || scope === 'sede') {
    return { status: 'error', retry: state.retry, settingsHref: missing ? sedeSettingsHref(missing.id) : null };
  }
  return { status: 'ready', currency: null, source: null, defaultCurrency: null, scope, choose, reset };
}
