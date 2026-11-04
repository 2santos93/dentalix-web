'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listWaitlist, type WaitlistEntry } from '@/lib/appointments/waitlist-api';

export const WAITLIST_LOAD_ERROR = 'No pudimos cargar los pendientes.';
export const WAITLIST_MORE_ERROR = 'No pudimos cargar más pendientes.';
/** Pendientes por página (la API la acepta tal cual). */
export const WAITLIST_PAGE_SIZE = 50;

export interface WaitlistState {
  entries: WaitlistEntry[];
  total: number;
  loading: boolean;
  error: string | null;
  /** Vuelve a pedir la lista (el Reintentar del escalón 1). */
  reload: () => void;
  /** Saca una entrada ya resuelta (agendada o descartada) sin pedir de nuevo. */
  remove: (id: string) => void;
  /** DX-181 (FE-046): quedan pendientes sin traer. */
  hasMore: boolean;
  /** Trae la página siguiente y la añade al final. */
  loadMore: () => void;
  loadingMore: boolean;
  moreError: string | null;
  /**
   * La última tanda añadida por «Cargar más»: `token` cambia en cada tanda
   * (para reaccionar aunque el número se repita), `firstId` es el primer
   * pendiente nuevo (el foco va a él) y `count` cuántos se añadieron.
   */
  lastBatch: { token: number; count: number; firstId: string } | null;
  /** Se pidió alguna página más allá de la primera. */
  pagedBeyondFirst: boolean;
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
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [lastBatch, setLastBatch] = useState<WaitlistState['lastBatch']>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const page = await listWaitlist(token, { page: 1, pageSize: WAITLIST_PAGE_SIZE });
        if (cancelled) return;
        setLoaded(page.items);
        setLoadedTotal(page.total);
        setRemoved([]);
        setPagesLoaded(1);
        setMoreError(null);
        setLastBatch(null);
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

  const hasMore = loaded.length < loadedTotal;
  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(null);
    const nextPage = pagesLoaded + 1;
    listWaitlist(token, { page: nextPage, pageSize: WAITLIST_PAGE_SIZE })
      .then((page) => {
        // Si algo se resolvió entre páginas, la API puede repetir una entrada: no se duplica.
        const known = new Set(loaded.map((e) => e.id));
        const fresh = page.items.filter((e) => !known.has(e.id));
        setLoaded((prev) => {
          const have = new Set(prev.map((e) => e.id));
          return [...prev, ...fresh.filter((e) => !have.has(e.id))];
        });
        setLoadedTotal(page.total);
        setPagesLoaded(nextPage);
        if (fresh[0]) setLastBatch((prev) => ({ token: (prev?.token ?? 0) + 1, count: fresh.length, firstId: fresh[0].id }));
      })
      .catch((err: unknown) => setMoreError(apiErrorMessage(err, WAITLIST_MORE_ERROR)))
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [token, pagesLoaded, loaded]);

  const entries = loaded.filter((e) => !removed.includes(e.id));
  const total = Math.max(0, loadedTotal - (loaded.length - entries.length));
  return {
    entries,
    total,
    loading,
    error,
    reload,
    remove,
    hasMore,
    loadMore,
    loadingMore,
    moreError,
    lastBatch,
    pagedBeyondFirst: pagesLoaded > 1,
  };
}
