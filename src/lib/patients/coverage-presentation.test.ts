import {
  COVERAGE_EXPIRED_LABEL,
  coverageChipText,
  coverageStatusBadge,
  coverageValidityLabel,
} from './coverage-presentation';

describe('coverageChipText (DX-153)', () => {
  it('solo avisa cuando la cobertura venció', () => {
    const base = { payerName: 'Sanitas', planName: null, validTo: null };
    expect(coverageChipText({ ...base, status: 'EXPIRED' })).toBe(COVERAGE_EXPIRED_LABEL);
    expect(coverageChipText({ ...base, status: 'ACTIVE' })).toBe('');
    expect(coverageChipText({ ...base, status: 'NOT_STARTED' })).toBe('');
    expect(coverageChipText({ ...base, status: 'NONE' })).toBe('');
    expect(coverageChipText(undefined)).toBe('');
    expect(coverageChipText(null)).toBe('');
  });
});

describe('coverageValidityLabel (DX-153)', () => {
  it('vigente con fecha de fin', () => {
    expect(
      coverageValidityLabel({ status: 'ACTIVE', validFrom: '2026-01-01', validTo: '2027-01-31' }),
    ).toBe('Vigente hasta 31/01/2027');
  });
  it('vigente sin fecha de fin', () => {
    expect(coverageValidityLabel({ status: 'ACTIVE', validFrom: null, validTo: null })).toBe(
      'Sin fecha de fin',
    );
  });
  it('pendiente de inicio', () => {
    expect(
      coverageValidityLabel({ status: 'NOT_STARTED', validFrom: '2027-03-01', validTo: null }),
    ).toBe('Desde 01/03/2027');
  });
  it('vencida', () => {
    expect(
      coverageValidityLabel({ status: 'EXPIRED', validFrom: null, validTo: '2026-01-31' }),
    ).toBe('Venció el 31/01/2026');
  });
});

describe('coverageStatusBadge (DX-153)', () => {
  it('marca vencida y pendiente de inicio; la vigente no lleva insignia', () => {
    expect(coverageStatusBadge({ status: 'EXPIRED' })).toEqual({
      label: 'Vencida',
      variant: 'warning',
    });
    expect(coverageStatusBadge({ status: 'NOT_STARTED' })).toEqual({
      label: 'Pendiente de inicio',
      variant: 'secondary',
    });
    expect(coverageStatusBadge({ status: 'ACTIVE' })).toBeNull();
  });
});
