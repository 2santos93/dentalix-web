import {
  COVERAGE_EXPIRED_LABEL,
  coverageChipText,
  coverageDetailText,
  coverageStatusBadge,
  coverageValidityLabel,
} from './coverage-presentation';

describe('coverageChipText (DX-153)', () => {
  it('solo avisa cuando la cobertura venció', () => {
    const base = { payerName: 'Sanavida', planName: null, validTo: null };
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
      variant: 'danger',
    });
    expect(coverageStatusBadge({ status: 'NOT_STARTED' })).toEqual({
      label: 'Pendiente de inicio',
      variant: 'warning',
    });
    expect(coverageStatusBadge({ status: 'ACTIVE' })).toBeNull();
  });
});

describe('coverageDetailText (DX-153)', () => {
  const base = { payerName: 'Surco Salud', planName: 'Plan X', validTo: '2026-01-31' };
  it('vigente: pagador y plan', () => {
    expect(coverageDetailText({ ...base, status: 'ACTIVE' })).toBe('Cobertura: Surco Salud · Plan X');
  });
  it('vencida: pagador y fecha de vencimiento', () => {
    expect(coverageDetailText({ ...base, status: 'EXPIRED' })).toMatch(/^Cobertura: Surco Salud · venció el /);
  });
  it('pendiente de inicio: lo dice en vez de mostrar el plan como vigente', () => {
    expect(coverageDetailText({ ...base, status: 'NOT_STARTED' })).toBe(
      'Cobertura: Surco Salud · pendiente de inicio',
    );
  });
  it('sin cobertura o sin pagador: vacío', () => {
    expect(coverageDetailText({ ...base, status: 'NONE' })).toBe('');
    expect(coverageDetailText({ ...base, payerName: null, status: 'ACTIVE' })).toBe('');
    expect(coverageDetailText(null)).toBe('');
  });
});
