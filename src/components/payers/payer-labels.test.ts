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

  // Excepción G5.3 (DX-334): tipos de pagador anteriores a DX-326.
  it('legacy codes from an older API render their generic label', () => {
    expect(payerTypeLabel('EPS_CO')).toBe('Sistema público de salud');
    expect(payerTypeLabel('MUTUA_ES')).toBe('Aseguradora');
    expect(payerTypeLabel('OTRO')).toBe('Otro / interno (cortesía, empleados)');
  });

  it('an unknown code renders as is', () => {
    expect(payerTypeLabel('X')).toBe('X');
    expect(payerTypeLabel('constructor')).toBe('constructor');
  });
});
