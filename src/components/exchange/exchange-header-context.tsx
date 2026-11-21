'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getActiveLocationId, onLocationChange } from '@/lib/locations/location-store';
import {
  EXCHANGE_RATES_CHANGED_EVENT,
  getExchangeHeader,
  type ExchangeHeader,
} from '@/lib/exchange/exchange-header-api';

/** Cada cuánto se relee con la pestaña visible (DX-584: «cada 5 min»). */
export const EXCHANGE_HEADER_POLL_MS = 5 * 60_000;
/**
 * Al volver a la pestaña llegan `focus` y `visibilitychange` casi a la vez:
 * una lectura de hace menos de esto ya vale (el límite de la API es 60/min).
 */
const FOCUS_MIN_AGE_MS = 10_000;

export type ExchangeHeaderState =
  | { status: 'loading' }
  /** Sin datos y la lectura falló: el menú no enseña nada y el cobro no filtra. */
  | { status: 'error' }
  | { status: 'ready'; header: ExchangeHeader };

const ExchangeHeaderContext = createContext<ExchangeHeaderState | null>(null);

/**
 * DX-584: UNA lectura de `GET /exchange/header` para toda la app. La usan el
 * indicador de la tasa del menú y el selector de moneda del cobro (las monedas
 * aceptadas, con cualquier rol). Se relee al montar, al cambiar de sede, al
 * volver a la pestaña, cada 5 minutos con la pestaña visible y al recibir
 * `EXCHANGE_RATES_CHANGED_EVENT` (guardar una tasa manual, la fuente, el plazo
 * o las monedas). Un fallo de una relectura deja lo último bueno: es un
 * indicador, y la tasa con la que se cobra la decide la API al registrar.
 */
export function ExchangeHeaderProvider({ token, children }: { token: string | null; children: ReactNode }) {
  const [state, setState] = useState<{ scope: string; value: ExchangeHeaderState }>({
    scope: '',
    value: { status: 'loading' },
  });
  const [scope, setScope] = useState<string | null>(null);
  const lastAt = useRef(0);

  useEffect(() => {
    const read = () => setScope(getActiveLocationId() ?? 'all');
    read();
    return onLocationChange(read);
  }, []);

  useEffect(() => {
    if (!token || scope === null) return;
    let cancelled = false;
    let inFlight = false;
    const load = () => {
      if (inFlight) return;
      inFlight = true;
      getExchangeHeader(token)
        .then((header) => {
          if (cancelled) return;
          lastAt.current = Date.now();
          setState({ scope, value: { status: 'ready', header } });
        })
        .catch(() => {
          if (cancelled) return;
          // Con datos de esta sede, se quedan; sin ellos, error (no se pinta nada).
          setState((prev) =>
            prev.scope === scope && prev.value.status === 'ready' ? prev : { scope, value: { status: 'error' } },
          );
        })
        .finally(() => {
          inFlight = false;
        });
    };
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, EXCHANGE_HEADER_POLL_MS);
    const onBack = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastAt.current >= FOCUS_MIN_AGE_MS) load();
    };
    const onChanged = () => load();
    window.addEventListener(EXCHANGE_RATES_CHANGED_EVENT, onChanged);
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(EXCHANGE_RATES_CHANGED_EVENT, onChanged);
      window.removeEventListener('focus', onBack);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [token, scope]);

  const value = state.scope === scope ? state.value : ({ status: 'loading' } as const);
  return <ExchangeHeaderContext.Provider value={value}>{children}</ExchangeHeaderContext.Provider>;
}

/** El estado de la lectura; sin proveedor (pantallas sueltas, pruebas), `loading`. */
export function useExchangeHeader(): ExchangeHeaderState {
  return useContext(ExchangeHeaderContext) ?? LOADING;
}

const LOADING: ExchangeHeaderState = { status: 'loading' };

/**
 * Las monedas en que la clínica acepta cobros, en su orden, para el
 * `CurrencySelect` del cobro (abono suelto, dividido y vuelto). `null` =
 * sin restricción: la clínica no configuró ninguna, o aún no se sabe (la API
 * rechaza igualmente una moneda no aceptada con un 400 claro).
 */
export function useAcceptedPaymentCurrencies(): readonly string[] | null {
  const state = useExchangeHeader();
  const accepted = state.status === 'ready' ? state.header.acceptedCurrencies : null;
  // Misma referencia mientras no cambie la lista: los efectos que dependen de ella no se repiten.
  const key = accepted?.join(',') ?? '';
  return useMemo(() => (key === '' ? null : key.split(',')), [key]);
}

/** Para las pruebas: un valor fijo sin pedir nada a la API. */
export function ExchangeHeaderTestProvider({ value, children }: { value: ExchangeHeaderState; children: ReactNode }) {
  return <ExchangeHeaderContext.Provider value={value}>{children}</ExchangeHeaderContext.Provider>;
}
