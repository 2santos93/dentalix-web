import { isCivilDate, isOccupancyPreset, occupancyPeriodFor } from './chair-occupancy-api';

describe('chair-occupancy-api (DX-481)', () => {
  it('día, semana (lunes a domingo) y mes enteros desde «hoy» de la sede', () => {
    // 2026-11-12 es jueves.
    expect(occupancyPeriodFor('dia', '2026-11-12')).toEqual({ from: '2026-11-12', to: '2026-11-12' });
    expect(occupancyPeriodFor('semana', '2026-11-12')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(occupancyPeriodFor('mes', '2026-11-12')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(occupancyPeriodFor('mes-anterior', '2026-11-12')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(occupancyPeriodFor('personalizado', '2026-11-12')).toBeNull();
  });

  it('la semana cruza mes y año; el domingo es el último día de su semana', () => {
    expect(occupancyPeriodFor('semana', '2027-01-03')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
    expect(occupancyPeriodFor('semana', '2026-11-09')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(occupancyPeriodFor('mes-anterior', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('valida el atajo y las fechas de la URL', () => {
    expect(isOccupancyPreset('semana')).toBe(true);
    expect(isOccupancyPreset('anio')).toBe(false);
    expect(isOccupancyPreset(null)).toBe(false);
    expect(isCivilDate('2028-02-29')).toBe(true);
    expect(isCivilDate('2026-02-30')).toBe(false);
    expect(isCivilDate('ayer')).toBe(false);
  });
});
