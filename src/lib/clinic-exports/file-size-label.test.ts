import { fileSizeLabel } from './clinic-exports-api';

describe('fileSizeLabel (DX-053)', () => {
  it('bytes, KB, MB y GB con un decimal y coma', () => {
    expect(fileSizeLabel(512)).toBe('512 B');
    expect(fileSizeLabel(2_048)).toBe('2,0 KB');
    expect(fileSizeLabel(2_500_000)).toBe('2,4 MB');
    expect(fileSizeLabel(3 * 1024 ** 3)).toBe('3,0 GB');
  });
});
