import { regionalFormat } from '@/lib/format/regional-format';
import { stampPainters } from '@/lib/locations/sede-stamp';
import { clinicLocation } from '@/lib/test/locations';
import { caracasSede } from '@/lib/test/sede-clock';
import { testStamp } from '@/lib/test/stamp';
import {
  coverageVerificationBadge,
  memberNumberCopy,
  memberNumberError,
  requiresMemberNumber,
} from './member-number';

const caracas = caracasSede({ id: 'caracas' });
const berlin = clinicLocation({ id: 'berlin', timeZone: 'Europe/Berlin', locale: 'de-DE', hourCycle: 'h23' });

describe('nº de afiliado (SEC-049)', () => {
  it('lo exigen los pagadores externos, no OTHER', () => {
    for (const type of ['INSURER', 'PREPAID_PLAN', 'PUBLIC_SYSTEM', 'EMPLOYER'] as const) {
      expect(requiresMemberNumber(type)).toBe(true);
    }
    expect(requiresMemberNumber('OTHER')).toBe(false);
  });

  it('sin nº con un pagador externo: el mismo mensaje que la API, sin tipo ni país', () => {
    for (const type of ['INSURER', 'PREPAID_PLAN', 'PUBLIC_SYSTEM', 'EMPLOYER'] as const) {
      expect(memberNumberError(type, '   ')).toBe(
        'El nº de afiliado o póliza es obligatorio con un pagador externo.',
      );
    }
    expect(memberNumberError('OTHER', '')).toBeNull();
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
    for (const type of ['INSURER', 'PREPAID_PLAN', 'PUBLIC_SYSTEM', 'EMPLOYER'] as const) {
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
    expect(JSON.stringify(memberNumberCopy)).not.toMatch(/E[P]S|prepagada|mutua|documento|c[ée]dula/i);
  });

  it('insignia: verificada con quién y cuándo, sin verificar, o nada con un pagador interno', () => {
    const stamp = testStamp([caracas]);
    expect(
      coverageVerificationBadge(
        { payer: { type: 'EMPLOYER' }, verifiedAt: '2026-10-20T15:00:00.000Z', verifiedByName: 'Ana Gómez' },
        stamp,
      ),
    ).toEqual({
      label: 'Verificada',
      variant: 'success',
      detail: 'Verificada por Ana Gómez el 20/10/2026',
    });
    expect(
      coverageVerificationBadge({ payer: { type: 'EMPLOYER' }, verifiedAt: null, verifiedByName: null }, stamp),
    ).toEqual({ label: 'Sin verificar', variant: 'muted', detail: null });
    expect(
      coverageVerificationBadge({ payer: { type: 'OTHER' }, verifiedAt: null, verifiedByName: null }, stamp),
    ).toBeNull();
  });

  it('la fecha de verificación sigue la sede: Caracas 20/10/2026, Berlín 21.10.2026 (03:30Z), sin formato «—»', () => {
    const coverage = {
      payer: { type: 'EMPLOYER' as const },
      verifiedAt: '2026-10-21T03:30:00.000Z',
      verifiedByName: 'Ana Gómez',
    };
    const ve = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
    const de = regionalFormat({ locale: 'de-DE', hourCycle: 'h23' });
    const at = new Date(coverage.verifiedAt);
    expect(coverageVerificationBadge(coverage, testStamp([caracas]))?.detail).toBe(
      `Verificada por Ana Gómez el ${ve.date(at, 'America/Caracas')}`,
    );
    expect(coverageVerificationBadge(coverage, testStamp([berlin]))?.detail).toBe(
      `Verificada por Ana Gómez el ${de.date(at, 'Europe/Berlin')}`,
    );
    expect(coverageVerificationBadge(coverage, stampPainters(null))?.detail).toBe('Verificada por Ana Gómez el —');
  });
});
