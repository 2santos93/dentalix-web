'use client';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import type { ClinicLocation } from './locations-api';
import { locationRegionalFormat, locationTimeZone } from './location-settings';
import { useLocationsState } from './use-locations-state';
import { SEDE_LOCALE_ERROR } from './use-sede-format';
import { NO_ACTIVE_LOCATION_ERROR, SEDE_TIME_ZONE_ERROR } from './use-sede-time-zone';

/**
 * Reloj de una sede (DX-378): su zona IANA y su formato (locale y 12/24 h).
 * Con él se pinta una hora tal como la ve la sede, se cuentan sus días y se
 * pasa una hora elegida a un instante. Nunca la zona ni el formato del
 * navegador, ni los de otra sede.
 */
export interface SedeClock {
  readonly timeZone: string;
  readonly fmt: RegionalFormat;
}

/**
 * El reloj de una pantalla con citas de varias sedes (la agenda): el de la
 * sede de la pantalla (cuenta los días, ordena la rejilla) y, con `of`, el de
 * la sede de cada cita, que es con el que se pinta su hora.
 */
export interface AgendaClock extends SedeClock {
  /** Reloj de la sede `locationId`; `null` si no está en la lista o le falta la zona o el formato. */
  of(locationId: string | null | undefined): SedeClock | null;
}

export type SedeClockError = {
  status: 'error';
  /** Qué falta: la zona, o el formato y el reloj (también si la lista de sedes no cargó). */
  kind: 'timeZone' | 'locale';
  message: string;
  /** La sede a la que le falta, si se sabe: «Configurar sede» abre su modal. */
  locationId: string | null;
};

export type SedeClockState =
  | { status: 'loading' }
  | { status: 'ready'; clock: AgendaClock }
  | (SedeClockError & { retry: () => void });

/** Zona y formato de la sede, o `null` si le falta alguno o este navegador no los entiende. */
export function locationClock(
  location: Pick<ClinicLocation, 'timeZone' | 'locale' | 'hourCycle'> | null | undefined,
): SedeClock | null {
  const timeZone = locationTimeZone(location);
  const fmt = locationRegionalFormat(location);
  return timeZone && fmt ? { timeZone, fmt } : null;
}

/**
 * La sede de la pantalla: la activa; en «Todas las sedes» (o con una activa
 * que ya no está), la principal (la activa más antigua, R6). La lista llega de
 * la API ordenada por antigüedad.
 */
export function screenLocation(
  locations: readonly ClinicLocation[],
  activeLocationId: string | null,
): ClinicLocation | undefined {
  return (
    (activeLocationId ? locations.find((l) => l.id === activeLocationId) : undefined) ??
    locations.find((l) => l.isActive)
  );
}

/**
 * El reloj de la pantalla: el de la sede `locationId` si se pide una; si no,
 * el de la sede activa; en «Todas las sedes» (o con una activa que ya no
 * está), el de la principal (la activa más antigua, R6), la misma regla que
 * `useSedeTimeZone` y `useSedeFormat`.
 */
export function sedeClockFor(
  locations: readonly ClinicLocation[],
  activeLocationId: string | null,
  locationId?: string | null,
): { status: 'ready'; clock: AgendaClock } | SedeClockError {
  const byId = (id: string | null | undefined) => (id ? locations.find((l) => l.id === id) : undefined);
  const screen = locationId ? byId(locationId) : screenLocation(locations, activeLocationId);
  if (!screen) {
    return locationId
      ? { status: 'error', kind: 'locale', message: SEDE_LOCALE_ERROR, locationId }
      : { status: 'error', kind: 'timeZone', message: NO_ACTIVE_LOCATION_ERROR, locationId: null };
  }
  if (!locationTimeZone(screen)) {
    return { status: 'error', kind: 'timeZone', message: SEDE_TIME_ZONE_ERROR, locationId: screen.id };
  }
  const own = locationClock(screen);
  if (!own) return { status: 'error', kind: 'locale', message: SEDE_LOCALE_ERROR, locationId: screen.id };
  const clocks = new Map<string, SedeClock | null>();
  return {
    status: 'ready',
    clock: {
      ...own,
      of: (id) => {
        if (!id) return null;
        if (!clocks.has(id)) clocks.set(id, locationClock(byId(id)));
        return clocks.get(id) ?? null;
      },
    },
  };
}

/**
 * Reloj de la sede de la pantalla (o de `locationId`), leído de la API.
 * `loading` mientras carga; si la lista falla o a la sede le falta la zona o
 * el formato, `error` con su reintento (vuelve a leer las sedes). Sigue el
 * cambio de sede.
 */
export function useSedeClock(token: string, locationId?: string | null): SedeClockState {
  const state = useLocationsState(token);
  if (state.status === 'loading') return { status: 'loading' };
  if (state.status === 'error') {
    return { status: 'error', kind: 'locale', message: SEDE_LOCALE_ERROR, locationId: null, retry: state.retry };
  }
  const result = sedeClockFor(state.locations, state.activeLocationId, locationId);
  return result.status === 'ready' ? result : { ...result, retry: state.retry };
}

/** La hora del instante en la zona y con el reloj de la sede; «—» sin reloj. */
export function sedeTime(iso: string, clock: SedeClock | null): string {
  return clock ? clock.fmt.time(new Date(iso), clock.timeZone) : NO_SEDE_FORMAT;
}

/**
 * «09:00–09:30» con 24 h; «9:00 a. m. – 9:30 a. m.» con 12 h (con espacios,
 * para que el guion no pegue «m.» con la cifra). «—» sin reloj.
 */
export function sedeTimeRange(start: string, end: string, clock: SedeClock | null): string {
  if (!clock) return NO_SEDE_FORMAT;
  const separator = clock.fmt.hourCycle === 'h12' ? ' – ' : '–';
  return `${sedeTime(start, clock)}${separator}${sedeTime(end, clock)}`;
}

/** Un minuto del día (0–1440) con el reloj de la sede; 1440 es el fin del día («24:00» o «12:00 a. m.»). */
export function sedeMinute(minute: number, fmt: RegionalFormat): string {
  if (minute === 24 * 60) return fmt.hourCycle === 'h23' ? '24:00' : fmt.clock(0, 0);
  return fmt.clock(Math.floor(minute / 60), minute % 60);
}

/** «09:00–13:00, 15:00–19:00» / «9:00 a. m. – 1:00 p. m., …», ordenados; «» sin tramos. */
export function sedeMinuteRanges(
  ranges: readonly { startMinute: number; endMinute: number }[],
  fmt: RegionalFormat,
): string {
  const separator = fmt.hourCycle === 'h12' ? ' – ' : '–';
  return [...ranges]
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((r) => `${sedeMinute(r.startMinute, fmt)}${separator}${sedeMinute(r.endMinute, fmt)}`)
    .join(', ');
}
