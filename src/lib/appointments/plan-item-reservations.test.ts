import {
  canClaimReserved,
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
  heldInClinic: false,
  appointmentId: 'a2',
  start: '2026-10-30T14:00:00.000Z',
  locationId: 'l1',
  locationName: 'Sede Norte',
  timeZone: 'America/Bogota',
  locale: 'es-CO',
  hourCycle: 'h12' as const,
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

describe('plan-item-reservations: titular de hoy en la clínica (DX-293)', () => {
  const held = { ...item, heldInClinic: true, start: '2026-10-24T14:05:00.000Z' };
  const hidden = {
    ...item,
    heldInClinic: true,
    appointmentId: null,
    start: null,
    locationId: null,
    locationName: null,
    timeZone: null,
    locale: null,
    hourCycle: null,
  };

  it('dice la hora (en la zona de su sede) y la sede, con el paciente en la clínica', () => {
    expect(reservedElsewhereMessage(held)).toBe(
      'Reservado en la cita de hoy a las 09:05 (Sede Norte), con el paciente en la clínica.',
    );
    expect(reservedElsewhereMessage({ ...held, timeZone: 'Europe/Madrid' })).toBe(
      'Reservado en la cita de hoy a las 16:05 (Sede Norte), con el paciente en la clínica.',
    );
  });

  it('sede no permitida: texto genérico, sin hora ni sede (DX-089)', () => {
    const text = reservedElsewhereMessage(hidden);
    expect(text).toBe('Reservado en otra cita de hoy, con el paciente en la clínica.');
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/Sede/);
  });

  it('«Traer a esta cita» solo si la titular no es de hoy con el paciente en la clínica', () => {
    expect(canClaimReserved(item)).toBe(true);
    // Olvidada de un día anterior: la API dice heldInClinic false.
    expect(canClaimReserved({ ...item, start: '2026-10-20T14:00:00.000Z' })).toBe(true);
    expect(canClaimReserved(held)).toBe(false);
    expect(canClaimReserved(hidden)).toBe(false);
  });
});
