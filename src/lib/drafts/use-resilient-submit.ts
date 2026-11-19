'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import { IDEMPOTENCY_KEY_REUSED } from '@/lib/api/idempotency-key';
import { onReconnect } from '@/lib/offline/connectivity';
import type { FormDraft } from './use-form-draft';

export type SubmitOutcome = 'sent' | 'queued';

interface Job {
  send: (idempotencyKey: string) => Promise<unknown>;
  onSuccess: (result: unknown) => void | Promise<void>;
}

export interface ResilientSubmit {
  /**
   * Envía con la `Idempotency-Key` del borrador. Sin red: guarda el borrador,
   * NO lanza y devuelve `'queued'` (el formulario sigue abierto); al volver la
   * conexión reintenta UNA vez con la misma clave. Con éxito borra el borrador,
   * renueva la clave y llama a `onSuccess`. Otros errores se lanzan (un 422 de
   * clave reutilizada renueva antes la clave).
   */
  run<R>(
    send: (idempotencyKey: string) => Promise<R>,
    onSuccess: (result: R) => void | Promise<void>,
  ): Promise<SubmitOutcome>;
  /** Sin conexión con un envío a la espera; `persisted` = quedó guardado en el equipo. */
  queued: { persisted: boolean } | null;
  /** Reintentando tras volver la conexión. */
  retrying: boolean;
}

/**
 * Envío que no pierde nada si se cae la red (DX-574). `onRetryError` recibe
 * el error del reintento automático (p. ej. un 4xx) para mostrarlo como el
 * formulario muestra los suyos.
 */
export function useResilientSubmit<T>(
  draft: FormDraft<T>,
  options: { onRetryError: (error: unknown) => void },
): ResilientSubmit {
  const [queued, setQueued] = useState<{ persisted: boolean } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const jobRef = useRef<Job | null>(null);
  const inFlightRef = useRef(false);
  const draftRef = useRef(draft);
  const onRetryErrorRef = useRef(options.onRetryError);
  useEffect(() => {
    draftRef.current = draft;
    onRetryErrorRef.current = options.onRetryError;
  });

  const attempt = useCallback(async (job: Job): Promise<SubmitOutcome> => {
    const d = draftRef.current;
    let result: unknown;
    try {
      result = await job.send(d.getIdempotencyKey());
    } catch (err) {
      if (err instanceof NetworkError) {
        jobRef.current = job;
        const persisted = await d.saveNow();
        setQueued({ persisted });
        return 'queued';
      }
      jobRef.current = null;
      setQueued(null);
      if (err instanceof ApiError && err.code === IDEMPOTENCY_KEY_REUSED) d.renewKey();
      throw err;
    }
    jobRef.current = null;
    setQueued(null);
    await d.clear();
    d.renewKey();
    await job.onSuccess(result);
    return 'sent';
  }, []);

  const run = useCallback(
    <R>(send: (key: string) => Promise<R>, onSuccess: (result: R) => void | Promise<void>) =>
      attempt({ send, onSuccess: onSuccess as (result: unknown) => void | Promise<void> }),
    [attempt],
  );

  // Un reintento por reconexión; si vuelve a fallar la red, espera a la siguiente.
  useEffect(
    () =>
      onReconnect(() => {
        const job = jobRef.current;
        if (!job || inFlightRef.current) return;
        inFlightRef.current = true;
        setRetrying(true);
        attempt(job)
          .catch((err: unknown) => onRetryErrorRef.current(err))
          .finally(() => {
            inFlightRef.current = false;
            setRetrying(false);
          });
      }),
    [attempt],
  );

  return { run, queued, retrying };
}
