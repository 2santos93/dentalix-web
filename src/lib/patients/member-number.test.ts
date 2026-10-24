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

  it('sin nº con un pagador externo: el mismo mensaje que la API, sin tipo ni país', () => {
    for (const type of ['EPS_CO', 'PREPAGADA_CO', 'MUTUA_ES', 'EMPRESA'] as const) {
      expect(memberNumberError(type, '   ')).toBe(
        'El nº de afiliado o póliza es obligatorio con un pagador externo.',
      );
    }
    expect(memberNumberError('OTRO', '')).toBeNull();
  });

  it('una regla única para todo pagador externo, como la API (DX-311)', () => {
    const cases: [string, string | null][] = [
      [' 1.020.304.050 ', null],
      ['A123', null],
      ['10-123456-01', null],
      ['POL/2026/0042', null],
      ['EMP   001', null],
      ['Ñandú-77', null],
      [`1${'A'.repeat(39)}`, null],
      ['A12', memberNumberCopy.format],
      [`1${'A'.repeat(40)}`, memberNumberCopy.format],
      ['1234#5', memberNumberCopy.format],
      ['EMPLEADO', memberNumberCopy.noDigit],
      ['0000', memberNumberCopy.repeated],
      ['1111-1111', memberNumberCopy.repeated],
    ];
    for (const type of ['EPS_CO', 'PREPAGADA_CO', 'MUTUA_ES', 'EMPRESA'] as const) {
      for (const [value, expected] of cases) {
        expect([value, memberNumberError(type, value)]).toEqual([value, expected]);
      }
    }
    expect(memberNumberCopy.format).toBe(
      'El nº de afiliado o póliza debe tener entre 4 y 40 caracteres: letras, números, espacios, guiones, puntos o barras.',
    );
    expect(memberNumberCopy.noDigit).toBe('El nº de afiliado o póliza debe tener al menos un número.');
    expect(memberNumberCopy.repeated).toBe(
      'El nº de afiliado o póliza no puede ser un mismo carácter repetido.',
    );
  });

  it('una ayuda única y ningún texto de un tipo o país', () => {
    expect(memberNumberCopy.hint).toBe('El número que figura en la tarjeta o póliza del paciente.');
    expect(JSON.stringify(memberNumberCopy)).not.toMatch(/EPS|prepagada|mutua|documento|c[ée]dula/i);
  });

  it('insignia: verificada con quién y cuándo, sin verificar, o nada con un pagador interno', () => {
    expect(
      coverageVerificationBadge({
        payer: { type: 'EMPRESA' },
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
        payer: { type: 'EMPRESA' },
        verifiedAt: null,
        verifiedByName: null,
      }),
    ).toEqual({ label: 'Sin verificar', variant: 'muted', detail: null });
    expect(
      coverageVerificationBadge({ payer: { type: 'OTRO' }, verifiedAt: null, verifiedByName: null }),
    ).toBeNull();
  });
});
