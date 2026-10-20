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

// DX-089: un miembro acotado a UNA sede no tiene «sede por defecto de la
// clínica»: sin cabecera, la API usa la suya.
describe('paymentLocationHint — miembro con sedes acotadas', () => {
  it('con una sola sede permitida y sin sede activa, habla de su sede asignada', () => {
    expect(paymentLocationHint(one, null, ['l1'])).toBe(
      'Sin una sede activa, este abono quedará en tu sede asignada.',
    );
  });

  it('con su sede activa sigue la regla de siempre', () => {
    expect(paymentLocationHint(one, 'l1', ['l1'])).toBeNull();
    expect(paymentLocationHint(two, 'l2', ['l2'])).toBe(
      'Este abono quedará registrado en la sede Sede Norte.',
    );
  });

  it('con varias sedes permitidas, o sin restricción, el texto no cambia', () => {
    expect(paymentLocationHint(two, null, ['l1', 'l2'])).toMatch(/sede por defecto de la clínica/);
    expect(paymentLocationHint(two, null, null)).toMatch(/sede por defecto de la clínica/);
  });
});
