import { apiErrorMessage } from '@/lib/api/error-message';

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
    // Recepción no ve el plan de tratamiento (clínico): quien cancela es ADMIN.
    'Este plan ya tiene un plan de cuotas activo. Para reemplazarlo, un administrador debe cancelarlo desde el plan de tratamiento.',
  paymentPlanBadRequest:
    'Revisa los datos del plan de cuotas: el total debe ser mayor que 0 y el pie no puede superarlo. Intenta de nuevo.',
  paymentPlanForbidden:
    'Tu rol no puede crear planes de cuotas. Pide a un administrador que lo cree.',
  paymentPlanGeneric: 'No pudimos crear el plan de cuotas. Intenta de nuevo.',
};

/** El texto a enseñar cuando falla `POST /treatment-plans/:id/payments`. */
export function recordPaymentErrorMessage(err: unknown): string {
  return apiErrorMessage(err, {
    fallback: copy.recordGeneric,
    byStatus: { 400: copy.recordBadRequest, 403: copy.recordForbidden, 404: copy.planGone },
  });
}

/** El texto a enseñar cuando falla `POST /treatment-plans/:id/payment-plan`. */
export function paymentPlanErrorMessage(err: unknown): string {
  return apiErrorMessage(err, {
    fallback: copy.paymentPlanGeneric,
    byStatus: {
      409: copy.paymentPlanConflict,
      400: copy.paymentPlanBadRequest,
      403: copy.paymentPlanForbidden,
      404: copy.planGone,
    },
  });
}
