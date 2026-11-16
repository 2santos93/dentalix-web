'use client';
import { useEffect, useState } from 'react';
import { getHolidayOnDay } from '@/lib/locations/location-calendar-api';
import { Callout } from '@/components/ui/callout';

const copy = {
  holiday: (name: string) => `Ese día la sede está cerrada por festivo (${name}): elige otro día.`,
  failed: 'No pudimos comprobar si ese día es festivo.',
};

/** DX-263-bis: el texto que frena el guardado (el mismo del aviso). */
export const holidayClosedMessage = copy.holiday;

type Lookup = { key: string; name: string | null } | { key: string; failed: true };

/** Lo que se sabe del día elegido en la sede: festivo con nombre, normal, sin poder mirar o aún sin saber. */
export type HolidayState =
  | { status: 'idle' }
  | { status: 'holiday'; name: string }
  | { status: 'open' }
  | { status: 'failed' };

/**
 * DX-358 / DX-263-bis: ¿el día elegido es festivo en la sede? Lo leído para
 * otro día o sede no vale. Con un festivo la API rechaza la cita (409
 * `LOCATION_HOLIDAY`); esto lo avisa ANTES de guardar.
 */
export function useHolidayOnDay(token: string, locationId: string | null | undefined, date: string): HolidayState {
  const key = locationId && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${locationId}|${date}` : null;
  const [lookup, setLookup] = useState<Lookup | null>(null);

  useEffect(() => {
    if (!key || !locationId) return;
    let cancelled = false;
    getHolidayOnDay(token, locationId, date)
      .then(({ name }) => {
        if (!cancelled) setLookup({ key, name });
      })
      .catch(() => {
        if (!cancelled) setLookup({ key, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [token, key, locationId, date]);

  if (!key || lookup?.key !== key) return { status: 'idle' };
  if ('failed' in lookup) return { status: 'failed' };
  return lookup.name ? { status: 'holiday', name: lookup.name } : { status: 'open' };
}

/**
 * Pinta lo que dice `useHolidayOnDay`: un festivo cierra la sede ese día (no
 * se puede agendar ni mover ahí; si la clínica abre, se retira el festivo en
 * Ajustes → Calendario). Si la consulta falla lo dice sin impedir nada: la
 * API tiene la última palabra.
 */
export function HolidayNotice({ state }: { state: HolidayState }) {
  if (state.status === 'failed') {
    return (
      <p role="status" className="text-xs text-muted">
        {copy.failed}
      </p>
    );
  }
  return state.status === 'holiday' ? (
    <Callout tone="warning" role="status" data-testid="holiday-notice">
      {copy.holiday(state.name)}
    </Callout>
  ) : null;
}
