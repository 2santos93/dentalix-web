import { addCivilDays } from './civil-days';

describe('addCivilDays', () => {
  it('suma días civiles cruzando meses y años', () => {
    expect(addCivilDays('2026-11-16', 0)).toBe('2026-11-16');
    expect(addCivilDays('2026-11-16', 2)).toBe('2026-11-18');
    expect(addCivilDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addCivilDays('2026-12-31', 30)).toBe('2027-01-30');
  });
});
