import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from './payment-method';
import { statusTone } from '@/lib/status/tones';

it('cada método ofrecido tiene etiqueta en español y se pinta neutro (no es un estado)', () => {
  expect(PAYMENT_METHOD_OPTIONS).toEqual(['CASH', 'CARD', 'TRANSFER', 'OTHER']);
  for (const method of PAYMENT_METHOD_OPTIONS) {
    expect(PAYMENT_METHOD_LABELS[method]).toBeTruthy();
    expect(statusTone('paymentMethod', method)).toBe('neutral');
  }
  expect(PAYMENT_METHOD_LABELS.CASH).toBe('Efectivo');
});
