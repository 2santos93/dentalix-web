import { ApiError } from '@/lib/api/client';

// Copy como constantes (i18n-ready). La API responde estos errores en inglés
// («amount must be…», «Insufficient role», «already has an active payment
// plan»): nunca se enseñan tal cual.
const copy = {
  recordBadRequest: 'Revisa el importe, la moneda y la fecha del abono. Intenta de nuevo.',
  recordForbidden: 'Tu rol no puede registrar abonos. Pide a un administrador que lo registre.',
  planGone:
    'El plan ya no existe o ya no se puede cobrar. Cierra y vuelve a abrir para ver los planes actuales.',
  recordGeneric: 'No pudimos registrar el abono. Intenta de nuevo.',
  paymentPlanConflict:
    'Este plan ya tiene un plan de cuotas activo. Elige otro plan o cancela el actual desde el plan de tratamiento.',
  paymentPlanBadRequest:
    'Revisa los datos del plan de cuotas: el total debe ser mayor que 0 y el pie no puede superarlo. Intenta de nuevo.',
  paymentPlanForbidden:
    'Tu rol no puede crear planes de cuotas. Pide a un administrador que lo cree.',
  paymentPlanGeneric: 'No pudimos crear el plan de cuotas. Intenta de nuevo.',
};

function statusOf(err: unknown): number | null {
  return err instanceof ApiError ? err.status : null;
}

/** El texto a enseñar cuando falla `POST /treatment-plans/:id/payments`. */
export function recordPaymentErrorMessage(err: unknown): string {
  switch (statusOf(err)) {
    case 400:
      return copy.recordBadRequest;
    case 403:
      return copy.recordForbidden;
    case 404:
      return copy.planGone;
    default:
      return copy.recordGeneric;
  }
}

/** El texto a enseñar cuando falla `POST /treatment-plans/:id/payment-plan`. */
export function paymentPlanErrorMessage(err: unknown): string {
  switch (statusOf(err)) {
    case 409:
      return copy.paymentPlanConflict;
    case 400:
      return copy.paymentPlanBadRequest;
    case 403:
      return copy.paymentPlanForbidden;
    case 404:
      return copy.planGone;
    default:
      return copy.paymentPlanGeneric;
  }
}
