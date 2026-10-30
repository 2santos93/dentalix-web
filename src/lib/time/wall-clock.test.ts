import {
  addCivilDays,
  civilWeekStart,
  wallDay,
  wallDayRange,
  wallInstant,
  wallMinuteOfDay,
  wallWeekRange,
} from './wall-clock';

// Jest corre con TZ=UTC: las zonas de estas pruebas son siempre otras, así que
// un cálculo con la zona del navegador daría otro resultado.
const CARACAS = 'America/Caracas'; // UTC−4, sin horario de verano
const MADRID = 'Europe/Madrid'; // UTC+1 / UTC+2
const AUCKLAND = 'Pacific/Auckland'; // UTC+13 en octubre

describe('wallMinuteOfDay', () => {
  it('reads the wall clock of the sede, not the browser', () => {
    expect(wallMinuteOfDay('2026-10-27T19:30:00Z', CARACAS)).toBe(15 * 60 + 30);
    expect(wallMinuteOfDay(new Date('2026-10-27T19:30:00Z'), MADRID)).toBe(20 * 60 + 30);
  });

  it('wraps at midnight in the sede zone', () => {
    expect(wallMinuteOfDay('2026-10-27T11:00:00Z', AUCKLAND)).toBe(0);
  });
});

describe('wallDay', () => {
  it('is the civil day in the sede zone', () => {
    expect(wallDay('2026-10-28T02:00:00Z', CARACAS)).toBe('2026-10-27');
    expect(wallDay('2026-10-27T11:00:00Z', AUCKLAND)).toBe('2026-10-28');
  });
});

describe('wallInstant', () => {
  it('is the instant the sede clock shows that minute of that day', () => {
    expect(wallInstant('2026-10-27', 15 * 60 + 30, CARACAS).toISOString()).toBe('2026-10-27T19:30:00.000Z');
    expect(wallInstant('2026-07-01', 9 * 60, MADRID).toISOString()).toBe('2026-07-01T07:00:00.000Z');
    expect(wallInstant('2026-12-01', 9 * 60, MADRID).toISOString()).toBe('2026-12-01T08:00:00.000Z');
  });

  it('settles a DST change between midnight and the minute', () => {
    // Madrid pasa a verano el 29-03-2026 a las 02:00: a las 10:00 ya es UTC+2.
    expect(wallInstant('2026-03-29', 10 * 60, MADRID).toISOString()).toBe('2026-03-29T08:00:00.000Z');
    expect(wallInstant('2026-03-29', 0, MADRID).toISOString()).toBe('2026-03-28T23:00:00.000Z');
  });

  it('minute 1440 is midnight of the next day', () => {
    expect(wallInstant('2026-10-27', 24 * 60, CARACAS).toISOString()).toBe('2026-10-28T04:00:00.000Z');
  });

  it('round-trips with wallMinuteOfDay and wallDay', () => {
    const instant = wallInstant('2026-10-28', 7 * 60 + 45, AUCKLAND);
    expect(wallDay(instant, AUCKLAND)).toBe('2026-10-28');
    expect(wallMinuteOfDay(instant, AUCKLAND)).toBe(7 * 60 + 45);
  });

  it('rejects a day that does not exist or a minute out of range', () => {
    expect(() => wallInstant('2026-02-30', 0, CARACAS)).toThrow(RangeError);
    expect(() => wallInstant('2026-10-27', -1, CARACAS)).toThrow(RangeError);
    expect(() => wallInstant('2026-10-27', 24 * 60 + 1, CARACAS)).toThrow(RangeError);
  });
});

describe('civil day arithmetic', () => {
  it('adds days across months and years without any zone', () => {
    expect(addCivilDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addCivilDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addCivilDays('2026-03-28', 7)).toBe('2026-04-04');
  });

  it('the week starts on Monday (ISO 8601); Sunday belongs to the week ending that day', () => {
    expect(civilWeekStart('2026-10-28')).toBe('2026-10-26');
    expect(civilWeekStart('2026-10-26')).toBe('2026-10-26');
    expect(civilWeekStart('2026-11-01')).toBe('2026-10-26');
  });
});

describe('wallDayRange / wallWeekRange', () => {
  it('the day runs from midnight to just before the next midnight in the sede zone', () => {
    expect(wallDayRange('2026-10-27', CARACAS)).toEqual({
      from: '2026-10-27T04:00:00.000Z',
      to: '2026-10-28T03:59:59.999Z',
    });
  });

  it('a 23-hour DST day ends at the next real midnight', () => {
    expect(wallDayRange('2026-03-29', MADRID)).toEqual({
      from: '2026-03-28T23:00:00.000Z',
      to: '2026-03-29T21:59:59.999Z',
    });
  });

  it('the week runs Monday to Sunday in the sede zone', () => {
    expect(wallWeekRange('2026-10-28', AUCKLAND)).toEqual({
      from: '2026-10-25T11:00:00.000Z',
      to: '2026-11-01T10:59:59.999Z',
    });
  });
});
