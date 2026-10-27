import { regionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT, sedeNumber } from './sede-number';

describe('sedeNumber (G1-B)', () => {
  it('separa los miles con el formato de la sede, o «—» sin él', () => {
    expect(sedeNumber(1234, regionalFormat({ locale: 'en-US', hourCycle: 'h12' }))).toBe('1,234');
    expect(sedeNumber(1234, regionalFormat({ locale: 'de-DE', hourCycle: 'h23' }))).toBe('1.234');
    expect(sedeNumber(1234, null)).toBe(NO_SEDE_FORMAT);
    expect(NO_SEDE_FORMAT).toBe('—');
  });
});
