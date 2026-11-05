'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { notifyError } from '@/components/errors/notify';
import {
  getCreditBalances,
  type CreditBalanceRow,
  type CreditBalancesPage,
} from '@/lib/receivables/credit-balances-api';

export const CREDIT_BALANCES_LOAD_ERROR = 'No pudimos cargar los saldos a favor.';
export const CREDIT_BALANCES_MORE_ERROR = 'No pudimos cargar más saldos a favor.';
/** Filas por página (la API la acepta tal cual). */
export const CREDIT_BALANCES_PAGE_SIZE = 25;

export const creditRowKey = (row: CreditBalanceRow) => `${row.patient.id}:${row.currency}`;

export interface CreditBalancesState {
  /** Primera página + las que se añadieron con «Cargar más». */
  rows: CreditBalanceRow[];
  total: number;
  /** La respuesta de la primera página (alcance, «hoy», avisos de tasa). */
  head: CreditBalancesPage | null;
  loading: boolean;
  error: string | null;
  forbidden: boolean;
  /** Vuelve a pedir desde la primera página (el Reintentar del escalón 1). */
  reload: () => void;
  hasMore: boolean;
  loadMore: () => void;
  loadingMore: boolean;
  /** La última tanda añadida: `token` cambia en cada una (para anunciarla aunque el número se repita). */
  lastBatch: { token: number; count: number } | null;
}

/**
 * «Saldo a favor» de la cartera (DX-430): la primera página y «Cargar más»
 * (DX-181: la lista crece, no se reemplaza). Un `Reintentar` de la primera
 * página vuelve a la página 1; un «Cargar más» que falla deja la lista tal
 * cual (escalón 3: toast con reintento de ESA página).
 */
export function useCreditBalances(token: string): CreditBalancesState {
  const [rows, setRows] = useState<CreditBalanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [head, setHead] = useState<CreditBalancesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedPages, setLoadedPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastBatch, setLastBatch] = useState<CreditBalancesState['lastBatch']>(null);
  // Sube en cada recarga: la respuesta de un «Cargar más» de una generación anterior se descarta.
  const generationRef = useRef(0);
  const busyRef = useRef(false);
  const nextPageRef = useRef(2);
  // Las filas ya pintadas: «Cargar más» no repite una que cambió de página entre dos lecturas.
  const keysRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    generationRef.current += 1;
    busyRef.current = false;
    nextPageRef.current = 2;
    async function load() {
      setLoadingMore(false);
      setLoading(true);
      try {
        const page = await getCreditBalances(token, { page: 1, pageSize: CREDIT_BALANCES_PAGE_SIZE });
        if (cancelled) return;
        keysRef.current = new Set(page.items.map(creditRowKey));
        setRows(page.items);
        setTotal(page.total);
        setHead(page);
        setLoadedPages(1);
        setLastBatch(null);
        setError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        setForbidden(err instanceof ApiError && err.status === 403);
        setError(apiErrorMessage(err, { fallback: CREDIT_BALANCES_LOAD_ERROR }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const loadPage = useCallback(
    async function run(page: number): Promise<void> {
      if (busyRef.current) return;
      busyRef.current = true;
      setLoadingMore(true);
      const generation = generationRef.current;
      try {
        const res = await getCreditBalances(token, { page, pageSize: CREDIT_BALANCES_PAGE_SIZE });
        if (generationRef.current !== generation) return; // la lista se recargó: respuesta vieja
        const fresh = res.items.filter((r) => !keysRef.current.has(creditRowKey(r)));
        for (const r of fresh) keysRef.current.add(creditRowKey(r));
        setRows((prev) => [...prev, ...fresh]);
        setLastBatch((last) => ({ token: (last?.token ?? 0) + 1, count: fresh.length }));
        setTotal(res.total);
        setLoadedPages(page);
        nextPageRef.current = page + 1;
      } catch (err) {
        if (generationRef.current === generation) {
          // La lista de arriba sigue bien: aviso de fondo con reintento de ESTA página.
          notifyError(apiErrorMessage(err, { fallback: CREDIT_BALANCES_MORE_ERROR }), {
            onRetry: () => void run(page),
          });
        }
      } finally {
        if (generationRef.current === generation) {
          busyRef.current = false;
          setLoadingMore(false);
        }
      }
    },
    [token],
  );

  const loadMore = useCallback(() => void loadPage(nextPageRef.current), [loadPage]);

  return {
    rows,
    total,
    head,
    loading,
    error,
    forbidden,
    reload,
    hasMore: loadedPages > 0 && loadedPages * CREDIT_BALANCES_PAGE_SIZE < total,
    loadMore,
    loadingMore,
    lastBatch,
  };
}
