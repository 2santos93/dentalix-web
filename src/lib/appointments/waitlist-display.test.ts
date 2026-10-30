import { groupOpeningsByDay, waitingLabel, waitlistOriginLabel } from './waitlist-display';
import { locationClock } from '@/lib/locations/sede-clock';
import { clinicLocation } from '@/lib/test/locations';

// Sede en Caracas (UTC−4); Jest corre con TZ=UTC.
const ZONE = 'America/Caracas';
const h12 = locationClock(clinicLocation({ timeZone: ZONE, locale: 'es-VE', hourCycle: 'h12' }));
const h23 = locationClock(clinicLocation({ timeZone: ZONE, locale: 'es-ES', hourCycle: 'h23' }));

describe('waitlist-display (DX-122)', () => {
  const now = new Date('2031-03-10T19:00:00Z'); // 15:00 en Caracas

  it('antigüedad en días de calendario de la sede', () => {
    expect(waitingLabel('2031-03-10T12:00:00Z', ZONE, now)).toBe('Desde hoy');
    // 01:00 UTC del 10 son las 21:00 del 9 en Caracas.
    expect(waitingLabel('2031-03-10T01:00:00Z', ZONE, now)).toBe('Hace 1 día');
    expect(waitingLabel('2031-03-01T14:00:00Z', ZONE, now)).toBe('Hace 9 días');
  });

  it('de dónde viene la entrada, con el reloj de la sede', () => {
    const start = '2031-03-03T14:00:00Z'; // 10:00 en Caracas
    expect(waitlistOriginLabel({ sourceAppointment: { start, status: 'CANCELLED' } }, h23)).toBe(
      'Canceló la cita del 3 mar 10:00',
    );
    expect(waitlistOriginLabel({ sourceAppointment: { start, status: 'NO_SHOW' } }, h12)).toBe(
      'No asistió a la cita del 3 mar 10:00 a. m.',
    );
    expect(waitlistOriginLabel({ sourceAppointment: { start, status: 'NO_SHOW' } }, null)).toBe(
      'No asistió a la cita del —',
    );
    expect(waitlistOriginLabel({ sourceAppointment: null }, null)).toBe('Alta manual');
  });

  it('agrupa los huecos por día de la sede, en orden', () => {
    const groups = groupOpeningsByDay(
      [
        { start: '2031-03-10T13:00:00Z', end: '2031-03-10T16:00:00Z' },
        // 02:00 UTC del 11 son las 22:00 del 10 en Caracas.
        { start: '2031-03-11T02:00:00Z', end: '2031-03-11T03:00:00Z' },
        { start: '2031-03-11T13:00:00Z', end: '2031-03-11T14:00:00Z' },
      ],
      ZONE,
    );
    expect(groups.map((g) => [g.day, g.openings.length])).toEqual([
      ['2031-03-10', 2],
      ['2031-03-11', 1],
    ]);
  });
});
