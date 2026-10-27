'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { useSessionLocations } from '@/lib/locations/session-locations';

export interface ExpenseLocationsState {
  /**
   * Todas las sedes, también las inactivas: un gasto de una sede ya cerrada
   * sigue diciendo de cuál es y en qué zona cuenta su día. Los selectores
   * ofrecen solo las activas.
   */
  locations: ClinicLocation[];
  /** La lista cargó al menos una vez. */
  loaded: boolean;
  failed: boolean;
  reload: () => void;
}

/** Las sedes de la clínica para la pantalla de gastos, con reintento. */
export function useExpenseLocations(token: string): ExpenseLocationsState {
  const requestLocations = useSessionLocations(token);
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    requestLocations()
      .then((all) => {
        if (cancelled) return;
        setLocations(all);
        setLoaded(true);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, requestLocations, attempt]);

  const reload = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  return { locations, loaded, failed, reload };
}
