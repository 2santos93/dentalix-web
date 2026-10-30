import {
  confirmationIndicator,
  confirmationMessage,
  longAppointmentDay,
  whatsAppUrl,
} from './confirmation-message';
import type { Appointment } from './appointments-api';
import { locationClock } from '@/lib/locations/sede-clock';
import { clinicLocation } from '@/lib/test/locations';

// Sede en Caracas (UTC−4) y 12 h; Jest corre con TZ=UTC.
const CLOCK = locationClock(clinicLocation({ timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' }))!;

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'a1',
    tenantId: 't1',
    patientId: 'p1',
    patientFirstName: 'Ana',
    patientLastName: 'Pérez',
    providerId: 'u1',
    start: '2026-10-20T14:00:00.000Z',
    end: '2026-10-20T14:30:00.000Z',
    status: 'SCHEDULED',
    reason: null,
    notes: null,
    createdById: null,
    locationId: 'loc-1',
    appointmentTypeId: null,
    appointmentType: null,
    confirmationSentAt: null,
    callbackRequestedAt: null,
    wantsEarlier: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('confirmationMessage', () => {
  it('arma el mensaje en español con fecha, hora, profesional, sede, dirección y enlace', () => {
    const text = confirmationMessage({
      url: 'https://demo.dentalix.app/confirmar/tok',
      appointment: {
        patientFirstName: 'Ana',
        start: '2026-10-20T14:00:00.000Z',
        end: '2026-10-20T14:30:00.000Z',
        providerName: 'Dra. Pérez',
        locationName: 'Sede Norte',
        locationAddress: 'Calle 100 # 15-20',
      },
      clock: CLOCK,
    });
    expect(text).toBe(
      'Hola Ana, te recordamos tu cita del martes, 20 de octubre a las 10:00 a. m. con Dra. Pérez en Sede Norte (Calle 100 # 15-20). ' +
        'Confírmala, cancélala o pide que te llamemos aquí: https://demo.dentalix.app/confirmar/tok',
    );
  });

  it('omite lo que falte sin dejar huecos', () => {
    const text = confirmationMessage({
      url: 'u',
      appointment: {
        patientFirstName: null,
        start: '2026-10-20T14:00:00.000Z',
        end: '2026-10-20T14:30:00.000Z',
        providerName: null,
        locationName: 'Sede principal',
        locationAddress: null,
      },
      clock: CLOCK,
    });
    expect(text).toBe(
      'Hola, te recordamos tu cita del martes, 20 de octubre a las 10:00 a. m. en Sede principal. ' +
        'Confírmala, cancélala o pide que te llamemos aquí: u',
    );
  });
});

describe('longAppointmentDay', () => {
  it('is the day in the sede zone: 02:00 UTC is still the previous day in Caracas', () => {
    expect(longAppointmentDay('2026-10-21T02:00:00.000Z', 'America/Caracas')).toBe('martes, 20 de octubre');
  });
});

describe('whatsAppUrl', () => {
  it('wa.me con el número E.164 sin + y el texto codificado', () => {
    expect(whatsAppUrl('573105550101', 'Hola Ana & co: https://x/y?z=1')).toBe(
      'https://wa.me/573105550101?text=Hola%20Ana%20%26%20co%3A%20https%3A%2F%2Fx%2Fy%3Fz%3D1',
    );
  });
});

describe('confirmationIndicator', () => {
  it('"pide llamada" mientras la cita siga agendada', () => {
    expect(
      confirmationIndicator(
        appointment({ callbackRequestedAt: '2026-10-02T00:00:00.000Z', confirmationSentAt: '2026-10-01T00:00:00.000Z' }),
      ),
    ).toBe('callback');
  });

  it('"confirmación pendiente" si se envió y no hubo respuesta', () => {
    expect(
      confirmationIndicator(appointment({ confirmationSentAt: '2026-10-01T00:00:00.000Z' })),
    ).toBe('pending');
  });

  it('nada si no se envió, o si la cita ya no está agendada (el estado lo dice todo)', () => {
    expect(confirmationIndicator(appointment())).toBeNull();
    expect(
      confirmationIndicator(
        appointment({ status: 'CONFIRMED', confirmationSentAt: '2026-10-01T00:00:00.000Z' }),
      ),
    ).toBeNull();
    expect(
      confirmationIndicator(
        appointment({ status: 'CANCELLED', callbackRequestedAt: '2026-10-01T00:00:00.000Z' }),
      ),
    ).toBeNull();
  });
});
