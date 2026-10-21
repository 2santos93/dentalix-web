'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPriceQuote, type PriceQuote } from '@/lib/patients/patient-agreement-api';

export type PriceQuoteStatus = 'idle' | 'loading' | 'ready' | 'error';

interface QuoteRequest {
  token: string;
  patientId: string;
  catalogItemId: string;
  currency: string;
  attempt: number;
}

interface Settled {
  request: QuoteRequest;
  status: 'ready' | 'error';
  quote: PriceQuote | null;
}

export interface UsePriceQuoteResult {
  status: PriceQuoteStatus;
  /** Solo con `status === 'ready'`. */
  quote: PriceQuote | null;
  retry: () => void;
}

/**
 * DX-105: el precio resuelto de una prestación para el paciente (convenio,
 * lista de la sede o catálogo). Pide uno por (prestación, moneda) y descarta
 * la respuesta de una elección anterior (cancel-guard), así que cambiar de
 * prestación deprisa nunca deja el precio de otra. `onSettled` se llama una
 * vez por petición resuelta, con el presupuesto o `null` si falló.
 */
export function usePriceQuote(params: {
  token: string;
  patientId: string;
  catalogItemId: string;
  currency: string;
  onSettled?: (quote: PriceQuote | null) => void;
}): UsePriceQuoteResult {
  const { token, patientId, catalogItemId, currency } = params;
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const onSettledRef = useRef(params.onSettled);
  useEffect(() => {
    onSettledRef.current = params.onSettled;
  });

  const active = Boolean(catalogItemId && currency);
  // Cada transición crea una petición distinta, también C1 → vacío → C1 o
  // C1 → C2 → C1. Comparar solo los valores reutilizaría el resultado viejo
  // mientras llega la nueva respuesta. El token también cambia el contexto.
  const request = useMemo(
    () => ({ token, patientId, catalogItemId, currency, attempt }),
    [token, patientId, catalogItemId, currency, attempt],
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getPriceQuote(request.token, request.patientId, {
      catalogItemId: request.catalogItemId,
      currency: request.currency,
    }).then(
      (quote) => {
        if (cancelled) return;
        setSettled({ request, status: 'ready', quote });
        onSettledRef.current?.(quote);
      },
      () => {
        if (cancelled) return;
        setSettled({ request, status: 'error', quote: null });
        onSettledRef.current?.(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, request]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!active) return { status: 'idle', quote: null, retry };
  if (!settled || settled.request !== request) return { status: 'loading', quote: null, retry };
  return { status: settled.status, quote: settled.quote, retry };
}
