import { monthGridDays, monthGridRange, addMonths, monthLabel, weekDayHeader } from './calendar-grid';
import { regionalFormat } from '@/lib/format/regional-format';
import { civilWeekday } from '@/lib/time/civil-day';
import { wallDayRange } from '@/lib/time/wall-clock';

describe('monthGridDays', () => {
  it('returns exactly 42 days (6 weeks × 7)', () => {
    expect(monthGridDays('2026-03-15')).toHaveLength(42);
  });

  it('starts on the Monday on/before the 1st and ends on a Sunday', () => {
    // March 2026: the 1st is a Sunday, so the grid's first Monday is Feb 23.
    const days = monthGridDays('2026-03-15');
    expect(days[0].date).toBe('2026-02-23');
    expect(civilWeekday(days[0].date)).toBe(1); // Monday
    expect(civilWeekday(days[41].date)).toBe(0); // Sunday
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
  it('spans the first grid day 00:00 .. last grid day end-of-day in the sede zone, not the browser', () => {
    const range = monthGridRange('2026-03-15', 'America/Caracas');
    const days = monthGridDays('2026-03-15');
    expect(range.from).toBe(wallDayRange(days[0].date, 'America/Caracas').from);
    expect(range.to).toBe(wallDayRange(days[41].date, 'America/Caracas').to);
    expect(range.from).toBe('2026-02-23T04:00:00.000Z');
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
  it('month + year in words of the product language', () => {
    expect(monthLabel('2026-03-15')).toBe('marzo de 2026');
  });
});

describe('weekDayHeader', () => {
  it('the weekday in words, day and month in the order of the sede locale', () => {
    expect(weekDayHeader('2026-03-09', regionalFormat({ locale: 'es-VE', hourCycle: 'h12' }))).toBe('lun 9/3');
    expect(weekDayHeader('2026-03-09', regionalFormat({ locale: 'en-US', hourCycle: 'h12' }))).toBe('lun 03/09');
  });
});
