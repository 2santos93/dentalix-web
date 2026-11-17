'use client';
import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  sendWeeklyDigestTest,
  WEEKLY_DIGEST_EMAIL_NOT_VERIFIED,
  type WeeklyDigestTestResult,
} from '@/lib/clinic/weekly-digest-api';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/errors/inline-error';

export const weeklyDigestTestCopy = {
  send: 'Enviarme una prueba',
  sent: (to: string) => `Te enviamos la prueba a ${to}. Llega con «[Prueba]» en el asunto.`,
  sentWeek: (to: string, from: string, until: string) =>
    `Te enviamos la prueba a ${to}, con la semana del ${from} al ${until}. Llega con «[Prueba]» en el asunto.`,
  notVerified:
    'Confirma tu correo antes de pedir una prueba: el resumen solo se envía a correos confirmados.',
  error: 'No pudimos enviar la prueba.',
};

const copy = weeklyDigestTestCopy;

/**
 * DX-568: «Enviarme una prueba». La API manda ahora, solo a quien lo pide, el
 * resumen de la semana anterior completa (no cuenta como el envío semanal).
 * Una cada 5 minutos por persona: tras un 429 el botón espera lo que diga la
 * API (`retryAfterSeconds`) y el porqué es su mensaje.
 */
export function WeeklyDigestTestSend({ token }: { token: string }) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<WeeklyDigestTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Las fechas de la semana, con el formato de la sede (sin él, sin fechas).
  const fmt = readyFormat(useSedeFormat(token));

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      setResult(await sendWeeklyDigestTest(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === WEEKLY_DIGEST_EMAIL_NOT_VERIFIED) {
        setError(copy.notVerified);
      } else {
        setError(apiErrorMessage(err, copy.error));
        if (err instanceof ApiError && err.status === 429 && err.retryAfterSeconds) {
          setWaiting(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setWaiting(false), err.retryAfterSeconds * 1000);
        }
      }
    } finally {
      setSending(false);
    }
  }

  const sentText = result
    ? fmt
      ? copy.sentWeek(result.sentTo, fmt.civilDate(result.weekStart), fmt.civilDate(result.weekEnd))
      : copy.sent(result.sentTo)
    : '';

  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        type="button"
        variant="secondary"
        loading={sending}
        disabled={sending || waiting}
        onClick={() => void send()}
      >
        <Send aria-hidden /> {copy.send}
      </Button>
      <p role="status" className={sentText ? 'text-sm text-success-text' : 'sr-only'}>
        {sentText}
      </p>
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
