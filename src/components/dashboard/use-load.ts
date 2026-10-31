'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';

export type LoadState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };

/**
 * Una lectura de Inicio con su propio ciclo (I1): cada bloque carga, falla y se
 * reintenta solo, así un endpoint caído no tumba la página. `key` decide cuándo
 * se vuelve a pedir (sede, período, moneda…); `enabled = false` no pide nada
 * (rol sin permiso, falta un dato previo) y se queda en `idle`.
 */
export function useLoad<T>(
  loader: () => Promise<T>,
  key: string,
  enabled: boolean,
  fallbackError: string,
): LoadState<T> & { reload: () => void } {
  const [state, setState] = useState<{ key: string; value: LoadState<T> }>({ key: '', value: { status: 'idle' } });
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const requestKey = `${key}#${reloadKey}`;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function run() {
      setState({ key: requestKey, value: { status: 'loading' } });
      try {
        const data = await loader();
        if (!cancelled) setState({ key: requestKey, value: { status: 'ready', data } });
      } catch (err) {
        if (!cancelled) {
          setState({ key: requestKey, value: { status: 'error', message: apiErrorMessage(err, fallbackError) } });
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // `loader` cambia en cada render; lo que decide si se vuelve a pedir es `requestKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, enabled]);

  if (!enabled) return { status: 'idle', reload };
  // Hasta que el efecto arranque con la clave nueva, lo anterior ya no vale: cargando.
  if (state.key !== requestKey) return { status: 'loading', reload };
  return { ...state.value, reload };
}
