'use client';
import { useEffect, useState } from 'react';
import { getPrivacyPolicies, type PrivacyPolicies } from '@/lib/data-consents/data-consents-api';

export interface PrivacyPoliciesState {
  data: PrivacyPolicies | null;
  loading: boolean;
  /** `true` si la carga falló; el mensaje lo pone cada vista. */
  failed: boolean;
  /** Vuelve a cargar (para el botón de reintento del escalón 1). */
  reload: () => void;
}

/**
 * Carga `GET /privacy-policies` con el patrón de la app (estado local +
 * `useEffect`). `reload` usa un updater funcional: identidad estable, así que
 * un reintento nunca cierra sobre estado viejo (DESIGN.md, Way-Out Rule).
 */
export function usePrivacyPolicies(token: string): PrivacyPoliciesState {
  const [data, setData] = useState<PrivacyPolicies | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await getPrivacyPolicies(token);
        if (cancelled) return;
        setData(res);
        setFailed(false);
      } catch {
        if (cancelled) return;
        setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  return { data, loading, failed, reload: () => setReloadKey((k) => k + 1) };
}
