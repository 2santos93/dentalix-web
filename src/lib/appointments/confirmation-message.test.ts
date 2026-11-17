import {
  CONFIRMATION_MESSAGE_MAX,
  confirmationIndicator,
  confirmationMessage,
  confirmationMessageLanguage,
  longAppointmentDay,
  whatsAppUrl,
} from './confirmation-message';
import type { Appointment } from './appointments-api';
import { locationClock } from '@/lib/locations/sede-clock';
import { clinicLocation } from '@/lib/test/locations';
import { PUBLIC_REGIONAL_VE } from '@/lib/test/document-regional';

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
        locationAddress: 'Av. Libertador 100',
        wantsEarlier: false,
        earlierWindow: null,
        earlierAllowed: true,
        ...PUBLIC_REGIONAL_VE,
      },
      clock: CLOCK,
    });
    expect(text).toBe(
      'Hola Ana, te recordamos tu cita del martes, 20 de octubre a las 10:00 a. m. con Dra. Pérez en Sede Norte (Av. Libertador 100). ' +
        'Confírmala, cancélala o pide que te llamemos aquí: https://demo.dentalix.app/confirmar/tok',
    );
  });

  it('DX-290: con el enlace de anamnesis, lo añade al final sin nada clínico', () => {
    const text = confirmationMessage({
      url: 'https://demo.dentalix.app/confirmar/tok',
      anamnesisUrl: 'https://demo.dentalix.app/anamnesis/anam',
      appointment: {
        patientFirstName: 'Ana',
        start: '2026-10-20T14:00:00.000Z',
        end: '2026-10-20T14:30:00.000Z',
        providerName: null,
        locationName: 'Sede Norte',
        locationAddress: null,
        wantsEarlier: false,
        earlierWindow: null,
        earlierAllowed: true,
        ...PUBLIC_REGIONAL_VE,
      },
      clock: CLOCK,
    });
    expect(text.endsWith(
      'aquí: https://demo.dentalix.app/confirmar/tok Antes de la cita, responde el cuestionario de salud: https://demo.dentalix.app/anamnesis/anam',
    )).toBe(true);
  });

  it('DX-290: con un enlace vivo de antes, solo lo recuerda', () => {
    const text = confirmationMessage({
      url: 'u',
      anamnesisPending: true,
      appointment: {
        patientFirstName: null,
        start: '2026-10-20T14:00:00.000Z',
        end: '2026-10-20T14:30:00.000Z',
        providerName: null,
        locationName: 'Sede Norte',
        locationAddress: null,
        wantsEarlier: false,
        earlierWindow: null,
        earlierAllowed: true,
        ...PUBLIC_REGIONAL_VE,
      },
      clock: CLOCK,
    });
    expect(text.endsWith('aquí: u Si aún no completaste el cuestionario de salud, usa el enlace que te enviamos.')).toBe(true);
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
        wantsEarlier: false,
        earlierWindow: null,
        earlierAllowed: true,
        ...PUBLIC_REGIONAL_VE,
      },
      clock: CLOCK,
    });
    expect(text).toBe(
      'Hola, te recordamos tu cita del martes, 20 de octubre a las 10:00 a. m. en Sede principal. ' +
        'Confírmala, cancélala o pide que te llamemos aquí: u',
    );
  });
});

