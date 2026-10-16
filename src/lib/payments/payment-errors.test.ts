import { ApiError } from '@/lib/api/client';
import { paymentPlanErrorMessage, recordPaymentErrorMessage } from './payment-errors';

describe('recordPaymentErrorMessage', () => {
  it.each([
    [new ApiError(400, 'amount must be a finite number > 0'), /revisa el importe/i],
    [new ApiError(403, 'Insufficient role'), /tu rol no puede registrar abonos/i],
    [new ApiError(404, 'Treatment plan not found'), /el plan ya no existe/i],
    [new ApiError(500, 'Internal server error'), /no pudimos registrar el abono/i],
    [new TypeError('Failed to fetch'), /no pudimos registrar el abono/i],
  ])('%p -> mensaje en español', (err, expected) => {
    const message = recordPaymentErrorMessage(err);
    expect(message).toMatch(expected);
    expect(message).not.toMatch(/insufficient|not found|internal|finite/i);
  });
});

describe('paymentPlanErrorMessage', () => {
  it.each([
    [new ApiError(409, 'This treatment plan already has an active payment plan'), /ya tiene un plan de cuotas activo/i],
    [new ApiError(400, 'downPayment cannot exceed totalToFinance'), /revisa los datos del plan de cuotas/i],
    [new ApiError(403, 'Insufficient role'), /tu rol no puede crear planes de cuotas/i],
    [new ApiError(404, 'Treatment plan not found'), /el plan ya no existe/i],
    [new Error('boom'), /no pudimos crear el plan de cuotas/i],
  ])('%p -> mensaje en español', (err, expected) => {
    const message = paymentPlanErrorMessage(err);
    expect(message).toMatch(expected);
    expect(message).not.toMatch(/already|cannot|insufficient|not found/i);
  });
});

describe('el 409 del plan de cuotas no manda a recepción a una pestaña que no ve', () => {
  it('dice que la cancelación la hace un administrador', () => {
    const message = paymentPlanErrorMessage(
      new ApiError(409, 'This treatment plan already has an active payment plan'),
    );
    expect(message).toMatch(/administrador/i);
    expect(message).not.toMatch(/cancela el actual/i);
  });
});
