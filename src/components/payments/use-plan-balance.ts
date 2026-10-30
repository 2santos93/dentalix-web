'use client';
import { useEffect, useState } from 'react';
import { getPlanBalance, type PlanBalance } from '@/lib/payments/payments-api';

export type PlanBalanceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; balance: PlanBalance };

/**
 * DX-376: el saldo de un plan con cada abono en otra moneda ya convertido con
 * su tasa congelada (`GET /treatment-plans/:id/balance`), para decir lo que
 * queda pendiente tras un abono en otra moneda. La lista de planes cobrables
 * no sirve: no descuenta los abonos en otra moneda. Solo se pide mientras
 * `active`; la respuesta de otro plan que llega tarde se descarta.
 */
export function usePlanBalance(token: string, planId: string | null, active: boolean): PlanBalanceState {
  const [result, setResult] = useState<
    { key: string; balance: PlanBalance } | { key: string; failed: true } | null
  >(null);
  const enabled = active && planId !== null;
  // Cada vez que se activa (p. ej. al reabrir el modal tras otro abono) es
  // una lectura nueva: nunca se enseña el saldo de antes de ese abono.
  const [generation, setGeneration] = useState(0);
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled);
    if (enabled) setGeneration((g) => g + 1);
  }
  const key = `${planId}|${generation}`;

  useEffect(() => {
    if (!enabled || planId === null) return;
    let cancelled = false;
    getPlanBalance(token, planId).then(
      (balance) => {
        if (!cancelled) setResult({ key, balance });
      },
      () => {
        if (!cancelled) setResult({ key, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, planId, enabled, key]);

  if (!enabled) return { status: 'idle' };
  if (!result || result.key !== key) return { status: 'loading' };
  if ('failed' in result) return { status: 'error' };
  return { status: 'ready', balance: result.balance };
}
