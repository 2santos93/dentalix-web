import { CalendarDate } from '@internationalized/date';
import {
  DEFAULT_RANGE_PRESETS,
  calendarDateToIso,
  isoToCalendarDate,
  isoToTime,
  normalizeDateLocale,
  timeToIso,
} from './iso';

describe('puente ISO ↔ @internationalized/date', () => {
  it('lee y escribe días civiles', () => {
    expect(isoToCalendarDate('2026-10-30')?.toString()).toBe('2026-10-30');
    expect(calendarDateToIso(new CalendarDate(987, 1, 2))).toBe('0987-01-02');
    expect(isoToCalendarDate('2026-02-31')).toBeNull();
    expect(isoToCalendarDate('30/10/2026')).toBeNull();
    expect(isoToCalendarDate('')).toBeNull();
    expect(isoToCalendarDate(null)).toBeNull();
  });

  it('lee y escribe horas de reloj', () => {
    expect(timeToIso(isoToTime('09:05'))).toBe('09:05');
    expect(timeToIso(isoToTime('23:59:00'))).toBe('23:59');
    expect(isoToTime('24:00')).toBeNull();
    expect(isoToTime('9:05')).toBeNull();
  });

  it('los atajos de periodo cuentan desde «hoy»', () => {
    const today = new CalendarDate(2026, 3, 15);
    const byId = Object.fromEntries(DEFAULT_RANGE_PRESETS.map((p) => [p.id, p.range(today)]));
    expect(byId.today).toEqual({ from: '2026-03-15', to: '2026-03-15' });
    expect(byId.last7Days).toEqual({ from: '2026-03-09', to: '2026-03-15' });
    expect(byId.thisMonth).toEqual({ from: '2026-03-01', to: '2026-03-15' });
    expect(byId.previousMonth).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('el locale de la sede pierde las extensiones -u- y cae a es', () => {
    expect(normalizeDateLocale('es-VE-u-ca-buddhist')).toBe('es-VE');
    expect(normalizeDateLocale(undefined)).toBe('es');
    expect(normalizeDateLocale('not a locale!!')).toBe('es');
  });
});
