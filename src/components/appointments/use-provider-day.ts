'use client';
import { useEffect, useState } from 'react';
import {
  getProviderScheduleSettings,
  getRoster,
  type MinuteRangeDto,
} from '@/lib/locations/provider-schedule-api';
import { rosterDayOf } from '@/lib/locations/provider-schedule';
import { getActiveLocationId } from '@/lib/locations/location-store';

export interface ProviderDay {
  /** Tramos del profesional ese día en la sede activa; `null` = sin restricción o sin dato. */
  ranges: MinuteRangeDto[] | null;
  /** Modo estricto de la clínica (la API rechazará con 409). */
  strict: boolean;
}

const NONE: ProviderDay = { ranges: null, strict: false };

/**
 * DX-233: el horario del profesional `providerId` el día `date` en la sede
 * ACTIVA, para avisar antes de enviar una cita. Best-effort: sin sede activa
 * («Todas las sedes») o si falla, no hay restricción que enseñar — la API
 * sigue siendo la autoridad (aviso o 409).
 */
export function useProviderDay(token: string, providerId: string, date: string, explicitLocationId?:string): ProviderDay {
  const [loaded, setLoaded] = useState<{ key: string; day: ProviderDay } | null>(null);
  const locationId = explicitLocationId ?? getActiveLocationId();
  const key = locationId && providerId && date ? `${locationId}|${providerId}|${date}` : null;

  useEffect(() => {
    if (!key || !locationId) return;
    let cancelled = false;
    Promise.all([
      getRoster(token, { weekStart: date, days: 1, locationId }),
      getProviderScheduleSettings(token).catch(() => ({ strictProviderSchedule: false })),
    ])
      .then(([roster, settings]) => {
        if (cancelled) return;
        setLoaded({
          key,
          day: {
            ranges: rosterDayOf(roster, providerId, date)?.locationRanges ?? null,
            strict: settings.strictProviderSchedule,
          },
        });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, day: NONE });
      });
    return () => {
      cancelled = true;
    };
  }, [token, key, locationId, providerId, date]);

  return loaded && loaded.key === key ? loaded.day : NONE;
}
