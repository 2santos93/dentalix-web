'use client';
import { useEffect, useState } from 'react';
import { listLocations, type ClinicLocation } from './locations-api';
import { getActiveLocationId, onLocationChange } from './location-store';

/**
 * Moneda base de la clínica (DX-063 / FE-014). La API no guarda una moneda por
 * clínica: la deriva el país de la sede (DX-013), que es el que fija la moneda
 * en la que se cobra allí.
 */
export const COUNTRY_CURRENCY: Record<ClinicLocation['country'], string> = {
  CO: 'COP',
  ES: 'EUR',
};

/**
 * La moneda de la sede activa; en la vista consolidada (o si la sede guardada
 * ya no está), la de la sede principal — `GET /locations` la devuelve primero —
 * entre las activas. `null` si no hay sedes.
 */
export function clinicBaseCurrency(
  locations: ClinicLocation[],
  activeLocationId: string | null,
): string | null {
  const active = activeLocationId ? locations.find((l) => l.id === activeLocationId) : undefined;
  const location = active ?? locations.find((l) => l.isActive) ?? locations[0];
  return location ? COUNTRY_CURRENCY[location.country] : null;
}

/**
 * `clinicBaseCurrency` de la sesión. `undefined` mientras carga; `null` si las
 * sedes no cargaron (quien la usa decide cómo pintar sin moneda). Sigue los
 * cambios de sede activa.
 */
export function useClinicCurrency(token: string): string | null | undefined {
  const [currency, setCurrency] = useState<string | null | undefined>(undefined);
  const [locationKey, setLocationKey] = useState(0);

  useEffect(() => onLocationChange(() => setLocationKey((k) => k + 1)), []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listLocations(token)
      .then((locations) => {
        if (!cancelled) setCurrency(clinicBaseCurrency(locations ?? [], getActiveLocationId()));
      })
      .catch(() => {
        if (!cancelled) setCurrency(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, locationKey]);

  return currency;
}
