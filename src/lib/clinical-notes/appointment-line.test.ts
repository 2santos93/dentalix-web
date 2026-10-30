import { appointmentLine } from './appointment-line';
import { locationClock } from '@/lib/locations/sede-clock';
import { caracasSede } from '@/lib/test/sede-clock';

// Caracas (UTC−4), es-VE; Jest corre con TZ=UTC.
const clock = locationClock(caracasSede());

describe('appointmentLine (DX-170)', () => {
  it('día y mes en la zona y con el formato de la sede, y el profesional de la cita', () => {
    // 02:30 UTC del 8 de octubre aún es el 7 en Caracas.
    expect(appointmentLine('2026-10-08T02:30:00.000Z', 'Dra. Ríos', clock)).toBe('Cita del 7/10 · Dra. Ríos');
  });

  it('sin profesional, solo la fecha; sin reloj de la sede, «—»', () => {
    expect(appointmentLine('2026-01-31T18:00:00.000Z', null, clock)).toBe('Cita del 31/1');
    expect(appointmentLine('2026-01-31T18:00:00.000Z', null, null)).toBe('Cita del —');
  });
});
