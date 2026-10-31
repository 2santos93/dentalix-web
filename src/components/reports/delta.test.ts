import { deltaBase, LOW_BASE_MAX_CHANGE, LOW_BASE_MIN_EVENTS } from './delta';

const relative = (unit: 'MONEY' | 'COUNT') => ({ unit, changeUnit: 'PERCENT' as const });
const points = { unit: 'PERCENT' as const, changeUnit: 'POINTS' as const };

describe('deltaBase: ¿la base del período comparado aguanta un %?', () => {
  it('antes 0 y ahora no: «nuevo»; 0 y 0: se compara (igual)', () => {
    expect(deltaBase({ value: 50, previous: 0, change: null }, relative('MONEY'))).toBe('new');
    expect(deltaBase({ value: 0, previous: 0, change: null }, relative('MONEY'))).toBe('ok');
  });

  it(`conteos con menos de ${LOW_BASE_MIN_EVENTS} antes: «base baja» (2 → 25 citas no es +1.150 %)`, () => {
    expect(deltaBase({ value: 25, previous: 2, change: 1150 }, relative('COUNT'))).toBe('low');
    expect(deltaBase({ value: 3, previous: 4, change: -25 }, relative('COUNT'))).toBe('low');
    expect(deltaBase({ value: 12, previous: 10, change: 20 }, relative('COUNT'))).toBe('ok');
  });

  it(`más de +${LOW_BASE_MAX_CHANGE} % en un importe: «base baja»; ×4 justo, aún se enseña`, () => {
    expect(deltaBase({ value: 2195, previous: 100, change: 2095 }, relative('MONEY'))).toBe('low');
    expect(deltaBase({ value: 400, previous: 100, change: 300 }, relative('MONEY'))).toBe('ok');
    expect(deltaBase({ value: 10, previous: 100, change: -90 }, relative('MONEY'))).toBe('ok');
  });

  it('puntos: solo «base baja» si la muestra (citas atendidas antes) es pequeña', () => {
    expect(deltaBase({ value: 16, previous: 0, change: 16 }, points, 2)).toBe('low');
    expect(deltaBase({ value: 16, previous: 8, change: 8 }, points, 40)).toBe('ok');
    expect(deltaBase({ value: 16, previous: 8, change: 8 }, points)).toBe('ok');
  });

  it('sin comparación no opina', () => {
    expect(deltaBase({ value: 10, previous: null, change: null }, relative('MONEY'))).toBe('ok');
  });
});
