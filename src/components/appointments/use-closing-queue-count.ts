'use client';
import { useEffect, useState } from 'react';
import { getClosingQueueCount } from '@/lib/appointments/closing-queue-api';

/** Cada cuánto se relee el contador mientras la app está abierta. */
const POLL_MS = 60_000;

/**
 * DX-439: cuántos pendientes de cierre tiene el usuario (las secciones de su
 * rol, en sus sedes), para el contador del menú. Se relee al cambiar de
 * pantalla y cada minuto; un fallo deja el último valor (la página tiene su
 * propio estado de error).
 */
export function useClosingQueueCount(token: string | null, enabled: boolean, pathname: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!token || !enabled) return;
    let cancelled = false;
    const load = () =>
      getClosingQueueCount(token)
        .then((summary) => {
          if (!cancelled) setCount(summary.total);
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
