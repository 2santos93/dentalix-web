'use client';
import { useEffect, useState } from 'react';
import { getExchangeRates, type ExchangeRates } from '@/lib/exchange/exchange-api';

/** Espera tras el último cambio de día antes de pedir sus tasas. */
const RATES_DEBOUNCE_MS = 300;

export type ExchangeRatesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; rates: ExchangeRates };

/**
 * Las tasas de un día para la clínica (DX-374: según su fuente, automática o
 * manual), las mismas con las que la API congela el abono de ese día (DX-375).
 * Solo se piden con `date` y mientras `active`; cambiar el día las vuelve a
 * pedir (cuando el día deja de cambiar) y una respuesta de otro día que llega
 * tarde se descarta.
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
    // Un <input type="date"> emite días intermedios mientras se teclea el año
    // (0002-…, 0020-…): solo se pide el día en el que la fecha se queda quieta,
    // así no se consulta (ni se le pide al proveedor) cada uno de ellos.
    const timer = setTimeout(() => {
      getExchangeRates(token, date).then(
        (rates) => {
          if (!cancelled) setResult({ key, rates });
        },
        () => {
          if (!cancelled) setResult({ key, failed: true });
        },
      );
    }, RATES_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, date, enabled, key]);

  if (!enabled) return { status: 'idle' };
  if (!result || result.key !== key) return { status: 'loading' };
  if ('failed' in result) return { status: 'error', retry: () => setReloadKey((k) => k + 1) };
  return { status: 'ready', rates: result.rates };
}
