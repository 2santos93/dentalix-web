'use client';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { voidPayment } from '@/lib/payments/payments-api';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate } from '@/lib/format/date';

// Copy como constantes (i18n-ready), igual que el resto de vistas.
const copy = {
  generic: 'No pudimos anular el abono. Intenta de nuevo.',
  // 403 de DELETE /payments/:id: la ventana de recepción (mensaje en español de
  // la API) o un rol sin acceso a pagos («Insufficient role», en inglés).
  forbidden:
    'No puedes anular este abono: recepción solo anula los abonos que registró hoy. Pide a un administrador que lo anule.',
  // 404: otra persona lo anuló antes, o ya no existe (mensaje en inglés).
  gone: 'Este abono ya estaba anulado o ya no existe. Cierra y recarga la lista para ver su estado.',
  // 400: el motivo no pasó la validación del servidor (mensaje en inglés).
  badReason: 'Revisa el motivo: debe tener entre 3 y 300 caracteres.',
  voided: (subject: string) => `Abono anulado: ${subject}.`,
};

/**
 * El texto a enseñar cuando falla `DELETE /payments/:id`, siempre en español.
 * Del 403 solo se respeta el mensaje de la regla de recepción, que la API ya
 * da en español («Solo puedes anular…»); cualquier otro (p. ej. «Insufficient
 * role») se sustituye.
 */
export function voidPaymentErrorMessage(err: unknown): string {
  return apiErrorMessage(err, {
    fallback: copy.generic,
    byStatus: { 403: copy.forbidden, 404: copy.gone, 400: copy.badReason },
  });
}

/** Lo que identifica el abono en el modal y en el aviso: monto · fecha · paciente. */
export interface VoidPaymentTarget {
  id: string;
  amount: number;
  currency: string;
  /** Día civil del pago en la zona de su sede (`paidOn`, YYYY-MM-DD; DX-097). */
  paidOn: string;
  patientName?: string;
}

export function voidPaymentSubject(target: VoidPaymentTarget): string {
  return [
    formatCurrency(target.amount, target.currency),
    formatCivilDate(target.paidOn),
    target.patientName,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Estado del flujo «Anular abono» (DX-057) para pantallas que listan abonos
 * fuera del plan de tratamiento (Caja, Estado de cuenta): qué abono se está
 * anulando, envío, error en español y el aviso de éxito. Tras anular, cierra
 * el modal y llama a `onVoided` para que la pantalla recargue sus datos.
 */
export function useVoidPayment(token: string, onVoided: () => void) {
  const [target, setTarget] = useState<VoidPaymentTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function request(next: VoidPaymentTarget) {
    setError(null);
    setNotice(null);
    setTarget(next);
  }

  function close() {
    if (submitting) return;
    setTarget(null);
    setError(null);
  }

  async function confirm(reason: string) {
    if (!target) return;
    setSubmitting(true);
    setError(null);
    try {
      await voidPayment(token, target.id, reason);
      setNotice(copy.voided(voidPaymentSubject(target)));
      setTarget(null);
      onVoided();
    } catch (err) {
      setError(voidPaymentErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return { target, submitting, error, notice, request, close, confirm };
}
