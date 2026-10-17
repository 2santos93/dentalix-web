import { normalizeTotpCode } from './break-glass';

describe('normalizeTotpCode (SEC-008)', () => {
  it('acepta 6 dígitos con espacios o guion', () => {
    expect(normalizeTotpCode('123456')).toBe('123456');
    expect(normalizeTotpCode(' 123 456 ')).toBe('123456');
    expect(normalizeTotpCode('123-456')).toBe('123456');
  });

  it('rechaza lo que no son exactamente 6 dígitos', () => {
    for (const raw of ['', '12345', '1234567', 'abcdef', '12a456']) {
      expect(normalizeTotpCode(raw)).toBeNull();
    }
  });
});
