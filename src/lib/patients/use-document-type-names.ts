'use client';
import { useEffect, useState } from 'react';
import type { ClinicDocumentTypeNames } from './doc-type';
import { getDocumentTypeNames } from './document-type-names-api';

/**
 * DX-327 (spec §6.2): los nombres locales de la clínica para los selects y la
 * ficha. Empieza en `{}` (genéricos) y nunca bloquea: si la lectura falla, se
 * queda con los genéricos.
 */
export function useDocumentTypeNames(token: string | null | undefined): ClinicDocumentTypeNames {
  const [names, setNames] = useState<ClinicDocumentTypeNames>({});
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
  }, [token]);
  return names;
}
