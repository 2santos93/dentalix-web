'use client';
import { useEffect, useState } from 'react';
import { listBillablePlans, type BillablePlan } from '@/lib/payments/billable-plans-api';

export interface BillablePlansState {
  /** `null` hasta la primera respuesta buena. */
  plans: BillablePlan[] | null;
  loading: boolean;
  failed: boolean;
  /** Vuelve a pedir la lista (el reintento del `FieldError`). */
  retry: () => void;
}

/**
 * Los planes cobrables del paciente (DX-067), pedidos cada vez que `active`
 * pasa a `true` (al abrir un modal de cobro): así el saldo que se enseña es el
 * de ese momento, no el de cuando se abrió la ficha.
 */
export function useBillablePlans(
  token: string,
  patientId: string,
  active: boolean,
): BillablePlansState {
  const [plans, setPlans] = useState<BillablePlan[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setFailed(false);
      setPlans(null);
      try {
        const data = await listBillablePlans(token, patientId);
        if (!cancelled) setPlans(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, active, reloadKey]);

  return { plans, loading, failed, retry: () => setReloadKey((k) => k + 1) };
}
