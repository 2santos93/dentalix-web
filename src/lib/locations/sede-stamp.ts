'use client';
import { useMemo } from 'react';
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
  /** El aviso de UNA sede sin formato: el error de la pantalla o la primera de `locationIds` que falle. */
  notice: (SedeClockError & { retry: () => void }) | null;
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
  const result = useMemo(
    () => (state.status === 'ready' ? sedeClockFor(state.locations, state.activeLocationId) : null),
    [state],
  );
  const clock = result?.status === 'ready' ? result.clock : null;
  const painters = useMemo(() => stampPainters(clock), [clock]);

  let notice: SedeStamp['notice'] = null;
  if (state.status === 'error') {
    notice = { status: 'error', kind: 'locale', message: SEDE_LOCALE_ERROR, locationId: null, retry: state.retry };
  } else if (result && result.status === 'error') {
    notice = { ...result, retry: state.retry };
  } else if (clock) {
    const failing = locationIds?.find((id) => id && !clock.of(id));
    if (failing) {
      notice = { status: 'error', kind: 'locale', message: SEDE_LOCALE_ERROR, locationId: failing, retry: state.retry };
    }
  }
  return { ...painters, ready: clock !== null, notice };
}
