import { appointmentLine } from './appointment-line';

describe('appointmentLine (DX-170)', () => {
  it('fecha dd/mm local y el profesional de la cita', () => {
    const start = new Date(2026, 9, 7, 9, 30).toISOString();
    expect(appointmentLine(start, 'Dra. Ríos')).toBe('Cita del 07/10 · Dra. Ríos');
  });

  it('sin profesional, solo la fecha', () => {
    const start = new Date(2026, 0, 31, 18, 0).toISOString();
    expect(appointmentLine(start, null)).toBe('Cita del 31/01');
  });
});
