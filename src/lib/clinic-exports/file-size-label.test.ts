import { fileSizeLabel } from './clinic-exports-api';
import { regionalFormat } from '@/lib/format/regional-format';

describe('fileSizeLabel (DX-053)', () => {
  it('bytes, KB, MB y GB con un decimal y el formato de la sede', () => {
    const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h23' });
    expect(fileSizeLabel(512, fmt)).toBe('512 B');
    expect(fileSizeLabel(2_048, fmt)).toBe('2,0 KB');
    expect(fileSizeLabel(2_500_000, fmt)).toBe('2,4 MB');
    expect(fileSizeLabel(3 * 1024 ** 3, fmt)).toBe('3,0 GB');
    const en = regionalFormat({ locale: 'en-US', hourCycle: 'h12' });
    expect(fileSizeLabel(2_500_000, en)).toBe('2.4 MB');
  });
});
