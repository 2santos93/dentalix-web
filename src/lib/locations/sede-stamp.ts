'use client';
import { useMemo } from 'react';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { civilNoonUtc } from '@/lib/time/civil-day';
import { NO_SEDE_FORMAT, moneyWithCode } from '@/lib/format/sede-number';
import { useLocationsState } from './use-locations-state';
import { sedeClockFor, type AgendaClock, type SedeClock, type SedeClockError } from './sede-clock';
import { SEDE_LOCALE_ERROR } from './use-sede-format';

/**
 * El pintor de fechas, horas e importes de una pantalla (DX-354b): cada valor se
 * pinta con la zona, el locale y el reloj de LA SEDE DEL DATO. Sin `locationId`
 * (el dato es de la clínica o del paciente y no trae sede) usa la de la
 * pantalla; con `locationId`, la de esa sede (`clock.of`), y si no se conoce o
 * le falta el formato, «—»: nunca la de la pantalla, nunca la del navegador.
 */
type Maybe<Args extends unknown[]> = (...args: Args) => string | null;

export interface SedePainters {
  /**
   * El formato de la sede de la pantalla (`null` cargando o sin formato), para
   * quien pinta con una zona que no es la de la sede: la de la ficha de un
   * paciente, p. ej. (`sedeDateLabel(value, timeZone, stamp.fmt)`).
   */
  fmt: RegionalFormat | null;
  /** El formato de la sede `locationId` (o el de la pantalla sin id): para medidas de una fila con el mismo formato que sus fechas. */
  fmtOf(locationId?: string | null): RegionalFormat | null;
  /** La fecha de un instante en la zona de la sede; «—» sin formato o con un instante inválido. */
  date(iso: string | null | undefined, locationId?: string | null): string;
  /** La hora de un instante con el reloj de la sede. */
  time(iso: string | null | undefined, locationId?: string | null): string;
  /** Fecha y hora de un instante, del mismo reloj. */
  dateTime(iso: string | null | undefined, locationId?: string | null): string;
  /** Un día civil (`YYYY-MM-DD`, o un ISO de medianoche UTC) con el formato de la sede: no usa zona. */
  civilDate(day: string | null | undefined, locationId?: string | null): string;
  /** Un importe con el formato de la sede y el código de su moneda. */
  money(amount: number, currency: string, locationId?: string | null): string;
  /**
   * Igual que los anteriores pero devuelve `null` sin formato: para `mobileCell`
   * de `DataList` (DESIGN «Tables»: la celda móvil se omite, no dice «—»).
   */
  maybe: {
    date: Maybe<[iso: string | null | undefined, locationId?: string | null]>;
    time: Maybe<[iso: string | null | undefined, locationId?: string | null]>;
    dateTime: Maybe<[iso: string | null | undefined, locationId?: string | null]>;
    civilDate: Maybe<[day: string | null | undefined, locationId?: string | null]>;
  };
}

export interface SedeStamp extends SedePainters {
  /** El reloj de la pantalla está listo (el aviso no se pinta mientras carga). */
  ready: boolean;
  /**
   * `scope: 'screen'` cuando falla la lista o la sede de la pantalla (lo muestra el dueño de la
   * página, una vez); `'row'` cuando falla la sede de una fila (lo muestra su sección).
   */
  /** El aviso de UNA sede sin formato: el error de la pantalla o la primera de `locationIds` que falle. */
  notice: (SedeClockError & { retry: () => void; scope: 'screen' | 'row' }) | null;
  /** El reloj de la pantalla, para lo que lo pide entero (`appointmentLine`, los modales de anestesia y sedación). */
  clock: AgendaClock | null;
}

function instant(iso: string | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso === '') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `YYYY-MM-DD` de un día civil o de un ISO que empieza por él; `null` si no existe ese día. */
function civilDay(value: string | null | undefined): string | null {
  const day = value?.slice(0, 10);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  try {
    civilNoonUtc(day);
    return day;
  } catch {
    return null;
  }
}

