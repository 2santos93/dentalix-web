import {
  PAYMENT_METHOD_BADGE_VARIANT,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
} from './payment-method';

it('cada método ofrecido tiene etiqueta en español y variante de badge', () => {
  expect(PAYMENT_METHOD_OPTIONS).toEqual(['CASH', 'CARD', 'TRANSFER', 'OTHER']);
  for (const method of PAYMENT_METHOD_OPTIONS) {
    expect(PAYMENT_METHOD_LABELS[method]).toBeTruthy();
    expect(PAYMENT_METHOD_BADGE_VARIANT[method]).toBeTruthy();
  }
  expect(PAYMENT_METHOD_LABELS.CASH).toBe('Efectivo');
});
