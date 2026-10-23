import {
  canExitCompleted,
  completedExitSummary,
  reservedAt,
  reservedElsewhereMessage,
  reservedItemLabel,
  validStatusReason,
} from './plan-item-reservations';

const item = {
  planItemId: 'i1',
  name: 'Implante',
  toothNumber: '36',
  appointmentId: 'a2',
  start: '2026-10-30T14:00:00.000Z',
  locationId: 'l1',
  locationName: 'Sede Norte',
  timeZone: 'America/Bogota',
};

describe('plan-item-reservations (DX-273)', () => {
  it('la fecha de la otra cita va en la zona de SU sede', () => {
    expect(reservedAt(item)).toBe('30/10/2026 a las 09:00');
    expect(reservedAt({ ...item, timeZone: 'Europe/Madrid' })).toBe('30/10/2026 a las 15:00');
  });

  it('el aviso dice en qué cita y sede está reservado', () => {
    expect(reservedElsewhereMessage(item)).toBe(
      'Este tratamiento está reservado en la cita del 30/10/2026 a las 09:00 (Sede Norte).',
    );
    expect(reservedItemLabel(item)).toBe('Implante · diente 36');
  });

  it('solo ADMIN y DENTIST sacan una cita de «Completada»', () => {
    expect(canExitCompleted('ADMIN')).toBe(true);
    expect(canExitCompleted('DENTIST')).toBe(true);
    expect(canExitCompleted('RECEPTION')).toBe(false);
    expect(canExitCompleted('ASSISTANT')).toBe(false);
    expect(canExitCompleted(null)).toBe(false);
  });

  it('el motivo recortado tiene de 3 a 500 caracteres', () => {
    expect(validStatusReason('  ab  ')).toBe(false);
    expect(validStatusReason('abc')).toBe(true);
    expect(validStatusReason('x'.repeat(500))).toBe(true);
    expect(validStatusReason('x'.repeat(501))).toBe(false);
  });

  it('resume el mínimo de la visita siguiente tras la salida', () => {
    expect(
      completedExitSummary({
        visitMinimums: [
          { planId: 'p', visit: 2, minimumDayBefore: '2027-01-20', minimumDayAfter: null, anchorAppointmentIdAfter: null },
          { planId: 'p', visit: 3, minimumDayBefore: '2027-03-01', minimumDayAfter: '2027-02-10', anchorAppointmentIdAfter: 'a' },
        ],
      }),
    ).toEqual([
      'Visita 2: ahora se puede agendar desde hoy: ya no queda ninguna cita completada de la visita anterior.',
      'Visita 3: ahora se puede agendar desde el 10/02/2027 (última cita que sigue completada).',
    ]);
  });
});
