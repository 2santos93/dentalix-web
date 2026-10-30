'use client';
import { useEffect, useState } from 'react';
import { listPaymentMethods, type ClinicPaymentMethod } from '@/lib/payments/payment-methods-api';

export interface PaymentMethodsState {
  status: 'loading' | 'ready' | 'error';
  /** Los activos (los que se pueden elegir al cobrar), o todos con `includeInactive`. */
  methods: ClinicPaymentMethod[];
  retry: () => void;
}

/**
 * DX-377: los medios de pago activos de la clínica, mientras `enabled`; con
 * `includeInactive` (DX-395, el filtro de Caja) también los desactivados,
 * que conservan sus abonos. Cada reintento es una lectura nueva; la
 * respuesta de una anterior se descarta.
 */
export function usePaymentMethods(
  token: string,
  enabled: boolean,
  { includeInactive = false }: { includeInactive?: boolean } = {},
): PaymentMethodsState {
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState<
    { key: number; methods: ClinicPaymentMethod[] } | { key: number; failed: true } | null
  >(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listPaymentMethods(token, includeInactive ? { includeInactive } : {}).then(
      (methods) => {
        if (!cancelled) setResult({ key: generation, methods });
      },
      () => {
        if (!cancelled) setResult({ key: generation, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, enabled, includeInactive, generation]);

  const retry = () => setGeneration((g) => g + 1);
  if (!result || result.key !== generation) return { status: 'loading', methods: [], retry };
  if ('failed' in result) return { status: 'error', methods: [], retry };
  return { status: 'ready', methods: result.methods, retry };
}
