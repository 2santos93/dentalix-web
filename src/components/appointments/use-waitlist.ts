'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listWaitlist, type WaitlistEntry } from '@/lib/appointments/waitlist-api';

export const WAITLIST_LOAD_ERROR = 'No pudimos cargar los pendientes.';

export interface WaitlistState {
  entries: WaitlistEntry[];
  total: number;
  loading: boolean;
  error: string | null;
  /** Vuelve a pedir la lista (el Reintentar del escalón 1). */
  reload: () => void;
  /** Saca una entrada ya resuelta (agendada o descartada) sin pedir de nuevo. */
  remove: (id: string) => void;
}

/**
 * «Pendientes por agendar» de la agenda (DX-122): UNA carga para el panel
 * lateral y para el contador del cajón, que comparten el mismo estado (lo que
 * se agenda o descarta en uno se ve en el otro). `reloadKey` la repite, p. ej.
 * tras cancelar o reactivar una cita.
 */
export function useWaitlist(token: string, reloadKey = 0): WaitlistState {
  const [loaded, setLoaded] = useState<WaitlistEntry[]>([]);
  const [loadedTotal, setLoadedTotal] = useState(0);
  // Resueltas aquí desde la última carga (se quitan sin volver a pedir).
  const [removed, setRemoved] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localReload, setLocalReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const page = await listWaitlist(token, { pageSize: 50 });
        if (cancelled) return;
        setLoaded(page.items);
        setLoadedTotal(page.total);
        setRemoved([]);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, WAITLIST_LOAD_ERROR));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey, localReload]);

  const reload = useCallback(() => setLocalReload((k) => k + 1), []);
  const remove = useCallback(
    (id: string) => setRemoved((prev) => (prev.includes(id) ? prev : [...prev, id])),
    [],
  );

  const entries = loaded.filter((e) => !removed.includes(e.id));
  const total = Math.max(0, loadedTotal - (loaded.length - entries.length));
  return { entries, total, loading, error, reload, remove };
}
