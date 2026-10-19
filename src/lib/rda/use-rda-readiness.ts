'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { getRdaReadiness, type RdaReadiness } from '@/lib/patients/clinical-api';

/** Estado de la comprobación RDA de una evolución (DX-212). */
export type RdaState =
  | { status: 'loading' }
  | { status: 'error' }
  /** Sin permiso (recepción): no hay chip. */
  | { status: 'forbidden' }
  | { status: 'loaded'; data: RdaReadiness };

/**
 * `rda-readiness` de cada evolución de la lista, una petición por evolución
 * (y no una por cada vez que se pinta: la tabla y las tarjetas móviles
 * comparten este estado). Las nuevas se piden al aparecer; `retry` repite
 * una que falló.
 */
export function useRdaReadiness(token: string, entryIds: readonly string[]) {
  const [byId, setById] = useState<Record<string, RdaState>>({});
  // Ids ya pedidos: solo lo leen y escriben el efecto y `retry` (nunca el render).
  const requested = useRef(new Set<string>());

  const load = useCallback(
    (id: string) => {
      requested.current.add(id);
      setById((prev) => ({ ...prev, [id]: { status: 'loading' } }));
      getRdaReadiness(token, id)
        .then((data) => setById((prev) => ({ ...prev, [id]: { status: 'loaded', data } })))
        .catch((err: unknown) =>
          setById((prev) => ({
            ...prev,
            [id]: {
              status: err instanceof ApiError && err.status === 403 ? 'forbidden' : 'error',
            },
          })),
        );
    },
    [token],
  );

  const key = entryIds.join(',');
  useEffect(() => {
    function loadNew() {
      for (const id of key ? key.split(',') : []) {
        if (!requested.current.has(id)) load(id);
      }
    }
    loadNew();
  }, [key, load]);

  const stateOf = useCallback(
    (id: string): RdaState => byId[id] ?? { status: 'loading' },
    [byId],
  );
  return { stateOf, retry: load };
}
