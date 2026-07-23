import { ALL_PERMANENT, PERMANENT_LOWER, PERMANENT_UPPER, isPermanentFdi } from './fdi';

describe('fdi layout constants', () => {
  it('PERMANENT_UPPER has the 4 upper quadrants in FDI order (18→11, 21→28)', () => {
    expect(PERMANENT_UPPER).toEqual([
      '18', '17', '16', '15', '14', '13', '12', '11',
      '21', '22', '23', '24', '25', '26', '27', '28',
    ]);
  });

  it('PERMANENT_LOWER has the 4 lower quadrants in FDI order (48→41, 31→38)', () => {
    expect(PERMANENT_LOWER).toEqual([
      '48', '47', '46', '45', '44', '43', '42', '41',
      '31', '32', '33', '34', '35', '36', '37', '38',
    ]);
  });

  it('ALL_PERMANENT is upper concatenated with lower (32 teeth, no duplicates)', () => {
    expect(ALL_PERMANENT).toEqual([...PERMANENT_UPPER, ...PERMANENT_LOWER]);
    expect(ALL_PERMANENT).toHaveLength(32);
    expect(new Set(ALL_PERMANENT).size).toBe(32);
  });

  describe('isPermanentFdi', () => {
    it.each(['11', '48', '18', '28', '38', '41'])('accepts %s', (n) => {
      expect(isPermanentFdi(n)).toBe(true);
    });

    it.each(['99', '51', '00', '19', '', 'ab'])('rejects %s', (n) => {
      expect(isPermanentFdi(n)).toBe(false);
    });
  });
});
