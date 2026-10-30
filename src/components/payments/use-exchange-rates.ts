'use client';
import { useEffect, useState } from 'react';
import { getExchangeRates, type ExchangeRates } from '@/lib/exchange/exchange-api';

export type ExchangeRatesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; rates: ExchangeRates };

/**
 * Las tasas de un día para la clínica (DX-374: según su fuente, automática o
 * manual), las mismas con las que la API congela el abono de ese día (DX-375).
 * Solo se piden con `date` y mientras `active`; cambiar el día las vuelve a
 * pedir y una respuesta de otro día que llega tarde se descarta.
 */
export function useExchangeRates(token: string, date: string, active: boolean): ExchangeRatesState {
  const [result, setResult] = useState<
    { key: string; rates: ExchangeRates } | { key: string; failed: true } | null
  >(null);
  const [reloadKey, setReloadKey] = useState(0);
  const key = `${date}|${reloadKey}`;
  const enabled = active && date !== '';

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getExchangeRates(token, date).then(
      (rates) => {
        if (!cancelled) setResult({ key, rates });
      },
      () => {
        if (!cancelled) setResult({ key, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, date, enabled, key]);

  if (!enabled) return { status: 'idle' };
  if (!result || result.key !== key) return { status: 'loading' };
  if ('failed' in result) return { status: 'error', retry: () => setReloadKey((k) => k + 1) };
  return { status: 'ready', rates: result.rates };
}
