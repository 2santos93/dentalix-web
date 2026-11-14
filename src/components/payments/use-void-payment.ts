'use client';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { voidPayment } from '@/lib/payments/payments-api';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';

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
  // DX-390: anular una línea de un cobro dividido anula todas y su recibo.
  voidedSplit: (lines: number, subject: string) => `Cobro anulado: ${lines} formas de pago y su recibo · ${subject}.`,
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
  /**
   * SEC-043: `null` en un abono de una caja abierta con arqueo ciego: se
   * nombra por fecha y paciente, sin cifra.
   */
  amount: number | null;
  currency: string | null;
  /** Día civil del pago en la zona de su sede (`paidOn`, YYYY-MM-DD; DX-097). */
  paidOn: string;
  patientName?: string;
  /** DX-390: formas de pago de su cobro dividido (se anulan juntas); `null`/ausente si es suelto. */
  splitLines?: number | null;
  /**
   * DX-354b (E1): el formato de la sede DEL ABONO (`stamp.fmtOf(location.id)`), con prioridad sobre el
   * del gancho; `undefined` = el del gancho. En la caja de «Todas las sedes» cada abono es de la suya.
   */
  fmt?: RegionalFormat | null;
}

/**
 * `fmt`: el formato de la sede de la pantalla desde la que se anula (DX-354,
 * D10: se inyecta, un gancho de caja y estado de cuenta se abre desde pantallas
 * con otra sede activa). Importe con el código ISO y día con el orden de la
 * sede; sin él (cargando o sin formato), «—».
 */
export function voidPaymentSubject(target: VoidPaymentTarget, hookFmt: RegionalFormat | null): string {
  const fmt = target.fmt !== undefined ? target.fmt : hookFmt;
  return [
    target.amount !== null && target.currency !== null
      ? sedeMoney(target.amount, target.currency, fmt)
      : null,
    sedeCivilDate(target.paidOn, fmt),
    target.patientName,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * El aviso tras anular: el abono, o (DX-390) el cobro dividido entero con su
 * recibo, que es lo que la API anula. Del cobro no se repite el importe de la
 * línea pulsada: no es lo que se anuló.
 */
function voidedNotice(target: VoidPaymentTarget, hookFmt: RegionalFormat | null): string {
  const fmt = target.fmt !== undefined ? target.fmt : hookFmt;
  if (target.splitLines && target.splitLines > 1) {
    const rest = [sedeCivilDate(target.paidOn, fmt), target.patientName].filter(Boolean).join(' · ');
    return copy.voidedSplit(target.splitLines, rest);
  }
  return copy.voided(voidPaymentSubject(target, fmt));
}

/**
 * Estado del flujo «Anular abono» (DX-057) para pantallas que listan abonos
 * fuera del plan de tratamiento (Caja, Estado de cuenta): qué abono se está
 * anulando, envío, error en español y el aviso de éxito. Tras anular, cierra
 * el modal y llama a `onVoided` para que la pantalla recargue sus datos.
 */
export function useVoidPayment(token: string, onVoided: () => void, fmt: RegionalFormat | null) {
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
      setNotice(voidedNotice(target, fmt));
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
