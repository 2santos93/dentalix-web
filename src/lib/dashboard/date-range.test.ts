import { addOneDayIso } from './date-range';

describe('addOneDayIso', () => {
  it('adds one day within the same month', () => {
    expect(addOneDayIso('2026-07-24')).toBe('2026-07-25');
  });

  it('rolls over to the next month', () => {
    expect(addOneDayIso('2026-01-31')).toBe('2026-02-01');
  });

  it('rolls over to the next year', () => {
    expect(addOneDayIso('2026-12-31')).toBe('2027-01-01');
  });
});
