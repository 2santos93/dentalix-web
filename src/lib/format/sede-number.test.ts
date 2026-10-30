import { regionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT, sedeCivilDate, sedeMoney, sedeNumber } from './sede-number';

describe('sedeNumber (G1-B)', () => {
  it('separa los miles con el formato de la sede, o «—» sin él', () => {
    expect(sedeNumber(1234, regionalFormat({ locale: 'en-US', hourCycle: 'h12' }))).toBe('1,234');
    expect(sedeNumber(1234, regionalFormat({ locale: 'de-DE', hourCycle: 'h23' }))).toBe('1.234');
    expect(sedeNumber(1234, null)).toBe(NO_SEDE_FORMAT);
    expect(NO_SEDE_FORMAT).toBe('—');
  });
});

describe('sedeMoney / sedeCivilDate (DX-378)', () => {
  const us = regionalFormat({ locale: 'en-US', hourCycle: 'h12' });
  it('con el formato de la sede, o «—» sin él', () => {
    expect(sedeMoney(1234.5, 'USD', us)).toBe('$1,234.50');
    expect(sedeMoney(1234.5, 'USD', null)).toBe(NO_SEDE_FORMAT);
    expect(sedeCivilDate('2026-10-31', us)).toBe('10/31/2026');
    expect(sedeCivilDate('2026-10-31', null)).toBe(NO_SEDE_FORMAT);
  });
});
