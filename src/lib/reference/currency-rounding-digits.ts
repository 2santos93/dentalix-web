'use client';
import { useEffect, useState } from 'react';
import { contractRoundingDigits, type RoundingDigits } from '@/lib/money/line-rounding';
import { listCurrencies } from './currencies-api';

/*
 * Dígitos de redondeo por moneda (DX-340, `GET /currencies`), leídos una vez
 * por pestaña y compartidos por quien los necesita: la vista previa de los
 * ajustes por medio de pago (DX-516) y la de las cuotas de un plan de pagos
 * (DX-488). La web no los adivina con una lista propia: mientras no llegan (o
 * si la API no los manda) son `null` y la pantalla dice «se calcula al…».
 */
let digitsCache: Promise<Map<string, number>> | null = null;

/** Mapa código → `roundingDigits` (`-1` si la API no lo manda). */
export function currencyRoundingDigits(token: string): Promise<Map<string, number>> {
  digitsCache ??= listCurrencies(token)
    .then((list) => new Map(list.map((c) => [c.code.toUpperCase(), c.roundingDigits ?? -1])))
    .catch((err: unknown) => {
      digitsCache = null;
      throw err;
    });
  return digitsCache;
}

/** Solo para las pruebas: olvida la caché de decimales. */
export function resetCurrencyRoundingDigitsCache(): void {
  digitsCache = null;
}

/** Los dígitos de un mapa ya leído, o `null` si no están o no son válidos. */
export function roundingDigitsOf(map: ReadonlyMap<string, number> | null, currency: string): RoundingDigits | null {
  return contractRoundingDigits(map ? { roundingDigits: map.get(currency.toUpperCase()) ?? -1 } : null);
}

/**
 * Los dígitos de redondeo de `currency`, o `null` mientras no se sepan. Solo
 * pide la lista con `enabled` (p. ej. el modal abierto); un fallo deja `null`.
 */
export function useCurrencyRoundingDigits(token: string, currency: string, enabled: boolean): RoundingDigits | null {
  const [digits, setDigits] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    currencyRoundingDigits(token).then(
      (map) => {
        if (!cancelled) setDigits(map);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [token, enabled]);
  return currency ? roundingDigitsOf(digits, currency) : null;
}
