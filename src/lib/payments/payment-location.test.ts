import { paymentLocationHint } from './payment-location';

const one = [{ id: 'l1', name: 'Sede principal', isActive: true }];
const two = [...one, { id: 'l2', name: 'Sede Norte', isActive: true }];

describe('paymentLocationHint', () => {
  it('con una sola sede activa no dice nada', () => {
    expect(paymentLocationHint(one, 'l1')).toBeNull();
    expect(paymentLocationHint([...one, { id: 'l2', name: 'Cerrada', isActive: false }], null)).toBeNull();
  });

  it('con varias, nombra la sede activa', () => {
    expect(paymentLocationHint(two, 'l2')).toBe('Este abono quedará registrado en la sede Sede Norte.');
  });

  it('sin sede activa (o una desconocida), avisa de la sede por defecto', () => {
    expect(paymentLocationHint(two, null)).toMatch(/sede por defecto de la clínica/);
    expect(paymentLocationHint(two, 'x')).toMatch(/sede por defecto de la clínica/);
  });
});
