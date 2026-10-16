'use client';
import { useEffect, useState } from 'react';
import { listLocations, type ClinicLocation } from './locations-api';

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
 * La moneda común de las sedes ACTIVAS de la clínica, o `null` si no hay sedes
 * activas o si son de países con monedas distintas (revisión D-3). Es para datos
 * de toda la clínica, como el catálogo: `defaultPrice` no lleva moneda, así que
 * con sedes en Colombia y España no se puede saber si son pesos o euros, y la
 * sede elegida en el selector no lo decide. Sin moneda, el importe va sin
 * símbolo.
 */
export function clinicBaseCurrency(locations: ClinicLocation[]): string | null {
  const currencies = new Set(
    locations.filter((l) => l.isActive).map((l) => COUNTRY_CURRENCY[l.country]),
  );
  return currencies.size === 1 ? [...currencies][0] : null;
}

/**
 * `clinicBaseCurrency` de la clínica de la sesión. `undefined` mientras carga;
 * `null` si las sedes no cargaron o no comparten moneda.
 */
export function useClinicCurrency(token: string): string | null | undefined {
  const [currency, setCurrency] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listLocations(token)
      .then((locations) => {
        if (!cancelled) setCurrency(clinicBaseCurrency(locations ?? []));
      })
      .catch(() => {
        if (!cancelled) setCurrency(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return currency;
}
