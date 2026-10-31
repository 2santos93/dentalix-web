'use client';
import { useEffect, useRef, useState } from 'react';
import { checkSubdomainAvailability, SUBDOMAIN_PATTERN, type SubdomainAvailability } from './register-api';

/**
 * Estado de la dirección web mientras se escribe en el registro:
 * - `idle`: vacía, o aún escribiendo (no se dice nada a cada tecla);
 * - `checking`: preguntando a la API;
 * - `available` / `taken` / `reserved` / `invalid`: la respuesta (el formato
 *   se comprueba aquí mismo, sin petición);
 * - `unknown`: no se pudo comprobar (red, límite): no se afirma nada y el
 *   envío lo comprobará (409).
 */
export type SubdomainStatus = 'idle' | 'checking' | SubdomainAvailability | 'unknown';

/** Como la Preview Rule de DESIGN.md: se dice una vez, al dejar de escribir. */
export const SUBDOMAIN_CHECK_DELAY_MS = 500;

export function useSubdomainAvailability(raw: string, delayMs = SUBDOMAIN_CHECK_DELAY_MS): SubdomainStatus {
  const subdomain = raw.trim().toLowerCase();
  const [result, setResult] = useState<{ subdomain: string; status: SubdomainStatus } | null>(null);
  // Solo vale la respuesta de la ÚLTIMA dirección pedida (llegan desordenadas).
  const latest = useRef('');

  useEffect(() => {
    latest.current = subdomain;
    if (!subdomain) return;
    const timer = setTimeout(() => {
      if (!SUBDOMAIN_PATTERN.test(subdomain)) {
        setResult({ subdomain, status: 'invalid' });
        return;
      }
      setResult({ subdomain, status: 'checking' });
      checkSubdomainAvailability(subdomain).then(
        (status) => {
          if (latest.current === subdomain) setResult({ subdomain, status });
        },
        () => {
          if (latest.current === subdomain) setResult({ subdomain, status: 'unknown' });
        },
      );
    }, delayMs);
    return () => clearTimeout(timer);
  }, [subdomain, delayMs]);

  // Un resultado de otra dirección (la de antes de la última tecla) no cuenta.
  if (!subdomain || result?.subdomain !== subdomain) return 'idle';
  return result.status;
}
