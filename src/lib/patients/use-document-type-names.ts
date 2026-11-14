'use client';
import { useEffect, useState } from 'react';
import type { ClinicDocumentTypeNames } from './doc-type';
import { onLocationChange } from '@/lib/locations/location-store';
import { getDocumentTypeNames } from './document-type-names-api';

/**
 * DX-327 (spec §6.2): los nombres locales de la clínica para los selects y la
 * ficha. Empieza en `{}` (genéricos) y nunca bloquea: si la lectura falla, se
 * queda con los genéricos.
 */
export function useDocumentTypeNames(token: string | null | undefined): ClinicDocumentTypeNames {
  const [names, setNames] = useState<ClinicDocumentTypeNames>({});
  // DX-524: los nombres son los de la sede activa; al cambiarla se vuelven a pedir.
  const [locationTick, setLocationTick] = useState(0);
  useEffect(() => onLocationChange(() => setLocationTick((n) => n + 1)), []);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    // `Promise.resolve().then`: un fallo síncrono también cae a los genéricos.
    Promise.resolve()
      .then(() => getDocumentTypeNames(token))
      .then(
        (loaded) => {
          if (alive && loaded) setNames(loaded);
        },
        () => {
          // Sin nombres de la clínica: los genéricos bastan para elegir el tipo.
        },
      );
    return () => {
      alive = false;
    };
  }, [token, locationTick]);
  return names;
}