describe('confirmationMessage — DX-564 idioma e indicaciones previas', () => {
  const APT = {
    patientFirstName: 'Ana',
    start: '2026-10-20T14:00:00.000Z',
    end: '2026-10-20T14:30:00.000Z',
    providerName: 'Dra. Pérez',
    locationName: 'Sede Norte',
    locationAddress: null,
    wantsEarlier: false,
    earlierWindow: null,
    earlierAllowed: true,
    ...PUBLIC_REGIONAL_VE,
  };
  const URL_ = 'https://demo.dentalix.app/confirmar/tok';
  const VARIANTS = [
    { language: 'es', text: 'Ven en ayunas.\nTrae tus radiografías.' },
    { language: 'en', text: 'Come fasting.' },
  ];

  it('sin indicaciones, el mensaje en español no cambia', () => {
    const before = confirmationMessage({ url: URL_, appointment: APT, clock: CLOCK });
    expect(confirmationMessage({ url: URL_, appointment: APT, clock: CLOCK, preVisitInstructions: [] })).toBe(before);
    expect(before).not.toMatch(/Antes de tu cita/);
  });

  it('paciente sin preferencia: español y «Antes de tu cita:» con los saltos de línea', () => {
    const text = confirmationMessage({ url: URL_, appointment: APT, clock: CLOCK, preVisitInstructions: VARIANTS });
    expect(text).toMatch(/^Hola Ana, te recordamos tu cita/);
    expect(text.endsWith(`${URL_}\n\nAntes de tu cita: Ven en ayunas.\nTrae tus radiografías.`)).toBe(true);
  });

  it('paciente en inglés: el mensaje y las indicaciones en inglés', () => {
    const text = confirmationMessage({
      url: URL_,
      appointment: APT,
      clock: CLOCK,
      patientLanguage: 'en',
      preVisitInstructions: VARIANTS,
    });
    expect(text).toMatch(/^Hello Ana, this is a reminder of your appointment on /);
    expect(text).toContain(' with Dra. Pérez at Sede Norte. Confirm it, cancel it or ask us to call you here: ');
    expect(text.endsWith('\n\nBefore your appointment: Come fasting.')).toBe(true);
  });

  it('en-GB cae a la variante base «en»; paciente en inglés con texto solo en español recibe el español', () => {
    const gb = confirmationMessage({
      url: URL_, appointment: APT, clock: CLOCK, patientLanguage: 'en-GB', preVisitInstructions: VARIANTS,
    });
    expect(gb.endsWith('Before your appointment: Come fasting.')).toBe(true);
    const onlyEs = confirmationMessage({
      url: URL_, appointment: APT, clock: CLOCK, patientLanguage: 'en', preVisitInstructions: [VARIANTS[0]],
    });
    expect(onlyEs).toMatch(/^Hello Ana/);
    expect(onlyEs).toContain('Before your appointment: Ven en ayunas.');
  });

  it('idioma sin catálogo (catalán): mensaje en español; su variante si la hay', () => {
    const text = confirmationMessage({
      url: URL_, appointment: APT, clock: CLOCK, patientLanguage: 'ca',
      preVisitInstructions: [...VARIANTS, { language: 'ca', text: 'Vine en dejú.' }],
    });
    expect(text).toMatch(/^Hola Ana, te recordamos/);
    expect(text.endsWith('Antes de tu cita: Vine en dejú.')).toBe(true);
  });

  it('sin variante en su idioma ni en español: no se añade nada', () => {
    const text = confirmationMessage({
      url: URL_, appointment: APT, clock: CLOCK, patientLanguage: 'fr',
      preVisitInstructions: [{ language: 'en', text: 'Come fasting.' }],
    });
    expect(text).not.toMatch(/Antes de tu cita|Before your appointment/);
  });

  it(`el mensaje entero no pasa de ${CONFIRMATION_MESSAGE_MAX} caracteres: recorta las indicaciones con «…»`, () => {
    const long = 'á'.repeat(600);
    const anamnesisUrl = `https://demo.dentalix.app/anamnesis/${'x'.repeat(700)}`;
    const text = confirmationMessage({
      url: URL_, appointment: APT, clock: CLOCK, anamnesisUrl,
      preVisitInstructions: [{ language: 'es', text: long }],
    });
    expect([...text].length).toBe(CONFIRMATION_MESSAGE_MAX);
    expect(text.endsWith('…')).toBe(true);
    expect(text).toContain(anamnesisUrl);
    // Sin pasarse, el texto va entero.
    const short = confirmationMessage({ url: URL_, appointment: APT, clock: CLOCK, preVisitInstructions: [{ language: 'es', text: long }] });
    expect(short.endsWith(long)).toBe(true);
  });

  it('confirmationMessageLanguage: exacta o base con catálogo; si no, español', () => {
    expect(confirmationMessageLanguage(null)).toBe('es');
    expect(confirmationMessageLanguage('en')).toBe('en');
    expect(confirmationMessageLanguage('en-US')).toBe('en');
    expect(confirmationMessageLanguage('es-419')).toBe('es');
    expect(confirmationMessageLanguage('ca')).toBe('es');
  });
});

describe('longAppointmentDay', () => {
  it('is the day in the sede zone: 02:00 UTC is still the previous day in Caracas', () => {
    expect(longAppointmentDay('2026-10-21T02:00:00.000Z', 'America/Caracas')).toBe('martes, 20 de octubre');
  });
});

describe('whatsAppUrl', () => {
  it('wa.me con el número E.164 sin + y el texto codificado', () => {
    expect(whatsAppUrl('584145550101', 'Hola Ana & co: https://x/y?z=1')).toBe(
      'https://wa.me/584145550101?text=Hola%20Ana%20%26%20co%3A%20https%3A%2F%2Fx%2Fy%3Fz%3D1',
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
