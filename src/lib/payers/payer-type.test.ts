import { PAYER_TYPES, isExternalPayer } from './payer-type';

describe('payer type (DX-326)', () => {
  it('PAYER_TYPES lists the five generic types in order', () => {
    expect(PAYER_TYPES).toEqual(['INSURER', 'PREPAID_PLAN', 'PUBLIC_SYSTEM', 'EMPLOYER', 'OTHER']);
  });

  it('isExternalPayer: every type but OTHER is external', () => {
    for (const type of ['INSURER', 'PREPAID_PLAN', 'PUBLIC_SYSTEM', 'EMPLOYER']) {
      expect([type, isExternalPayer(type)]).toEqual([type, true]);
    }
    expect(isExternalPayer('OTHER')).toBe(false);
  });

  it('an unknown code counts as external (only stricter on the client)', () => {
    for (const code of ['X', '', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect([code, isExternalPayer(code)]).toEqual([code, true]);
    }
  });
});
