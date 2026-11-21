'use client';
import { useEffect, useId, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  EXCHANGE_REFRESH_COOLDOWN_MS,
  notifyExchangeRatesChanged,
  refreshExchangeRates,
} from '@/lib/exchange/exchange-header-api';
import { setRateRefreshAvailableAt, useRateRefreshAvailableAt } from '@/lib/exchange/rate-refresh-store';
import { Button } from '@/components/ui/button';

export const rateRefreshCopy = {
  refresh: 'Actualizar tasa',
  refreshing: 'Actualizando la tasa…',
  /** Tras usarlo: la API deja una consulta cada 5 min por clínica. */
  wait: (minutes: number) =>
    minutes <= 1 ? 'Puedes volver a actualizarla en 1 min.' : `Puedes volver a actualizarla en ${minutes} min.`,
  done: 'Tasa actualizada.',
  failed: 'No pudimos actualizar la tasa. Intenta de nuevo.',
};

const copy = rateRefreshCopy;
/** Cada cuánto se repinta el tiempo que falta (en minutos redondeados hacia arriba). */
const TICK_MS = 15_000;

/**
 * DX-586: «Actualizar tasa» dentro del popover del indicador. Vuelve a
 * consultar la tasa de hoy (BCV u automática) y, si llega, el menú y el cobro
 * se releen con `EXCHANGE_RATES_CHANGED_EVENT`. Tras usarlo (o con un 429) se
 * deshabilita y dice cuánto falta. El resultado se anuncia en un `role="status"`.
 * Con la fuente manual no se pinta (lo decide el indicador).
 */
export function RateRefreshControl({ token }: { token: string }) {
  const availableAt = useRateRefreshAvailableAt();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const waiting = availableAt > now;

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    const until = setTimeout(() => setNow(Date.now()), Math.max(0, availableAt - Date.now()) + 50);
    return () => {
      clearInterval(timer);
      clearTimeout(until);
    };
  }, [waiting, availableAt]);

  async function handleRefresh() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await refreshExchangeRates(token);
      setRateRefreshAvailableAt(Date.now() + EXCHANGE_REFRESH_COOLDOWN_MS);
      if (result.refresh.ok) {
        setMessage({ text: copy.done, tone: 'ok' });
        notifyExchangeRatesChanged();
      } else {
        setMessage({ text: result.refresh.message ?? copy.failed, tone: 'warn' });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const seconds = err.retryAfterSeconds ?? EXCHANGE_REFRESH_COOLDOWN_MS / 1000;
        setRateRefreshAvailableAt(Date.now() + seconds * 1000);
      }
      setMessage({ text: apiErrorMessage(err, copy.failed), tone: 'warn' });
    } finally {
      setNow(Date.now());
      setBusy(false);
    }
  }

  const minutesLeft = Math.max(1, Math.ceil((availableAt - now) / 60_000));
  const hintId = useId();
  return (
    <div className="mt-3 flex flex-col gap-1.5 border-t border-border-subtle pt-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleRefresh}
        disabled={busy || waiting}
        aria-busy={busy || undefined}
        aria-describedby={waiting ? hintId : undefined}
        className="w-full"
      >
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : <RefreshCw aria-hidden />}
        {busy ? copy.refreshing : copy.refresh}
      </Button>
      {waiting ? (
        <p id={hintId} className="text-xs text-muted">
          {copy.wait(minutesLeft)}
        </p>
      ) : null}
      <p
        role="status"
        data-testid="rate-refresh-status"
        className={
          message ? (message.tone === 'ok' ? 'text-xs text-success-text' : 'text-xs text-warning-text') : 'sr-only'
        }
      >
        {message?.text ?? ''}
      </p>
    </div>
  );
}
