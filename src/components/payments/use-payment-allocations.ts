'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getPaymentAllocations,
  replacePaymentAllocations,
  type PaymentAllocations,
  type ReplacePaymentAllocationsInput,
} from '@/lib/payments/payment-allocations-api';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  // Sin «Intenta de nuevo.»: el SectionError del modal trae su propio botón.
  loadError: 'No pudimos cargar la imputación del abono.',
  saveError: 'No pudimos guardar la imputación. Intenta de nuevo.',
  // 403 de RolesGuard, en inglés («Insufficient role»): solo ADMIN reasigna.
  forbidden: 'Solo un administrador cambia la imputación de un abono.',
};

export interface AllocationSaveError {
  message: string;
  /**
   * Un 409: la imputación cambió por debajo (otra edición, una liberación o un
   * reparto), el plan ya no se cobra o el abono sigue sin tasa. Lo que se ve
   * ya no es lo que hay, así que el modal ofrece «Volver a cargar».
   */
  stale: boolean;
}

/**
 * Lee y guarda la imputación de un abono (DX-051): `GET` al montar y con
 * `reload`; `save` hace el `PUT` y devuelve si salió bien. Los errores llegan
 * ya en español: el de carga para un `SectionError`, el de guardado para el
 * `InlineError` del formulario.
 */
export function usePaymentAllocations(token: string, paymentId: string) {
  const [data, setData] = useState<PaymentAllocations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<AllocationSaveError | null>(null);
  // La última lectura, para saber si «Volver a cargar» trajo algo distinto.
  const lastDataRef = useRef<PaymentAllocations | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const next = await getPaymentAllocations(token, paymentId);
        if (cancelled) return;
        const prev = lastDataRef.current;
        // Si la relectura es la misma imputación, el 409 no era por algo que
        // cambió: su explicación se queda (sin «Volver a cargar», que no
        // arreglaría nada). Si cambió, el error ya no aplica.
        const unchanged =
          prev !== null &&
          prev.version === next.version &&
          prev.planStatus === next.planStatus &&
          prev.planAmount === next.planAmount;
        setSaveError((current) => (current && unchanged ? { ...current, stale: false } : null));
        lastDataRef.current = next;
        setData(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setData(null);
        setError(apiErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, paymentId, reloadKey]);

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  async function save(body: ReplacePaymentAllocationsInput): Promise<boolean> {
    setSaving(true);
    setSaveError(null);
    try {
      const next = await replacePaymentAllocations(token, paymentId, body);
      lastDataRef.current = next;
      setData(next);
      return true;
    } catch (err) {
      setSaveError({
        message: apiErrorMessage(err, { fallback: copy.saveError, byStatus: { 403: copy.forbidden } }),
        stale: err instanceof ApiError && err.status === 409,
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { data, loading, error, reload, save, saving, saveError };
}
