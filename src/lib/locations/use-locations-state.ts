'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSessionLocations } from '@/lib/locations/session-locations';
import type { ClinicLocation } from './locations-api';
import { getActiveLocationId, onLocationChange } from './location-store';

/**
 * Las sedes de la sesión y la sede activa, para las pantallas que sacan de
 * ellas la moneda (GLOBAL-G1). `error` si la lista no cargó: sin ella no se
 * sabe la moneda y la pantalla muestra `SedeConfigError` con este `retry`,
 * nunca una moneda de reserva.
 */
export type LocationsState =
  | { status: 'loading'; retry: () => void }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; locations: ClinicLocation[]; activeLocationId: string | null; retry: () => void };

export function useLocationsState(token: string): LocationsState {
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
        if (!cancelled) setLocations(data ?? []);
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

  if (locations === undefined) return { status: 'loading', retry };
  if (locations === null) return { status: 'error', retry };
  return { status: 'ready', locations, activeLocationId: activeId, retry };
}
