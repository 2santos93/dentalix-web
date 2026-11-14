'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { notifyError } from '@/components/errors/notify';
import {
  getUnallocatedPayments,
  type UnallocatedPaymentRow,
  type UnallocatedPaymentsFilters,
  type UnallocatedPaymentsPage,
} from '@/lib/reports/unallocated-payments-api';

export const UNALLOCATED_LOAD_ERROR = 'No pudimos cargar lo cobrado sin imputar.';
export const UNALLOCATED_MORE_ERROR = 'No pudimos cargar más abonos.';
export const UNALLOCATED_BAD_REQUEST =
  'El período no es válido: «Desde» no puede ser posterior a «Hasta» y caben como mucho 24 meses.';
/** Filas por página (la API la acepta tal cual). */
export const UNALLOCATED_PAGE_SIZE = 25;

export const unallocatedRowKey = (row: UnallocatedPaymentRow) => row.paymentId;

export interface UnallocatedPaymentsState {
  /** Primera página + las que se añadieron con «Cargar más». */
  rows: UnallocatedPaymentRow[];
  total: number;
  /** La primera página entera (totales, sedes del filtro, avisos de tasa). */
  head: UnallocatedPaymentsPage | null;
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
 * «Cobrado sin imputar» (DX-399): la primera página y «Cargar más» (DX-181: la
 * lista crece, no se reemplaza). `filters` `null` = el período aún no está
 * (sin zona de la sede) o no vale: no se pide nada. Un `Reintentar` de la
 * primera página vuelve a la página 1; un «Cargar más» que falla deja la lista
 * tal cual (escalón 3: toast con reintento de ESA página).
 */
export function useUnallocatedPayments(
  token: string,
  filters: UnallocatedPaymentsFilters | null,
): UnallocatedPaymentsState {
  const [rows, setRows] = useState<UnallocatedPaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [head, setHead] = useState<UnallocatedPaymentsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedPages, setLoadedPages] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastBatch, setLastBatch] = useState<UnallocatedPaymentsState['lastBatch']>(null);
  const filterKey = filters ? JSON.stringify(filters) : null;
  // Sube en cada recarga: la respuesta de un «Cargar más» de una generación anterior se descarta.
  const generationRef = useRef(0);
  const busyRef = useRef(false);
  const nextPageRef = useRef(2);
  const keysRef = useRef(new Set<string>());

  useEffect(() => {
    if (!filterKey) return;
    const query = JSON.parse(filterKey) as UnallocatedPaymentsFilters;
    let cancelled = false;
    generationRef.current += 1;
    busyRef.current = false;
    nextPageRef.current = 2;
    async function load() {
      setLoadingMore(false);
      setLoading(true);
      try {
        const page = await getUnallocatedPayments(token, query, { page: 1, pageSize: UNALLOCATED_PAGE_SIZE });
        if (cancelled) return;
        keysRef.current = new Set(page.items.map(unallocatedRowKey));
        setRows(page.items);
        setTotal(page.total);
        setHead(page);
        setLoadedPages(1);
        setLastBatch(null);
        setError(null);
        setForbidden(false);
      } catch (err) {
        if (cancelled) return;
        // Un 403 con una sede elegida es esa sede (ya no es suya), no el rol: el filtro sigue a la vista.
        setForbidden(err instanceof ApiError && err.status === 403 && !query.locationId);
        setError(apiErrorMessage(err, { fallback: UNALLOCATED_LOAD_ERROR, byStatus: { 400: UNALLOCATED_BAD_REQUEST } }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, filterKey, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const loadPage = useCallback(
    async function run(page: number): Promise<void> {
      if (busyRef.current || !filterKey) return;
      busyRef.current = true;
      setLoadingMore(true);
      const generation = generationRef.current;
      try {
        const res = await getUnallocatedPayments(token, JSON.parse(filterKey) as UnallocatedPaymentsFilters, {
          page,
          pageSize: UNALLOCATED_PAGE_SIZE,
        });
        if (generationRef.current !== generation) return; // la lista se recargó: respuesta vieja
        const fresh = res.items.filter((r) => !keysRef.current.has(unallocatedRowKey(r)));
        for (const r of fresh) keysRef.current.add(unallocatedRowKey(r));
        setRows((prev) => [...prev, ...fresh]);
        setLastBatch((last) => ({ token: (last?.token ?? 0) + 1, count: fresh.length }));
        setTotal(res.total);
        setLoadedPages(page);
        nextPageRef.current = page + 1;
      } catch (err) {
        if (generationRef.current === generation) {
          // La lista de arriba sigue bien: aviso de fondo con reintento de ESTA página.
          notifyError(apiErrorMessage(err, { fallback: UNALLOCATED_MORE_ERROR }), {
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
    [token, filterKey],
  );

  const loadMore = useCallback(() => void loadPage(nextPageRef.current), [loadPage]);

  return {
    rows,
    total,
    head,
    loading: filterKey === null ? true : loading,
    error,
    forbidden,
    reload,
    hasMore: loadedPages > 0 && loadedPages * UNALLOCATED_PAGE_SIZE < total,
    loadMore,
    loadingMore,
    lastBatch,
  };
}
