import { ApiError, NetworkError } from '@/lib/api/client';
import { act, renderHook } from '@testing-library/react';
import { regionalFormat } from '@/lib/format/regional-format';
import { voidPayment } from '@/lib/payments/payments-api';
import { useVoidPayment, voidPaymentErrorMessage, voidPaymentSubject } from './use-void-payment';

jest.mock('../../lib/payments/payments-api', () => ({
  ...jest.requireActual('../../lib/payments/payments-api'),
  voidPayment: jest.fn(),
}));
const mockedVoid = voidPayment as jest.MockedFunction<typeof voidPayment>;

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

  it('un fallo de red dice que no hay conexión', () => {
    expect(voidPaymentErrorMessage(new NetworkError(new TypeError('Failed to fetch')))).toMatch(/no hay conexión/i);
  });

  it('cualquier otro error da la copia genérica', () => {
    expect(voidPaymentErrorMessage(new Error('boom'))).toMatch(/intenta de nuevo/i);
  });
});

const US = regionalFormat({ locale: 'en-US', hourCycle: 'h12' });
const DE = regionalFormat({ locale: 'de-DE', hourCycle: 'h23' });

it('voidPaymentSubject: monto · fecha · paciente (el paciente es opcional)', () => {
  const base = { id: 'p', amount: 12345, currency: 'USD', paidOn: '2026-10-16' };
  expect(voidPaymentSubject(base, DE).replace(/\s/g, ' ')).toBe('12.345,00 USD · 16.10.2026');
  expect(voidPaymentSubject({ ...base, patientName: 'Ana' }, DE).replace(/\s/g, ' ')).toBe(
    '12.345,00 USD · 16.10.2026 · Ana',
  );
});

describe('DX-354: el aviso sigue el formato de la sede que se inyecta', () => {
  const target = { id: 'p', amount: 1234.5, currency: 'USD', paidOn: '2027-07-15', patientName: 'Ana' };

  it('con fmt en-US: Abono anulado: USD 1,234.50 · 07/15/2027 · Ana', () => {
    expect(voidPaymentSubject(target, US).replace(/\s/g, ' ')).toBe('USD 1,234.50 · 07/15/2027 · Ana');
  });

  it('con fmt null: «—» en el importe y en la fecha, sin lanzar', () => {
    expect(voidPaymentSubject(target, null)).toBe('— · — · Ana');
  });

  it('el aviso tras anular lleva el importe con código y la fecha de la sede', async () => {
    mockedVoid.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useVoidPayment('tok', jest.fn(), US));
    act(() => result.current.request(target));
    await act(() => result.current.confirm('Cobro duplicado'));
    expect(result.current.notice?.replace(/\s/g, ' ')).toBe('Abono anulado: USD 1,234.50 · 07/15/2027 · Ana.');
  });

  it('con fmt null el aviso sale con «—», sin lanzar', async () => {
    mockedVoid.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useVoidPayment('tok', jest.fn(), null));
    act(() => result.current.request(target));
    await act(() => result.current.confirm('Cobro duplicado'));
    expect(result.current.notice).toBe('Abono anulado: — · — · Ana.');
  });

  it('un cobro dividido dice la fecha de la sede y no repite el importe', async () => {
    mockedVoid.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useVoidPayment('tok', jest.fn(), DE));
    act(() => result.current.request({ ...target, splitLines: 2 }));
    await act(() => result.current.confirm('Cobro duplicado'));
    expect(result.current.notice).toBe('Cobro anulado: 2 formas de pago y su recibo · 15.07.2027 · Ana.');
  });
});
