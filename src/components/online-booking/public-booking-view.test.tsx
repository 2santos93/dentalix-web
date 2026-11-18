import { render, screen, waitFor, within } from '@testing-library/react';
import { PublicBookingView } from './public-booking-view';
import {
  createPublicBooking,
  getPublicBookingConfig,
  listPublicSlots,
  requestBookingCode,
  verifyBookingCode,
  type PublicBookingConfig,
  type PublicBookingResult,
} from '../../lib/online-booking/online-booking-api';
import { ApiError } from '../../lib/api/client';
import { sedeToday } from '../../lib/locations/use-sede-time-zone';
import { addCivilDays } from '../../lib/time/wall-clock';
import { setupUser } from '../../lib/test/user';

// jest.mock no reescribe alias: rutas relativas (ver otros *.test.tsx).
jest.mock('../../lib/online-booking/online-booking-api', () => ({
  ...jest.requireActual('../../lib/online-booking/online-booking-api'),
  getPublicBookingConfig: jest.fn(),
  listPublicSlots: jest.fn(),
  createPublicBooking: jest.fn(),
  requestBookingCode: jest.fn(),
  verifyBookingCode: jest.fn(),
}));
// Los 4 s mínimos de rellenado los cuenta la API; aquí no se esperan.
jest.mock('../../lib/online-booking/booking-flow', () => ({
  ...jest.requireActual('../../lib/online-booking/booking-flow'),
  waitBeforeSubmit: () => 0,
}));
jest.mock('../../lib/api/client', () => ({
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));

const getConfig = jest.mocked(getPublicBookingConfig);
const slots = jest.mocked(listPublicSlots);
const book = jest.mocked(createPublicBooking);
const sendCode = jest.mocked(requestBookingCode);
const verify = jest.mocked(verifyBookingCode);

const TZ = 'America/Caracas';
const TOMORROW = addCivilDays(sedeToday(TZ), 1);
// 10:00 y 10:30 en Caracas (UTC−4).
const AT_10 = `${TOMORROW}T14:00:00.000Z`;
const AT_1030 = `${TOMORROW}T14:30:00.000Z`;

function config(overrides: Partial<PublicBookingConfig> = {}): PublicBookingConfig {
  return {
    clinicName: 'Clínica Ávila',
    newPatientMode: 'DIRECT',
    existingPatientMode: 'DIRECT',
    newPatientsAllowed: true,
    minLeadMinutesNew: 120,
    minLeadMinutesExisting: 120,
    maxAdvanceDays: 60,
    locations: [
      { id: 'loc-1', name: 'Sede Chacao', address: 'Av. Francisco de Miranda', timeZone: TZ, locale: 'es-VE', hourCycle: 'h23' },
    ],
    types: [
      { id: 't-1', name: 'Limpieza dental', durationNewMinutes: 45, durationExistingMinutes: 30, locationIds: ['loc-1'], providerIds: ['p-1', 'p-2'] },
    ],
    providers: [
      { id: 'p-1', name: 'Dra. María Rodríguez', locationIds: ['loc-1'] },
      { id: 'p-2', name: 'Dr. José Pérez', locationIds: ['loc-1'] },
    ],
    privacyPolicy: {
      id: 'pol-1',
      version: 2,
      policyText: 'La clínica trata tus datos para atenderte.',
      generalText: 'Acepto que la clínica trate mis datos para gestionar mi atención.',
    },
    formToken: 'form-token-1',
    ...overrides,
  };
}

function slotsPage(starts: string[]) {
  return {
    timeZone: TZ,
    durationMinutes: 45,
    truncated: false,
    slots: starts.map((start) => ({
      start,
      end: new Date(new Date(start).getTime() + 45 * 60_000).toISOString(),
      providerId: 'p-1',
    })),
  };
}

function result(status: 'BOOKED' | 'REQUESTED', start = AT_10): PublicBookingResult {
  return {
    status,
    start,
    end: new Date(new Date(start).getTime() + 45 * 60_000).toISOString(),
    timeZone: TZ,
    locale: 'es-VE',
    hourCycle: 'h23',
    locationName: 'Sede Chacao',
    providerName: 'Dra. María Rodríguez',
    appointmentTypeName: 'Limpieza dental',
    manageUrl: status === 'BOOKED' ? 'https://avila.dentalix.app/confirmar/abc' : null,
  };
}

type User = ReturnType<typeof setupUser>;

/** Paso 1 (tratamiento + primera visita) y paso 2 (cualquiera disponible). */
async function chooseService(user: User, kind: 'NEW' | 'EXISTING') {
  await user.click(await screen.findByRole('radio', { name: /Limpieza dental/ }));
  await user.click(screen.getByRole('radio', { name: kind === 'NEW' ? /Sí, es mi primera vez/ : /No, ya soy paciente/ }));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
  await user.click(await screen.findByRole('radio', { name: /Cualquiera disponible/ }));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
}

async function typeBirthDate(user: User) {
  const [day] = within(screen.getByRole('group', { name: 'Fecha de nacimiento' })).getAllByRole('spinbutton');
  await user.click(day);
  await user.keyboard('14051990');
}

async function fillNewPatient(user: User) {
  await user.type(screen.getByLabelText('Nombre'), 'Luisa');
  await user.type(screen.getByLabelText('Apellido'), 'Hernández');
  await typeBirthDate(user);
  await user.type(screen.getByLabelText('Email'), 'luisa.hernandez@example.com');
  await user.type(screen.getByLabelText('Teléfono'), '0412 555 1234');
  await user.click(screen.getByRole('checkbox', { name: /Acepto que la clínica trate mis datos/ }));
}

describe('PublicBookingView (/reservar, DX-016)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.scrollTo = jest.fn();
  });

  it('404: página amable «La reserva online no está disponible»', async () => {
    getConfig.mockRejectedValueOnce(new ApiError(404, 'La reserva online no está disponible en esta clínica.'));
    render(<PublicBookingView />);
    expect(await screen.findByRole('heading', { name: 'La reserva online no está disponible' })).toBeInTheDocument();
  });

  it('un fallo de carga ofrece reintentar y vuelve a pedir la configuración', async () => {
    const user = setupUser();
    getConfig.mockRejectedValueOnce(new ApiError(500, 'x')).mockResolvedValueOnce(config());
    render(<PublicBookingView />);
    await user.click(await screen.findByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('heading', { name: '¿Qué necesitas?' })).toBeInTheDocument();
    expect(getConfig).toHaveBeenCalledTimes(2);
  });

  it('paso 1 pide el tratamiento y la primera visita antes de seguir', async () => {
    const user = setupUser();
    getConfig.mockResolvedValueOnce(config());
    render(<PublicBookingView />);
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Elige el tratamiento.')).toBeInTheDocument();
    expect(screen.getByText('Dinos si es tu primera visita.')).toBeInTheDocument();
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument();
  });

  it('paciente NUEVO, reserva directa: horas en la zona de la sede, campo trampa y formToken, y «Tu cita está reservada»', async () => {
    const user = setupUser();
    getConfig.mockResolvedValueOnce(config());
    slots.mockResolvedValue(slotsPage([AT_10, AT_1030]));
    book.mockResolvedValueOnce(result('BOOKED'));
    render(<PublicBookingView />);
    await chooseService(user, 'NEW');

    // El foco va al título del paso.
    const title = await screen.findByRole('heading', { name: 'Elige día y hora' });
    await waitFor(() => expect(title).toHaveFocus());
    expect(slots).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: 'loc-1', appointmentTypeId: 't-1', providerId: null, patientKind: 'NEW', days: 7 }),
      null,
    );
    await user.click(await screen.findByRole('button', { name: /^Elegir las 10:00 del/ }));
    expect(await screen.findByRole('heading', { name: 'Tus datos' })).toBeInTheDocument();
    expect(within(screen.getByTestId('booking-summary')).getByText(/10:00–10:45/)).toBeInTheDocument();

    // El campo trampa no está al alcance (ni del lector de pantalla ni del tabulador).
    const trap = document.querySelector<HTMLInputElement>('input[name="website"]')!;
    expect(trap).toHaveAttribute('tabindex', '-1');
    expect(trap).toHaveAttribute('autocomplete', 'off');
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();

    await fillNewPatient(user);
    await user.click(screen.getByRole('button', { name: 'Reservar la cita' }));
    expect(await screen.findByRole('heading', { name: 'Tu cita está reservada' })).toBeInTheDocument();
    expect(book).toHaveBeenCalledWith(
      {
        locationId: 'loc-1',
        appointmentTypeId: 't-1',
        providerId: null,
        start: AT_10,
        newPatient: {
          firstName: 'Luisa',
          lastName: 'Hernández',
          birthDate: '1990-05-14',
          email: 'luisa.hernandez@example.com',
          phone: '0412 555 1234',
          consentPolicyVersionId: 'pol-1',
          consentAccepted: true,
        },
      },
      { formToken: 'form-token-1', website: '', challengeToken: null },
      null,
    );
    expect(screen.getByRole('link', { name: 'Ver mi cita' })).toHaveAttribute('href', 'https://avila.dentalix.app/confirmar/abc');
  });

  it('nuevo sin aceptar la política: no envía y lo dice junto a la casilla', async () => {
    const user = setupUser();
    getConfig.mockResolvedValueOnce(config());
    slots.mockResolvedValue(slotsPage([AT_10]));
    render(<PublicBookingView />);
    await chooseService(user, 'NEW');
    await user.click(await screen.findByRole('button', { name: /^Elegir las 10:00/ }));
    await user.click(await screen.findByRole('button', { name: 'Reservar la cita' }));
    expect(screen.getByText('Para reservar como paciente nuevo tienes que aceptar el tratamiento de tus datos.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu nombre.')).toBeInTheDocument();
    expect(book).not.toHaveBeenCalled();
  });

  it('409 hueco ocupado: vuelve a las horas (recargadas) con el aviso y reintenta con la sesión, sin reenviar los datos', async () => {
    const user = setupUser();
    getConfig.mockResolvedValueOnce(config({ newPatientMode: 'REQUEST' }));
    slots.mockResolvedValueOnce(slotsPage([AT_10, AT_1030])).mockResolvedValueOnce(slotsPage([AT_1030]));
    book
      .mockRejectedValueOnce(
        new ApiError(409, 'Ese hueco se acaba de ocupar. Elige otra hora: las demás siguen disponibles.', {
          code: 'ONLINE_SLOT_TAKEN',
          sessionToken: 'retry-token',
        }),
      )
      .mockResolvedValueOnce(result('REQUESTED', AT_1030));
    render(<PublicBookingView />);
    await chooseService(user, 'NEW');
    await user.click(await screen.findByRole('button', { name: /^Elegir las 10:00/ }));
    await fillNewPatient(user);
    await user.click(screen.getByRole('button', { name: 'Enviar la solicitud' }));

    expect(await screen.findByTestId('booking-slot-notice')).toHaveTextContent('Ese hueco se acaba de ocupar');
    await waitFor(() => expect(slots).toHaveBeenCalledTimes(2));
    expect(slots).toHaveBeenLastCalledWith(expect.anything(), 'retry-token');
    await user.click(await screen.findByRole('button', { name: /^Elegir las 10:30/ }));
    expect(await screen.findByText('Tus datos ya están guardados')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar la solicitud' }));

    expect(await screen.findByRole('heading', { name: 'Recibimos tu solicitud' })).toBeInTheDocument();
    expect(book).toHaveBeenLastCalledWith(
      expect.objectContaining({ start: AT_1030, newPatient: null }),
      expect.objectContaining({ formToken: 'form-token-1' }),
      'retry-token',
    );
    expect(screen.queryByRole('link', { name: 'Ver mi cita' })).not.toBeInTheDocument();
  });

  it('paciente EXISTENTE: datos → código neutro → verificar y reservar con la sesión', async () => {
    const user = setupUser();
    getConfig.mockResolvedValueOnce(config());
    slots.mockResolvedValue(slotsPage([AT_10]));
    sendCode.mockResolvedValueOnce({
      verificationId: 'ver-1',
      expiresAt: '2026-12-01T12:10:00.000Z',
      message:
        'Si los datos coinciden con una ficha de la clínica, te enviamos un código de 6 dígitos a ese email. Caduca en 10 minutos.',
    });
    verify.mockResolvedValueOnce({ sessionToken: 'session-1', expiresAt: '2026-12-01T12:30:00.000Z' });
    book.mockResolvedValueOnce(result('BOOKED'));
    render(<PublicBookingView />);
    await chooseService(user, 'EXISTING');
    await user.click(await screen.findByRole('button', { name: /^Elegir las 10:00/ }));

    await user.type(screen.getByLabelText('Nombre'), 'Carlos');
    await user.type(screen.getByLabelText('Apellido'), 'Márquez');
    await typeBirthDate(user);
    await user.type(screen.getByLabelText('Email'), 'carlos.marquez@example.com');
    await user.click(screen.getByRole('button', { name: 'Enviarme el código' }));

    expect(await screen.findByText(/Si los datos coinciden con una ficha/)).toBeInTheDocument();
    expect(sendCode).toHaveBeenCalledWith(
      { firstName: 'Carlos', lastName: 'Márquez', birthDate: '1990-05-14', email: 'carlos.marquez@example.com' },
      { formToken: 'form-token-1', website: '', challengeToken: null },
    );
    const code = screen.getByLabelText('Código de 6 cifras');
    await waitFor(() => expect(code).toHaveFocus());
    await user.type(code, '123 456');
    await user.click(screen.getByRole('button', { name: 'Verificar y reservar' }));

    expect(await screen.findByRole('heading', { name: 'Tu cita está reservada' })).toBeInTheDocument();
    expect(verify).toHaveBeenCalledWith('ver-1', '123456');
    expect(book).toHaveBeenCalledWith(expect.objectContaining({ newPatient: null }), expect.anything(), 'session-1');
  });

  it('código incorrecto: el mensaje uniforme de la API junto al campo', async () => {
    const user = setupUser();
    getConfig.mockResolvedValueOnce(config());
    slots.mockResolvedValue(slotsPage([AT_10]));
    sendCode.mockResolvedValueOnce({ verificationId: 'ver-1', expiresAt: '2026-12-01T12:10:00.000Z', message: 'Te enviamos un código.' });
    verify.mockRejectedValueOnce(new ApiError(400, 'El código no es correcto o caducó. Revísalo o pide uno nuevo.'));
    render(<PublicBookingView />);
    await chooseService(user, 'EXISTING');
    await user.click(await screen.findByRole('button', { name: /^Elegir las 10:00/ }));
    await user.type(screen.getByLabelText('Nombre'), 'Carlos');
    await user.type(screen.getByLabelText('Apellido'), 'Márquez');
    await typeBirthDate(user);
    await user.type(screen.getByLabelText('Email'), 'carlos.marquez@example.com');
    await user.click(screen.getByRole('button', { name: 'Enviarme el código' }));
    await user.type(await screen.findByLabelText('Código de 6 cifras'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verificar y reservar' }));
    expect(await screen.findByText('El código no es correcto o caducó. Revísalo o pide uno nuevo.')).toBeInTheDocument();
    expect(book).not.toHaveBeenCalled();
  });

  it('sin huecos: lo dice y ofrece ver días siguientes', async () => {
    const user = setupUser();
    getConfig.mockResolvedValueOnce(config());
    slots.mockResolvedValue(slotsPage([]));
    render(<PublicBookingView />);
    await chooseService(user, 'NEW');
    expect(await screen.findByText('No hay horas libres en estos días')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver días siguientes' }));
    await waitFor(() =>
      expect(slots).toHaveBeenLastCalledWith(expect.objectContaining({ from: addCivilDays(sedeToday(TZ), 7) }), null),
    );
  });

  it('nuevos sin política publicada: explica que llame a la clínica', async () => {
    const user = setupUser();
    getConfig.mockResolvedValueOnce(config({ newPatientsAllowed: false, privacyPolicy: null }));
    slots.mockResolvedValue(slotsPage([AT_10]));
    render(<PublicBookingView />);
    await chooseService(user, 'NEW');
    await user.click(await screen.findByRole('button', { name: /^Elegir las 10:00/ }));
    expect(await screen.findByRole('heading', { name: 'Llama a la clínica para tu primera cita' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reservar la cita' })).not.toBeInTheDocument();
  });
});