/** Los pintores sobre un reloj, sin hook: para `lib/**` y para las pruebas (D10). `null` = sin formato. */
export function stampPainters(clock: AgendaClock | null): SedePainters {
  const clockOf = (locationId?: string | null): SedeClock | null =>
    locationId ? (clock ? clock.of(locationId) : null) : clock;
  const maybe: SedePainters['maybe'] = {
    date(iso, locationId) {
      const c = clockOf(locationId);
      const d = instant(iso);
      return c && d ? c.fmt.date(d, c.timeZone) : null;
    },
    time(iso, locationId) {
      const c = clockOf(locationId);
      const d = instant(iso);
      return c && d ? c.fmt.time(d, c.timeZone) : null;
    },
    dateTime(iso, locationId) {
      const c = clockOf(locationId);
      const d = instant(iso);
      return c && d ? c.fmt.dateTime(d, c.timeZone) : null;
    },
    civilDate(day, locationId) {
      const c = clockOf(locationId);
      const value = civilDay(day);
      return c && value ? c.fmt.civilDate(value) : null;
    },
  };
  return {
    fmt: clock?.fmt ?? null,
    fmtOf: (locationId) => clockOf(locationId)?.fmt ?? null,
    date: (iso, locationId) => maybe.date(iso, locationId) ?? NO_SEDE_FORMAT,
    time: (iso, locationId) => maybe.time(iso, locationId) ?? NO_SEDE_FORMAT,
    dateTime: (iso, locationId) => maybe.dateTime(iso, locationId) ?? NO_SEDE_FORMAT,
    civilDate: (day, locationId) => maybe.civilDate(day, locationId) ?? NO_SEDE_FORMAT,
    money(amount, currency, locationId) {
      const c = clockOf(locationId);
      return c ? moneyWithCode(amount, currency, c.fmt) : NO_SEDE_FORMAT;
    },
    maybe,
  };
}

/**
 * El pintor de la pantalla. `locationIds` son las sedes de las filas que se
 * van a pintar: si alguna no tiene formato, `notice` la nombra (una vez por
 * pantalla, no por fila). Cargando: «—» y `notice` `null`. Error de la lista o
 * de la sede de la pantalla: «—» y `notice` con su reintento.
 */
export function useSedeStamp(token: string, locationIds?: readonly (string | null | undefined)[]): SedeStamp {
  const state = useLocationsState(token);
  // Dependencias estables (la lista y la sede activa), no `state`, que es un objeto nuevo en cada render:
  // así el reloj, los pintores y el `stamp` conservan su identidad entre renders.
  const locations = state.status === 'ready' ? state.locations : null;
  const activeId = state.status === 'ready' ? state.activeLocationId : null;
  const failed = state.status === 'error';
  const retry = state.retry;
  const result = useMemo(() => (locations ? sedeClockFor(locations, activeId) : null), [locations, activeId]);
  const clock = result?.status === 'ready' ? result.clock : null;
  const painters = useMemo(() => stampPainters(clock), [clock]);

  // Qué sede de las filas falla (una sola: el aviso es uno por pantalla).
  const failingRow = clock ? (locationIds?.find((id) => id && !clock.of(id)) ?? null) : null;
  const notice = useMemo<SedeStamp['notice']>(() => {
    if (failed) {
      return { status: 'error', kind: 'locale', message: SEDE_LOCALE_ERROR, locationId: null, retry, scope: 'screen' };
    }
    if (result && result.status === 'error') return { ...result, retry, scope: 'screen' };
    if (failingRow) {
      return { status: 'error', kind: 'locale', message: SEDE_LOCALE_ERROR, locationId: failingRow, retry, scope: 'row' };
    }
    return null;
  }, [failed, result, failingRow, retry]);

  return useMemo(() => ({ ...painters, ready: clock !== null, notice, clock }), [painters, clock, notice]);
}
