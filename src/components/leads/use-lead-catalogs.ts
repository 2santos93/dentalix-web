'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  getLeadOwners,
  listLeadReasons,
  type LeadOwner,
  type LeadReason,
  type LeadReasonKind,
} from '@/lib/leads/leads-api';

export interface CatalogState<T> {
  /** `null` mientras carga (o tras un fallo). */
  items: T[] | null;
  failed: boolean;
  reload: () => void;
}

function useCatalog<T>(load: (() => Promise<T[]>) | null): CatalogState<T> {
  const [items, setItems] = useState<T[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    load()
      .then((res) => {
        if (cancelled) return;
        setItems(res);
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setItems(null);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // `load` cambia con sus propias dependencias (token, tipo); `reloadKey` reintenta.
  }, [load, reloadKey]);

  return { items, failed, reload };
}

/** Motivos de interés o de pérdida: predefinidos + propios vivos (`GET /lead-reasons?kind=`). */
export function useLeadReasons(token: string, kind: LeadReasonKind, enabled = true): CatalogState<LeadReason> {
  const load = useCallback(() => listLeadReasons(token, kind), [token, kind]);
  return useCatalog(enabled ? load : null);
}

/** Posibles responsables: ADMIN y recepción de la clínica (`GET /leads/owners`). */
export function useLeadOwners(token: string, enabled = true): CatalogState<LeadOwner> {
  const load = useCallback(() => getLeadOwners(token), [token]);
  return useCatalog(enabled ? load : null);
}
