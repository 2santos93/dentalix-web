import {
  coverageVerificationBadge,
  memberNumberCopy,
  memberNumberError,
  requiresMemberNumber,
} from './member-number';

describe('nº de afiliado (SEC-049)', () => {
  it('lo exigen los pagadores externos, no OTRO', () => {
    for (const type of ['EPS_CO', 'PREPAGADA_CO', 'MUTUA_ES', 'EMPRESA'] as const) {
      expect(requiresMemberNumber(type)).toBe(true);
    }
    expect(requiresMemberNumber('OTRO')).toBe(false);
  });

  it('sin nº con un pagador externo: el mismo mensaje que la API', () => {
    expect(memberNumberError('EPS_CO', '   ')).toBe(
      'En una EPS, el nº de afiliado es obligatorio: es el documento del afiliado.',
    );
    expect(memberNumberError('EMPRESA', '')).toBe(
      'En un convenio de empresa, el nº de empleado o de afiliado es obligatorio.',
    );
    expect(memberNumberError('OTRO', '')).toBeNull();
  });

  it('formato por tipo, como la API', () => {
    expect(memberNumberError('EPS_CO', ' 1.020.304.050 ')).toBeNull();
    expect(memberNumberError('EPS_CO', 'AB12345')).toBe(memberNumberCopy.epsFormat);
    expect(memberNumberError('PREPAGADA_CO', '10-123456-01')).toBeNull();
    expect(memberNumberError('MUTUA_ES', 'ABC12')).toBe(memberNumberCopy.policyFormat);
    expect(memberNumberError('EMPRESA', 'EMP-001')).toBeNull();
    expect(memberNumberError('EMPRESA', 'EMPLEADO')).toBe(memberNumberCopy.employeeFormat);
    expect(memberNumberError('EPS_CO', '00000')).toBe(memberNumberCopy.repeated);
  });

  it('insignia: verificada con quién y cuándo, sin verificar, o nada con un pagador interno', () => {
    expect(
      coverageVerificationBadge({
        payer: { type: 'EPS_CO' },
        verifiedAt: '2026-10-20T15:00:00.000Z',
        verifiedByName: 'Ana Gómez',
      }),
    ).toEqual({
      label: 'Verificada',
      variant: 'success',
      detail: expect.stringMatching(/^Verificada por Ana Gómez el \d{2}\/\d{2}\/2026$/),
    });
    expect(
      coverageVerificationBadge({
        payer: { type: 'EPS_CO' },
        verifiedAt: null,
        verifiedByName: null,
      }),
    ).toEqual({ label: 'Sin verificar', variant: 'muted', detail: null });
    expect(
      coverageVerificationBadge({ payer: { type: 'OTRO' }, verifiedAt: null, verifiedByName: null }),
    ).toBeNull();
  });
});
