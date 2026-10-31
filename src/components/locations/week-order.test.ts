import { firstWeekday, weekOrder } from './week-order';

describe('weekOrder (B6)', () => {
  it('sin locale o sin región, lunes primero (ISO, como Calendario de la sede)', () => {
    expect(weekOrder(null)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekOrder('es')).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(firstWeekday('basura!!')).toBe(1);
  });

  it('un formato regional europeo empieza en lunes', () => {
    expect(weekOrder('es-ES')).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('un locale cuya semana empieza en domingo (CLDR) empieza en domingo', () => {
    expect(weekOrder('en-US')).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(firstWeekday('es-VE')).toBe(0);
  });
});
