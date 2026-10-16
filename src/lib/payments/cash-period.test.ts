import { isValidRange, presetRange } from './cash-period';

// DX-097: los atajos salen del día civil de la SEDE (su zona IANA), no del
// reloj del navegador. La suite corre con TZ=UTC: si se leyera la fecha local,
// los casos de Bogotá de noche saldrían un día después.
const BOGOTA = 'America/Bogota';
// Jueves 15/10/2026 a las 22:30 en Bogotá = viernes 16 a las 03:30 UTC.
const bogotaThu2230 = new Date('2026-10-16T03:30:00.000Z');

describe('presetRange (en la zona de la sede)', () => {
  it('hoy: el día de la sede aunque en UTC ya sea mañana', () => {
    expect(presetRange('today', BOGOTA, bogotaThu2230)).toEqual({ from: '2026-10-15', to: '2026-10-15' });
    expect(presetRange('today', 'UTC', bogotaThu2230)).toEqual({ from: '2026-10-16', to: '2026-10-16' });
  });

  it('hoy en Madrid: las 00:30 del 16 (22:30Z del 15) ya son el 16', () => {
    expect(presetRange('today', 'Europe/Madrid', new Date('2026-10-15T22:30:00.000Z'))).toEqual({
      from: '2026-10-16',
      to: '2026-10-16',
    });
  });

  it('esta semana: de lunes a domingo de la semana de la sede', () => {
    expect(presetRange('week', BOGOTA, bogotaThu2230)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
  });

  it('esta semana un domingo: la semana que termina ese día, no la siguiente', () => {
    // Domingo 18/10 a las 21:00 en Bogotá = lunes 19 02:00 UTC.
    expect(presetRange('week', BOGOTA, new Date('2026-10-19T02:00:00.000Z'))).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    });
  });

  it('esta semana cruzando de mes', () => {
    expect(presetRange('week', BOGOTA, new Date('2026-09-30T14:00:00.000Z'))).toEqual({
      from: '2026-09-28',
      to: '2026-10-04',
    });
  });

  it('este mes: el de la sede, del 1 al último día (bisiestos incluidos)', () => {
    // 31/10 a las 22:00 en Bogotá = 01/11 03:00 UTC: sigue siendo octubre.
    expect(presetRange('month', BOGOTA, new Date('2026-11-01T03:00:00.000Z'))).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(presetRange('month', BOGOTA, new Date('2028-02-10T15:00:00.000Z'))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });

  it('una zona desconocida cae en la zona por defecto de la sede (Bogotá), nunca en la del navegador', () => {
    expect(presetRange('today', 'Mars/Olympus', bogotaThu2230)).toEqual({ from: '2026-10-15', to: '2026-10-15' });
  });
});

describe('isValidRange', () => {
  it('acepta from <= to dentro de 366 días y rechaza lo demás', () => {
    expect(isValidRange({ from: '2026-10-01', to: '2026-10-31' })).toBe(true);
    expect(isValidRange({ from: '2026-10-31', to: '2026-10-01' })).toBe(false);
    expect(isValidRange({ from: '2028-01-01', to: '2028-12-31' })).toBe(true);
    expect(isValidRange({ from: '2026-01-01', to: '2027-01-02' })).toBe(false);
    expect(isValidRange({ from: '', to: '2026-10-01' })).toBe(false);
  });
});
