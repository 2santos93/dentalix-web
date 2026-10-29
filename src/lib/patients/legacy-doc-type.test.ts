// Excepción G5.3 (DX-334): tipos de documento anteriores a DX-327.
import { normalizeDocType } from './legacy-doc-type';

describe('legacy-doc-type', () => {
  it('legacy codes from an older API normalize to their generic type, never a label', () => {
    expect(normalizeDocType('CC')).toBe('NATIONAL_ID');
    expect(normalizeDocType('TI')).toBe('NATIONAL_ID');
    expect(normalizeDocType('CE')).toBe('RESIDENCE_PERMIT');
    expect(normalizeDocType('PASSPORT')).toBe('PASSPORT');
    expect(normalizeDocType('OTHER')).toBe('OTHER');
  });

  it('generic codes normalize to themselves; unknown and prototype keys are null', () => {
    for (const t of ['NATIONAL_ID', 'PASSPORT', 'RESIDENCE_PERMIT', 'TAX_ID', 'OTHER']) {
      expect(normalizeDocType(t)).toBe(t);
    }
    expect(normalizeDocType('X')).toBeNull();
    expect(normalizeDocType('constructor')).toBeNull();
    expect(normalizeDocType('__proto__')).toBeNull();
  });
});
