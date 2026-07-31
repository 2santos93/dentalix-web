import { monthGridDays, monthGridRange, addMonths, monthLabel } from './calendar-grid';
import { localDayRange } from './day-range';

describe('monthGridDays', () => {
  it('returns exactly 42 days (6 weeks × 7)', () => {
    expect(monthGridDays('2026-03-15')).toHaveLength(42);
  });

  it('starts on the Monday on/before the 1st and ends on a Sunday', () => {
    // March 2026: the 1st is a Sunday, so the grid's first Monday is Feb 23.
    const days = monthGridDays('2026-03-15');
    expect(days[0].date).toBe('2026-02-23');
    expect(new Date(`${days[0].date}T00:00:00`).getDay()).toBe(1); // Monday
    expect(new Date(`${days[41].date}T00:00:00`).getDay()).toBe(0); // Sunday
  });

  it('flags leading/trailing adjacent-month days as not-in-month', () => {
    const days = monthGridDays('2026-03-15');
    expect(days[0]).toEqual({ date: '2026-02-23', inMonth: false });
    const march1 = days.find((d) => d.date === '2026-03-01');
    expect(march1?.inMonth).toBe(true);
    const march31 = days.find((d) => d.date === '2026-03-31');
    expect(march31?.inMonth).toBe(true);
    // April days that fill the trailing week are out of month.
    expect(days.some((d) => d.date.startsWith('2026-04') && d.inMonth === false)).toBe(true);
  });

  it('includes every day of the target month exactly once', () => {
    const inMonth = monthGridDays('2026-03-15')
      .filter((d) => d.inMonth)
      .map((d) => d.date);
    expect(inMonth).toHaveLength(31); // March has 31 days
    expect(inMonth[0]).toBe('2026-03-01');
    expect(inMonth[30]).toBe('2026-03-31');
    expect(new Set(inMonth).size).toBe(31);
  });
});

describe('monthGridRange', () => {
  it('spans the first grid day 00:00 .. last grid day end-of-day (matches localDayRange boundaries)', () => {
    const range = monthGridRange('2026-03-15');
    const days = monthGridDays('2026-03-15');
    expect(range.from).toBe(localDayRange(days[0].date).from);
    expect(range.to).toBe(localDayRange(days[41].date).to);
  });
});

describe('addMonths', () => {
  it('moves forward and backward by whole months', () => {
    expect(addMonths('2026-03-15', 1)).toBe('2026-04-15');
    expect(addMonths('2026-03-15', -1)).toBe('2026-02-15');
  });

  it('crosses year boundaries', () => {
    expect(addMonths('2026-12-10', 1)).toBe('2027-01-10');
    expect(addMonths('2026-01-10', -1)).toBe('2025-12-10');
  });

  it('clamps the day when the target month is shorter (Jan 31 → Feb 28)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
});

describe('monthLabel', () => {
  it('formats month + year in the given locale', () => {
    expect(monthLabel('2026-03-15', 'es')).toMatch(/marzo.*2026/i);
  });
});
