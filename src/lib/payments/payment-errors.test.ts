import { ApiError, NetworkError } from '@/lib/api/client';
import { paymentPlanErrorMessage, recordPaymentErrorMessage } from './payment-errors';

describe('recordPaymentErrorMessage', () => {
  it.each([
    [new ApiError(400, 'amount must be a finite number > 0'), /revisa el importe/i],
    [new ApiError(403, 'Insufficient role'), /tu rol no puede registrar abonos/i],
    [new ApiError(404, 'Treatment plan not found'), /el plan ya no existe/i],
    [new ApiError(500, 'Internal server error'), /no pudimos registrar el abono/i],
    [new NetworkError(new TypeError('Failed to fetch')), /no hay conexión/i],
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

// DX-109: las reglas de cobro nuevas de la API llegan en español y se enseñan
// tal cual (el texto de negocio gana al override por status, DX-063).
describe('DX-109: mensajes de negocio de las reglas de cobro', () => {
  const rejected = 'El plan está «Rechazado»: no admite abonos ni planes de cuotas.';
  const keyReused =
    'Esta clave de idempotencia ya se usó para otro abono (otro plan o datos distintos). Vuelve a registrar el abono para generar una clave nueva.';

  it('409 de plan no cobrable al registrar un abono', () => {
    expect(recordPaymentErrorMessage(new ApiError(409, rejected))).toBe(rejected);
  });

  it('422 de Idempotency-Key reutilizada', () => {
    expect(recordPaymentErrorMessage(new ApiError(422, keyReused))).toBe(keyReused);
  });

  it('409 de plan no cobrable al crear el plan de cuotas gana al texto de «ya tiene uno activo»', () => {
    const cancelled = 'El plan está «Cancelado»: no admite abonos ni planes de cuotas.';
    expect(paymentPlanErrorMessage(new ApiError(409, cancelled))).toBe(cancelled);
  });

  it('409 de «exigir caja abierta» al cobrar en efectivo sin caja (DX-027)', () => {
    const required =
      'Esta clínica exige caja abierta para cobrar en efectivo: abre tu caja en esta sede antes de registrar el abono.';
    expect(recordPaymentErrorMessage(new ApiError(409, required))).toBe(required);
  });
});
