import { isValidRange, presetRange, toCivilDate } from './cash-period';

// Constructor local (año, mes-1, día, hora): el "hoy" de la caja es el día del
// reloj de quien la mira, no el de UTC (ver el caso de Bogotá abajo).
const thu15Oct = new Date(2026, 9, 15, 23, 30);

describe('presetRange', () => {
  it('hoy: un solo día, el de `now`', () => {
    expect(presetRange('today', thu15Oct)).toEqual({ from: '2026-10-15', to: '2026-10-15' });
  });

  // La suite corre con TZ=UTC (jest.config.ts) y Node no deja cambiarla en
  // caliente, así que el reloj de Bogotá se simula sobre el propio instante:
  // 2026-10-16T03:30Z son las 22:30 del jueves 15 en America/Bogota (UTC-5).
  // Los getters locales devuelven lo que devolverían allí; `toISOString` sigue
  // diciendo 16. Si el atajo leyera la fecha en UTC, saldría el viernes.
  it('hoy y esta semana salen del reloj LOCAL, no de UTC (22:30 en Bogotá = 03:30Z del día siguiente)', () => {
    const bogotaThu2230 = new Date('2026-10-16T03:30:00.000Z');
    jest.spyOn(bogotaThu2230, 'getFullYear').mockReturnValue(2026);
    jest.spyOn(bogotaThu2230, 'getMonth').mockReturnValue(9);
    jest.spyOn(bogotaThu2230, 'getDate').mockReturnValue(15);
    jest.spyOn(bogotaThu2230, 'getDay').mockReturnValue(4);
    expect(bogotaThu2230.toISOString().slice(0, 10)).toBe('2026-10-16');

    expect(presetRange('today', bogotaThu2230)).toEqual({ from: '2026-10-15', to: '2026-10-15' });
    expect(presetRange('week', bogotaThu2230)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
  });

  it('esta semana: de lunes a domingo', () => {
    expect(presetRange('week', thu15Oct)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
  });

  it('esta semana un domingo: la semana que termina ese día, no la siguiente', () => {
    expect(presetRange('week', new Date(2026, 9, 18, 9))).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    });
  });

  it('esta semana cruzando de mes', () => {
    expect(presetRange('week', new Date(2026, 8, 30, 9))).toEqual({
      from: '2026-09-28',
      to: '2026-10-04',
    });
  });

  it('este mes: del 1 al último día, bisiestos incluidos', () => {
    expect(presetRange('month', thu15Oct)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('month', new Date(2028, 1, 10))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });
});

describe('toCivilDate', () => {
  it('rellena mes y día con ceros', () => {
    expect(toCivilDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('isValidRange', () => {
  it('acepta un día y rangos ordenados', () => {
    expect(isValidRange({ from: '2026-10-15', to: '2026-10-15' })).toBe(true);
    expect(isValidRange({ from: '2026-01-01', to: '2026-12-31' })).toBe(true);
  });

  it('rechaza vacíos, invertidos y de más de 366 días', () => {
    expect(isValidRange({ from: '', to: '2026-10-15' })).toBe(false);
    expect(isValidRange({ from: '2026-10-16', to: '2026-10-15' })).toBe(false);
    expect(isValidRange({ from: '2026-01-01', to: '2027-01-02' })).toBe(false);
  });
});
