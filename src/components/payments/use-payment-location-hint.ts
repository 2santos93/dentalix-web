'use client';
import { useEffect, useState } from 'react';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { paymentLocationHint } from '@/lib/payments/payment-location';

/**
 * El aviso «Este abono quedará registrado en la sede …» para un formulario de
 * abono abierto (`active`). Falla en silencio: sin la lista de sedes,
 * simplemente no se nombra ninguna.
 */
export function usePaymentLocationHint(token: string, active: boolean): string | null {
  const [locations, setLocations] = useState<ClinicLocation[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // La sede activa vive en localStorage, que solo existe en el cliente: se
    // lee junto con la lista, dentro del `.then` (mismo criterio que el plan
    // de tratamiento).
    listLocations(token)
      .then((data) => {
        if (cancelled) return;
        setLocations(data ?? []);
        setActiveLocationId(getActiveLocationId());
      })
      .catch(() => {
        /* fail soft — sin la lista de sedes no se nombra ninguna */
      });
    return () => {
      cancelled = true;
    };
  }, [token, active]);

  return paymentLocationHint(locations, activeLocationId);
}
