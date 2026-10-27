import { regionalFormat } from '@/lib/format/regional-format';
import { perioPercent } from './perio-percent';

describe('perioPercent (DX-350)', () => {
  it('perio percent en-US 12.5% and de-DE 12,5 %', () => {
    expect(perioPercent(12.5, regionalFormat({ locale: 'en-US', hourCycle: 'h12' }))).toBe('12.5%');
    expect(perioPercent(12.5, regionalFormat({ locale: 'de-DE', hourCycle: 'h23' }))).toBe('12,5\u00a0%');
  });

  it('sin formato de la sede: «—»', () => {
    expect(perioPercent(12.5, null)).toBe('—');
  });
});
