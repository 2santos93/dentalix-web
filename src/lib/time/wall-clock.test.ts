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

  it('half-hour and 45-minute zones (Kolkata +05:30, Chatham +12:45/+13:45)', () => {
    expect(wallInstant('2026-10-30', 9 * 60 + 15, 'Asia/Kolkata').toISOString()).toBe('2026-10-30T03:45:00.000Z');
    expect(wallInstant('2026-10-30', 0, 'Asia/Kolkata').toISOString()).toBe('2026-10-29T18:30:00.000Z');
    expect(wallInstant('2026-10-30', 9 * 60, 'Pacific/Chatham').toISOString()).toBe('2026-10-29T19:15:00.000Z');
  });

  it('a minute that does not exist (spring forward) moves forward by the jump, like Temporal "compatible"', () => {
    // Nueva York, 08-03-2026: de 02:00 EST a 03:00 EDT. 02:30 → 03:30 EDT.
    expect(wallInstant('2026-03-08', 2 * 60 + 30, 'America/New_York').toISOString()).toBe('2026-03-08T07:30:00.000Z');
    // Lord Howe adelanta media hora: 02:15 → 02:45.
    expect(wallMinuteOfDay(wallInstant('2026-10-04', 2 * 60 + 15, 'Australia/Lord_Howe'), 'Australia/Lord_Howe')).toBe(
      2 * 60 + 45,
    );
  });

  it('a midnight that does not exist (Santiago de Chile, Beirut) is the first hour of that day, never the day before', () => {
    // Santiago, 06-09-2026: de 00:00 −04 a 01:00 −03.
    const santiago = wallInstant('2026-09-06', 0, 'America/Santiago');
    expect(santiago.toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(wallDay(santiago, 'America/Santiago')).toBe('2026-09-06');
    expect(wallDayRange('2026-09-06', 'America/Santiago')).toEqual({
      from: '2026-09-06T04:00:00.000Z',
      to: '2026-09-07T02:59:59.999Z',
    });
    // Y el día anterior acaba justo antes: sin hueco ni solape entre los dos rangos.
    expect(wallDayRange('2026-09-05', 'America/Santiago').to).toBe('2026-09-06T03:59:59.999Z');
    expect(wallDay(wallInstant('2026-03-29', 0, 'Asia/Beirut'), 'Asia/Beirut')).toBe('2026-03-29');
  });

  it('a repeated minute (fall back) is its first occurrence; the day lasts 25 h', () => {
    expect(wallInstant('2026-11-01', 60 + 30, 'America/New_York').toISOString()).toBe('2026-11-01T05:30:00.000Z');
    expect(wallDayRange('2026-11-01', 'America/New_York')).toEqual({
      from: '2026-11-01T04:00:00.000Z',
      to: '2026-11-02T04:59:59.999Z',
    });
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
