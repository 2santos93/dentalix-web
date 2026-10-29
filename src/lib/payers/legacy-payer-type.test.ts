// Excepción G5.3 (DX-334): tipos de pagador anteriores a DX-326.
import { normalizePayerType } from './legacy-payer-type';
import { isExternalPayer } from './payer-type';

describe('legacy payer type (DX-326)', () => {
  it('legacy codes normalize to their generic type', () => {
    expect(normalizePayerType('MUTUA_ES')).toBe('INSURER');
    expect(normalizePayerType('PREPAGADA_CO')).toBe('PREPAID_PLAN');
    expect(normalizePayerType('EPS_CO')).toBe('PUBLIC_SYSTEM');
    expect(normalizePayerType('EMPRESA')).toBe('EMPLOYER');
    expect(normalizePayerType('OTRO')).toBe('OTHER');
  });

  it('legacy OTRO from an older API is internal', () => {
    expect(isExternalPayer('OTRO')).toBe(false);
    for (const code of ['MUTUA_ES', 'PREPAGADA_CO', 'EPS_CO', 'EMPRESA']) {
      expect([code, isExternalPayer(code)]).toEqual([code, true]);
    }
  });

  it('generic codes normalize to themselves; unknown and prototype keys are null', () => {
    for (const type of ['INSURER', 'PREPAID_PLAN', 'PUBLIC_SYSTEM', 'EMPLOYER', 'OTHER']) {
      expect(normalizePayerType(type)).toBe(type);
    }
    for (const code of ['X', '', 'otro', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect([code, normalizePayerType(code)]).toEqual([code, null]);
    }
  });
});
