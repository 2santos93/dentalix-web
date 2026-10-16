import { ApiError } from '@/lib/api/client';
import { voidPaymentErrorMessage, voidPaymentSubject } from './use-void-payment';

describe('voidPaymentErrorMessage (siempre en español)', () => {
  it('respeta el 403 de la ventana de recepción, que la API ya da en español', () => {
    const msg = 'Solo puedes anular abonos registrados hoy. Pide a un administrador que lo anule.';
    expect(voidPaymentErrorMessage(new ApiError(403, msg))).toBe(msg);
  });

  it.each([
    [403, 'Insufficient role', /no puedes anular este abono/i],
    [404, 'Payment not found', /ya estaba anulado o ya no existe/i],
    [400, 'reason must be longer than or equal to 3 characters', /entre 3 y 300/i],
    [500, 'Internal server error', /no pudimos anular el abono/i],
  ])('traduce el %s del servidor', (status, message, expected) => {
    const text = voidPaymentErrorMessage(new ApiError(status, message));
    expect(text).toMatch(expected);
    expect(text).not.toContain(message);
  });

  it('un fallo de red da la copia genérica', () => {
    expect(voidPaymentErrorMessage(new TypeError('Failed to fetch'))).toMatch(/intenta de nuevo/i);
  });
});

it('voidPaymentSubject: monto · fecha · paciente (el paciente es opcional)', () => {
  const base = { id: 'p', amount: 12345, currency: 'COP', paidAt: '2026-10-16T00:00:00.000Z' };
  expect(voidPaymentSubject(base).replace(/\s/g, ' ')).toBe('12.345,00 COP · 16/10/2026');
  expect(voidPaymentSubject({ ...base, patientName: 'Ana' }).replace(/\s/g, ' ')).toBe(
    '12.345,00 COP · 16/10/2026 · Ana',
  );
});
