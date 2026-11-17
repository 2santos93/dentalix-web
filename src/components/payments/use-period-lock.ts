'use client';
import { useEffect, useState } from 'react';
import { getPeriodLock, type PeriodLock } from '@/lib/financial-lock/financial-lock-api';

export type PeriodLockState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; lock: PeriodLock };

/**
 * DX-091: el cierre contable vigente en la sede donde se registra
 * (`GET /payments/period-lock`). Solo se pide mientras `active`; cada
 * activación (p. ej. al reabrir el modal) es una lectura nueva. Si falla, el
 * formulario sigue: la API vuelve a aplicar la regla y responde 409 en español.
 */
export function usePeriodLock(token: string, active: boolean): PeriodLockState {
  const [result, setResult] = useState<{ key: number; lock: PeriodLock } | { key: number; failed: true } | null>(null);
  const [generation, setGeneration] = useState(0);
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (active) setGeneration((g) => g + 1);
  }

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getPeriodLock(token).then(
      (lock) => {
        if (!cancelled) setResult({ key: generation, lock });
      },
      () => {
        if (!cancelled) setResult({ key: generation, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, active, generation]);

  if (!active) return { status: 'idle' };
  if (!result || result.key !== generation) return { status: 'loading' };
  if ('failed' in result) return { status: 'error' };
  return { status: 'ready', lock: result.lock };
}

/** El cierre listo o «sin cierre conocido» (cargando o error: decide la API). */
export function readyPeriodLock(state: PeriodLockState): PeriodLock | null {
  return state.status === 'ready' ? state.lock : null;
}
