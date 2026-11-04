import { civilDateInZone, firstOfMonth, zoneCityLabel, civilDateLabel, zonedDayStart } from './date';
import * as dateModule from './date';

// DX-354b (E6): los pintores sin sede se retiraron; lo que queda es lógica de calendario.
describe('date.ts no longer exports the sede-less painters', () => {
  it('keeps only the neutral helpers', () => {
    const exported = Object.keys(dateModule).sort();
    for (const retired of [
      'formatCivilDate',
      'formatDate',
      'formatTime',
      'formatDateTime',
      'formatTimeInZone',
      'formatDateTimeInZone',
      'formatDateLabel',
    ]) {
      expect(exported).not.toContain(retired);
    }
    expect(exported).toEqual(['civilDateInZone', 'civilDateLabel', 'firstOfMonth', 'zoneCityLabel', 'zonedDayStart']);
  });
});

describe('zonedDayStart (civil day in a zone → UTC instant)', () => {
  it('midnight of the day in the zone', () => {
    expect(zonedDayStart('2026-10-16', 'America/Caracas')).toBe('2026-10-16T04:00:00.000Z');
    expect(zonedDayStart('2026-10-16', 'Europe/Madrid')).toBe('2026-10-15T22:00:00.000Z');
    expect(zonedDayStart('2026-01-16', 'Europe/Madrid')).toBe('2026-01-15T23:00:00.000Z');
  });

  it('null for a malformed day', () => {
    expect(zonedDayStart('16/10/2026', 'America/Caracas')).toBeNull();
    expect(zonedDayStart('2026-02-30', 'America/Caracas')).toBeNull();
  });
});

describe('civilDateLabel (DX-378)', () => {
  it('a civil day in words of the product language, with no zone at all', () => {
    expect(civilDateLabel('2026-03-15', { weekday: 'long', day: 'numeric', month: 'long' })).toBe(
      'domingo, 15 de marzo',
    );
    expect(civilDateLabel('2026-03-01', { month: 'long', year: 'numeric' })).toBe('marzo de 2026');
    expect(civilDateLabel('2026-03-09', { weekday: 'short', day: 'numeric', month: 'short' })).toBe('lun, 9 mar');
  });

  it('a day that does not exist gives the fallback', () => {
    expect(civilDateLabel('2026-02-30', { day: 'numeric' })).toBe('—');
    expect(civilDateLabel('09/03/2026', { day: 'numeric' }, '')).toBe('');
  });
});

describe('zoneCityLabel (DX-097)', () => {
  it('nombre legible de la zona', () => {
    expect(zoneCityLabel('America/Caracas')).toBe('Caracas');
    expect(zoneCityLabel('Europe/Madrid')).toBe('Madrid');
    expect(zoneCityLabel('America/Mexico_City')).toBe('Ciudad de México');
    expect(zoneCityLabel('America/Caracas')).toBe('Caracas');
    expect(zoneCityLabel('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
  });
});

describe('civilDateInZone (DX-097)', () => {
  it('20:00 en Caracas del 16 es el 16 en la sede aunque en UTC sea el 17', () => {
    expect(civilDateInZone('2026-10-17T00:00:00.000Z', 'America/Caracas')).toBe('2026-10-16');
    expect(civilDateInZone('2026-10-17T01:00:00.000Z', 'UTC')).toBe('2026-10-17');
  });

  it('Madrid en el cambio de hora de octubre', () => {
    expect(civilDateInZone('2026-10-24T22:00:00.000Z', 'Europe/Madrid')).toBe('2026-10-25');
    expect(civilDateInZone('2026-10-25T22:59:00.000Z', 'Europe/Madrid')).toBe('2026-10-25');
    expect(civilDateInZone('2026-10-25T23:00:00.000Z', 'Europe/Madrid')).toBe('2026-10-26');
  });

  it('null con un instante o una zona inválidos', () => {
    expect(civilDateInZone('no-es-fecha', 'America/Caracas')).toBeNull();
    expect(civilDateInZone('2026-10-17T01:00:00.000Z', 'Mars/Olympus')).toBeNull();
  });
});

describe('firstOfMonth', () => {
  it('da el día 1 del mes del día dado', () => {
    expect(firstOfMonth('2026-10-24')).toBe('2026-10-01');
    expect(firstOfMonth('2026-02-01')).toBe('2026-02-01');
  });
});
