'use client';
import { useEffect, useState } from 'react';
import { getAnamnesisInboxSummary } from '@/lib/anamnesis/anamnesis-api';

/** Cada cuánto se relee el contador mientras la app está abierta. */
const POLL_MS = 60_000;

/**
 * DX-099: cuántas anamnesis esperan revisión en las sedes de la sesión, para
 * el contador del menú. Se relee al cambiar de pantalla (p. ej. al volver de
 * aceptar una) y cada minuto. Un fallo deja el último valor: es un contador,
 * la bandeja tiene su propio estado de error.
 */
export function useAnamnesisInboxCount(token: string | null, enabled: boolean, pathname: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!token || !enabled) return;
    let cancelled = false;
    const load = () =>
      getAnamnesisInboxSummary(token)
        .then((summary) => {
          if (!cancelled) setCount(summary.submitted);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, enabled, pathname]);

  return enabled ? count : 0;
}
