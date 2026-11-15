'use client';
import { useEffect, useRef } from 'react';
import { currentlyOffline } from '@/lib/offline/connectivity';

export interface VisibleRefreshOptions {
  /** Cada cuánto se relee mientras la pestaña está visible. */
  intervalMs: number;
  /**
   * Al volver a la pestaña solo se relee si la última lectura tiene más de
   * esto (0 = siempre). `lastLoadedAt` dice cuándo fue.
   */
  staleMs?: number;
  lastLoadedAt?: () => number;
}

/**
 * Relectura de fondo de una pantalla viva (DX-046; el patrón nació en el panel
 * «En clínica», `use-in-clinic`): cada `intervalMs` con la pestaña visible y,
 * al volver a ella (`visibilitychange`), si los datos están viejos. Con la
 * pestaña oculta no corre nada, y sin conexión (DX-405) tampoco: no se pide
 * nada que solo podría fallar; al volver la red, la pantalla ya se relee sola.
 *
 * Devuelve la limpieza (para usar dentro de un efecto que ya existe).
 */
export function startVisibleRefresh(
  refresh: () => void,
  { intervalMs, staleMs = 0, lastLoadedAt = () => 0 }: VisibleRefreshOptions,
): () => void {
  const canRun = () => !document.hidden && !currentlyOffline();
  const timer = window.setInterval(() => {
    if (canRun()) refresh();
  }, intervalMs);
  const onVisible = () => {
    if (canRun() && Date.now() - lastLoadedAt() >= staleMs) refresh();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/**
 * `startVisibleRefresh` como hook: `refresh` puede cambiar en cada render (se
 * llama siempre la última); el intervalo solo se rearma si cambian las
 * opciones o `enabled`.
 */
export function useVisibleRefresh(
  refresh: () => void,
  { enabled = true, intervalMs, staleMs = 0 }: { enabled?: boolean; intervalMs: number; staleMs?: number },
): void {
  const refreshRef = useRef(refresh);
  const lastRunRef = useRef(0);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  useEffect(() => {
    if (!enabled) return;
    lastRunRef.current = Date.now();
    return startVisibleRefresh(
      () => {
        lastRunRef.current = Date.now();
        refreshRef.current();
      },
      { intervalMs, staleMs, lastLoadedAt: () => lastRunRef.current },
    );
  }, [enabled, intervalMs, staleMs]);
}
