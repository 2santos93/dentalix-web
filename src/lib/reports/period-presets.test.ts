import { PERIOD_PRESETS, periodFor } from './period-presets';

describe('periodos de «Comparar sedes» (DX-014)', () => {
  const today = '2026-10-24';

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
});
