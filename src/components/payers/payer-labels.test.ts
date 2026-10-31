import { PAYER_TYPE_LABELS, payerTypeLabel } from './payer-labels';

describe('payer labels (DX-326)', () => {
  it('the five generic labels', () => {
    expect(PAYER_TYPE_LABELS).toEqual({
      INSURER: 'Aseguradora',
      PREPAID_PLAN: 'Plan prepago',
      PUBLIC_SYSTEM: 'Sistema público de salud',
      EMPLOYER: 'Empresa',
      OTHER: 'Otro / interno (cortesía, empleados)',
    });
    for (const [type, label] of Object.entries(PAYER_TYPE_LABELS)) {
      expect(payerTypeLabel(type)).toBe(label);
    }
  });

  it('an unknown code renders as is', () => {
    expect(payerTypeLabel('X')).toBe('X');
    // Un código retirado ya no se traduce: la API no lo manda (migración 20261110130000).
    expect(payerTypeLabel('OTRO')).toBe('OTRO');
    expect(payerTypeLabel('constructor')).toBe('constructor');
  });
});
