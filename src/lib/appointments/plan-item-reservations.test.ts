import {
  canClaimReserved,
  canExitCompleted,
  completedExitSummary,
  reservedAt,
  reservedElsewhereMessage,
  reservedElsewhereToast,
  reservedItemLabel,
  reservedNeedsFormat,
  reservationCopy,
  validStatusReason,
} from './plan-item-reservations';
import { regionalFormat } from '@/lib/format/regional-format';

const item = {
  planItemId: 'i1',
  name: 'Implante',
  toothNumber: '36',
  heldInClinic: false,
  appointmentId: 'a2',
  start: '2026-10-30T14:00:00.000Z',
  locationId: 'l1',
  locationName: 'Sede Norte',
  timeZone: 'America/New_York',
  locale: 'en-US',
  hourCycle: 'h12' as const,
};

describe('plan-item-reservations (DX-273)', () => {
  it('la fecha de la otra cita va en la zona de SU sede', () => {
    const fmt = regionalFormat({ locale: 'en-US', hourCycle: 'h12' });
    expect(reservedAt(item, fmt)).toBe('10/30/2026 a las 10:00 a. m.');
    expect(reservedAt({ ...item, timeZone: 'Europe/Berlin' }, fmt)).toBe('10/30/2026 a las 3:00 p. m.');
  });

  it('reservedAt at a ja-JP h23 location reads 2026/10/30 a las 09:00', () => {
    const fmt = regionalFormat({ locale: 'ja-JP', hourCycle: 'h23' });
    expect(reservedAt({ start: '2026-10-30T00:00:00.000Z', timeZone: 'Asia/Tokyo' }, fmt)).toBe(
      '2026/10/30 a las 09:00',
    );
  });

  it('el aviso dice en qué cita y sede está reservado, con el formato y el reloj de SU sede', () => {
    expect(reservedElsewhereMessage(item)).toBe(
      'Este tratamiento está reservado en la cita del 10/30/2026 a las 10:00 a. m. (Sede Norte).',
    );
    expect(
      reservedElsewhereMessage({ ...item, timeZone: 'Europe/Berlin', locale: 'de-DE', hourCycle: 'h23' }),
    ).toBe('Este tratamiento está reservado en la cita del 30.10.2026 a las 15:00 (Sede Norte).');
    expect(reservedNeedsFormat(item)).toBe(false);
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

  it('dice la hora (en la zona y el reloj de su sede) y la sede, con el paciente en la clínica', () => {
    expect(reservedElsewhereMessage(held)).toBe(
      'Reservado en la cita de hoy a las 10:05 a. m. (Sede Norte), con el paciente en la clínica.',
    );
    expect(
      reservedElsewhereMessage({ ...held, timeZone: 'Europe/Berlin', locale: 'de-DE', hourCycle: 'h23' }),
    ).toBe('Reservado en la cita de hoy a las 16:05 (Sede Norte), con el paciente en la clínica.');
  });

  it('sede no permitida: texto genérico, sin hora ni sede (DX-089)', () => {
    const text = reservedElsewhereMessage(hidden);
    expect(text).toBe('Reservado en otra cita de hoy, con el paciente en la clínica.');
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/Sede/);
    expect(reservedNeedsFormat(hidden)).toBe(false);
  });

  it('reservedElsewhere for an allowed unconfigured location is not the in-clinic text', () => {
    const unconfigured = { ...held, locale: null, hourCycle: null };
    const text = reservedElsewhereMessage(unconfigured);
    expect(text).not.toBe(reservationCopy.heldInClinicHidden);
    expect(text).toBe('Reservado en la cita de hoy a las — (Sede Norte), con el paciente en la clínica.');
    expect(reservedNeedsFormat(unconfigured)).toBe(true);
    const future = { ...item, locale: null, hourCycle: null };
    expect(reservedElsewhereMessage(future)).toBe('Este tratamiento está reservado en la cita del — (Sede Norte).');
    expect(reservedNeedsFormat(future)).toBe(true);
    // El toast no tiene sitio para el aviso: lleva la pista en el texto.
    expect(reservedElsewhereToast(unconfigured)).toBe(
      'Reservado en la cita de hoy a las — (Sede Norte), con el paciente en la clínica. Falta el formato regional de esa sede: revísalo en Ajustes → Sedes.',
    );
    expect(reservedElsewhereToast(item)).toBe(reservedElsewhereMessage(item));
    expect(reservedElsewhereToast(hidden)).toBe(reservationCopy.heldInClinicHidden);
    // Un formato que el navegador no soporta tampoco se sustituye por otro.
    expect(reservedNeedsFormat({ ...item, locale: 'xx-INVALID-' })).toBe(true);
    // Formatear no decide la lógica: «Traer» sigue disponible (R11).
    expect(canClaimReserved(future)).toBe(true);
  });

  it('«Traer a esta cita» solo si la titular no es de hoy con el paciente en la clínica', () => {
    expect(canClaimReserved(item)).toBe(true);
    // Olvidada de un día anterior: la API dice heldInClinic false.
    expect(canClaimReserved({ ...item, start: '2026-10-20T14:00:00.000Z' })).toBe(true);
    expect(canClaimReserved(held)).toBe(false);
    expect(canClaimReserved(hidden)).toBe(false);
  });
});
