'use client';
import { useEffect, useState } from 'react';
import { getExchangeRateSettings, type ExchangeRateSettings } from '@/lib/exchange/exchange-settings-api';

export type ExchangeRateSettingsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; settings: ExchangeRateSettings };

/**
 * DX-386: la fuente de la tasa de la clínica (`GET /exchange/settings`), para
 * que un aviso diga qué hacer según sea automática o manual. Ese endpoint es
 * solo del ADMIN: quien lo usa pasa `active` en falso para el resto de roles,
 * y así no se pide (un 403 ensuciaría la consola).
 */
export function useExchangeRateSettings(token: string, active: boolean): ExchangeRateSettingsState {
  const [result, setResult] = useState<
    { token: string; settings: ExchangeRateSettings } | { token: string; failed: true } | null
  >(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getExchangeRateSettings(token).then(
      (settings) => {
        if (!cancelled) setResult({ token, settings });
      },
      () => {
        if (!cancelled) setResult({ token, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, active]);

  if (!active) return { status: 'idle' };
  if (!result || result.token !== token) return { status: 'loading' };
  if ('failed' in result) return { status: 'error' };
  return { status: 'ready', settings: result.settings };
}
