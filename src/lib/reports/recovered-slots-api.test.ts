import { formatDurationMinutes, isMonth, monthOptions, monthPeriod } from './recovered-slots-api';

describe('recovered-slots-api (DX-436)', () => {
  it('duración «45 min», «1 h 05 min», «2 h»', () => {
    expect(formatDurationMinutes(45)).toBe('45 min');
    expect(formatDurationMinutes(65)).toBe('1 h 05 min');
    expect(formatDurationMinutes(120)).toBe('2 h');
    expect(formatDurationMinutes(64.6)).toBe('1 h 05 min');
    expect(formatDurationMinutes(0)).toBe('0 min');
  });

  it('el mes como período entero (febrero bisiesto incluido)', () => {
    expect(monthPeriod('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthPeriod('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthPeriod('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('meses del selector desde el actual hacia atrás, cruzando el año', () => {
    const options = monthOptions('2026-01-31', 3);
    expect(options.map((o) => o.value)).toEqual(['2026-01', '2025-12', '2025-11']);
    expect(options[0].label).toBe('enero de 2026');
  });

  it('valida AAAA-MM', () => {
    expect(isMonth('2026-11')).toBe(true);
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth(null)).toBe(false);
  });
});
