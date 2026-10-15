import { isValidRange, presetRange, toCivilDate } from './cash-period';

// Constructor local (año, mes-1, día, hora): el "hoy" de la caja es el día del
// reloj de quien la mira, no el de UTC.
const thu15Oct = new Date(2026, 9, 15, 23, 30);

describe('presetRange', () => {
  it('hoy: el día local, aunque en UTC ya sea mañana', () => {
    expect(presetRange('today', thu15Oct)).toEqual({ from: '2026-10-15', to: '2026-10-15' });
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
