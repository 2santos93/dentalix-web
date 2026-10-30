import { movementMethodLabel, voidedDetail } from './presentation';

describe('voidedDetail', () => {
  it('«Anulado por X: motivo» para un abono anulado con autor y motivo', () => {
    expect(
      voidedDetail({
        voided: true,
        voidedBy: { id: 'u1', fullName: 'Rita Recepción' },
        voidReason: 'Cobro duplicado',
      }),
    ).toBe('Anulado por Rita Recepción: Cobro duplicado');
  });

  it('sin nombre (no es miembro de la clínica) lo dice en vez de inventarlo', () => {
    expect(
      voidedDetail({ voided: true, voidedBy: { id: 'u1', fullName: null }, voidReason: 'Error' }),
    ).toBe('Anulado por un usuario ajeno a la clínica: Error');
  });

  it('una anulación antigua sin autor no lleva detalle', () => {
    expect(voidedDetail({ voided: true, voidedBy: null, voidReason: null })).toBeNull();
  });

  it('un abono activo no lleva detalle', () => {
    expect(voidedDetail({ voided: false, voidedBy: null, voidReason: null })).toBeNull();
  });
});

describe('movementMethodLabel (DX-395)', () => {
  it('«Pago móvil · Ref. ABC 123»: el medio de la clínica y la referencia', () => {
    expect(
      movementMethodLabel({
        method: 'TRANSFER',
        paymentMethod: { id: 'pm', name: 'Pago móvil' },
        reference: 'ABC 123',
      }),
    ).toBe('Pago móvil · Ref. ABC 123');
  });

  it('sin referencia, solo el medio', () => {
    expect(
      movementMethodLabel({
        method: 'CASH',
        paymentMethod: { id: 'pm', name: 'Efectivo' },
        reference: null,
      }),
    ).toBe('Efectivo');
  });

  it('sin medio (respuesta anterior), el método; sin método, «Sin método»', () => {
    expect(movementMethodLabel({ method: 'CARD', paymentMethod: null, reference: null })).toBe('Tarjeta');
    expect(movementMethodLabel({ method: null, paymentMethod: null, reference: null })).toBe('Sin método');
  });
});
