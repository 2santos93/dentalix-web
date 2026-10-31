import { isValidPeriod, isWithinMonths, MAX_PERIOD_DAYS, PERIOD_PRESETS, periodFor } from './period-presets';

describe('periodos de «Comparar sedes» (DX-014)', () => {
  const today = '2026-10-24';

  it('un período personalizado vale con «Desde» ≤ «Hasta» y hasta 366 días, como en la API', () => {
    expect(MAX_PERIOD_DAYS).toBe(366);
    expect(isValidPeriod({ from: '2026-10-01', to: '2026-10-01' })).toBe(true);
    expect(isValidPeriod({ from: '2025-10-31', to: '2026-10-31' })).toBe(true);
    expect(isValidPeriod({ from: '2025-10-30', to: '2026-10-31' })).toBe(false);
    expect(isValidPeriod({ from: '2026-10-02', to: '2026-10-01' })).toBe(false);
  });

  it('ofrece los cinco atajos en orden', () => {
    expect(PERIOD_PRESETS.map((p) => p.key)).toEqual([
      'this_month',
      'last_month',
      'last_30_days',
      'this_year',
      'custom',
    ]);
  });

  it('«Este mes»: del 1 a hoy', () => {
    expect(periodFor('this_month', today)).toEqual({ from: '2026-10-01', to: '2026-10-24' });
  });

  it('«Mes anterior»: el mes completo, también en enero y en febrero bisiesto', () => {
    expect(periodFor('last_month', today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodFor('last_month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(periodFor('last_month', '2028-03-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('«Últimos 30 días»: hoy y los 29 anteriores', () => {
    expect(periodFor('last_30_days', today)).toEqual({ from: '2026-09-25', to: '2026-10-24' });
  });

  it('«Este año»: del 1 de enero a hoy', () => {
    expect(periodFor('this_year', today)).toEqual({ from: '2026-01-01', to: '2026-10-24' });
  });

  it('«Personalizado» no tiene fechas propias', () => {
    expect(periodFor('custom', today)).toBeNull();
  });

  it('DX-423: 24 meses por calendario («hasta» anterior a «desde» + 24 meses), no por días', () => {
    expect(isWithinMonths({ from: '2024-11-01', to: '2026-10-31' }, 24)).toBe(true);
    // 731 días, pero 24 meses y un día.
    expect(isWithinMonths({ from: '2025-01-01', to: '2027-01-01' }, 24)).toBe(false);
    expect(isWithinMonths({ from: '2026-10-31', to: '2026-10-01' }, 24)).toBe(false);
    expect(isWithinMonths({ from: '2026-10-01', to: '2026-10-01' }, 24)).toBe(true);
  });
});
