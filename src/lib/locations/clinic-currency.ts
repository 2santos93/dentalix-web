'use client';
import { useSessionLocations } from '@/lib/locations/session-locations';
import { useEffect, useState } from 'react';
import type { ClinicLocation } from './locations-api';
import { clinicBaseCurrency } from './location-settings';

export { clinicBaseCurrency };

/**
 * PENDIENTE DE LA TASK 9 de GLOBAL-G1, que borra este fichero: la moneda sale
 * de la sede (`locationCurrency`), no del país. Solo lo leen aún la caja y el
 * modal de listas de precios, que la Task 9 migra.
 */
export const COUNTRY_CURRENCY: Record<ClinicLocation['country'], string> = {
  CO: 'COP',
  ES: 'EUR',
};

/**
 * `clinicBaseCurrency` de la clínica de la sesión. `undefined` mientras carga;
 * `null` si las sedes no cargaron o no comparten moneda.
 */
export function useClinicCurrency(token: string): string | null | undefined {
  const requestLocations = useSessionLocations(token);
  const [currency, setCurrency] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    requestLocations()
      .then((locations) => {
        if (!cancelled) setCurrency(clinicBaseCurrency(locations ?? []));
      })
      .catch(() => {
        if (!cancelled) setCurrency(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, requestLocations]);

  return currency;
}
