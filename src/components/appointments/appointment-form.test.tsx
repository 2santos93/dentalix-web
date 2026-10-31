import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentForm } from './appointment-form';
import { createAppointment } from '@/lib/appointments/appointments-api';
import { listStaff } from '@/lib/appointments/staff-api';
import { createPatient, listPatients } from '@/lib/patients/patients-api';
import { getLocationSchedule } from '@/lib/locations/schedule-api';
import { listAppointmentTypes } from '@/lib/appointments/appointment-types-api';
import { getProviderScheduleSettings, getRoster } from '@/lib/locations/provider-schedule-api';
import { getPatientMedicalAlerts } from '@/lib/clinical/medical-alerts';
import { listLocations } from '@/lib/locations/locations-api';
import { caracasSede, utcSede } from '@/lib/test/sede-clock';
import { wallInstant } from '@/lib/time/wall-clock';
import { ApiError } from '@/lib/api/api-error';
import { dateGroup, readTime, typeDate, typeTime } from './date-segments-for-tests';

// Los campos de fecha y hora por segmentos (react-aria) hacen el formulario más
// pesado en jsdom: con la máquina cargada, 1 s de espera de `findBy` se quedaba corto
// (mismo arreglo que perio-exam-editor). No cambia ninguna aserción.
configure({ asyncUtilTimeout: 5_000 });

// PatientForm (rendered inside the "Crear paciente" dialog) calls
// useRouter() — mock it the same way patient-form.test.tsx does, since it's
// unused here (this form always passes onCreated, so the router.push
// fallback path never runs).
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching tooth-record-panel.test.tsx's convention.
jest.mock('../../lib/appointments/appointments-api', () => ({
  createAppointment: jest.fn(),
}));
jest.mock('../../lib/appointments/staff-api', () => ({
  listStaff: jest.fn(),
}));
// El formulario lee el horario de la sede. Se mockea el módulo entero pero se
// mantienen los helpers REALES (fitsBusinessHoursLocal/describeDay) para que los
// tests ejerciten la lógica de verdad, no un doble de ella.
// DX-378: la fecha y las horas van en el reloj de la sede (aquí, UTC y 24 h).
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede()]),
}));
jest.mock('../../lib/locations/schedule-api', () => ({
  ...jest.requireActual('../../lib/locations/schedule-api'),
  getLocationSchedule: jest.fn(),
}));
jest.mock('../../lib/patients/patients-api', () => ({
  listPatients: jest.fn(),
  createPatient: jest.fn(),
}));
jest.mock('../../lib/patients/document-type-names-api', () => ({
  getDocumentTypeNames: jest.fn().mockRejectedValue(new Error('sin nombres: genéricos')),
}));
jest.mock('../../lib/appointments/appointment-types-api', () => ({
  listAppointmentTypes: jest.fn(),
}));
// DX-233: horario del profesional en la sede activa (aviso antes de enviar).
jest.mock('../../lib/locations/provider-schedule-api', () => ({
  ...jest.requireActual('../../lib/locations/provider-schedule-api'),
  getRoster: jest.fn(),
  getProviderScheduleSettings: jest.fn(),
}));

// DX-247: las banderas médicas del paciente elegido.
jest.mock('../../lib/clinical/medical-alerts', () => ({
  ...jest.requireActual('../../lib/clinical/medical-alerts'),
  getPatientMedicalAlerts: jest.fn(),
}));
const mockedGetMedicalAlerts = getPatientMedicalAlerts as jest.MockedFunction<
  typeof getPatientMedicalAlerts
>;

const mockedCreateAppointment = createAppointment as jest.MockedFunction<typeof createAppointment>;
const mockedListStaff = listStaff as jest.MockedFunction<typeof listStaff>;
const mockedListPatients = listPatients as jest.MockedFunction<typeof listPatients>;
const mockedCreatePatient = createPatient as jest.MockedFunction<typeof createPatient>;
const mockedGetSchedule = getLocationSchedule as jest.MockedFunction<typeof getLocationSchedule>;
const mockedListTypes = listAppointmentTypes as jest.MockedFunction<typeof listAppointmentTypes>;

const endodoncia = {
  id: 'type-endo',
  tenantId: 't1',
  name: 'Endodoncia',
  durationMinutes: 90,
  color: '#7C3AED',
  active: true,
  isUrgent: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const staff = [
  { userId: 'staff-1', fullName: 'Dra. Ana Ríos', role: 'DENTIST' as const, locationIds: null },
  { userId: 'staff-2', fullName: 'Dr. Luis Gómez', role: 'DENTIST' as const, locationIds: null },
];

const patientsPage = {
  items: [
    {
      id: 'pat-1',
      tenantId: 't1',
      firstName: 'María',
      lastName: 'López',
      docType: 'NATIONAL_ID' as const,
      docTypeLabel: null,
      docTypeName: 'ID local',
      docNumber: '123',
      birthDate: null,
      sex: 'F' as const,
      phone: null,
      email: null,
      address: null,
      notes: null,
      createdById: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'pat-2',
      tenantId: 't1',
      firstName: 'Carlos',
      lastName: 'Pérez',
      docType: 'NATIONAL_ID' as const,
      docNumber: '456',
      birthDate: null,
      sex: 'M' as const,
      phone: null,
      email: null,
      address: null,
      notes: null,
      createdById: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 100,
};

const newPatient = {
  id: 'pat-new',
  tenantId: 't1',
  firstName: 'Sofía',
  lastName: 'Ramírez',
  docType: 'NATIONAL_ID' as const,
  docNumber: null,
  birthDate: null,
  sex: 'UNSPECIFIED' as const,
  phone: null,
  email: null,
  address: null,
  notes: null,
  createdById: null,
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z',
};

const createdAppointment = {
  id: 'apt-1',
  tenantId: 't1',
  patientId: 'pat-1',
  patientFirstName: null,
  patientLastName: null,
  providerId: 'staff-1',
  start: '2026-07-23T09:00:00.000Z',
  end: '2026-07-23T09:30:00.000Z',
  status: 'SCHEDULED' as const,
  reason: 'Control',
  notes: null,
  createdById: 'u1',
  locationId: 'loc-1',
  appointmentTypeId: null,
  appointmentType: null,
  confirmationSentAt: null,
  callbackRequestedAt: null,
  wantsEarlier: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

/**
 * A local `YYYY-MM-DD` always in the FUTURE (tomorrow): the form now rejects a
 * start instant in the past, so a hardcoded date would make these specs fail as
 * soon as it goes by. Times below (09:00/09:30) are read as LOCAL by the form's
 * `toIsoInstant`, so pairing them with tomorrow is safely ahead of `now`.
 */
const FUTURE_DATE = (() => {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
})();

async function renderFormAndWaitForLoad() {
  render(<AppointmentForm token="tok" onCreated={jest.fn()} />);
  // Provider select is a native <select> populated from GET /staff.
  await screen.findByRole('option', { name: /dra\. ana ríos/i });
  // The initial (empty-query) patient load settles.
  await waitFor(() => expect(mockedListPatients).toHaveBeenCalled());
  // DX-378: la fecha se habilita con el reloj de la sede.
  await waitFor(() =>
    expect(dateGroup(/^fecha$/i).querySelector('[role="spinbutton"]')).not.toHaveAttribute('aria-disabled', 'true'),
  );
}

// Picks María López (pat-1) by typing her exact document number, which
// auto-selects her — the primary "I know the document" flow. Waits for the
// chosen-patient chip (its "Cambiar" button) so the debounced auto-select has
// actually landed before the caller moves on.
async function selectMariaByDoc(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^paciente$/i), '123');
  await screen.findByRole('button', { name: /cambiar/i });
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await selectMariaByDoc(user);
  await user.selectOptions(screen.getByLabelText(/profesional/i), 'staff-1');
  await typeDate(user, /^fecha$/i, FUTURE_DATE);
  await typeTime(user, /hora de inicio/i, '09:00');
  await typeTime(user, /hora de fin/i, '09:30');
}

// Solo se falsea `Date`: los temporizadores siguen reales para que RTL y
// userEvent esperen como siempre.
const fakeDateOnly = (now: Date) =>
  jest.useFakeTimers({
    now,
    doNotFake: [
      'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
      'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
      'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    ],
  });

describe('AppointmentForm', () => {
  beforeEach(() => {
    mockedCreateAppointment.mockReset();
    mockedListStaff.mockReset();
    mockedListPatients.mockReset();
    mockedCreatePatient.mockReset();
    mockedListStaff.mockResolvedValue(staff);
    mockedListPatients.mockResolvedValue(patientsPage);
    mockedGetSchedule.mockReset();
    // Sede sin horario configurado => sin restricción (igual que el backend).
    mockedGetSchedule.mockResolvedValue(null);
    mockedListTypes.mockReset();
    mockedListTypes.mockResolvedValue([endodoncia]);
    (getRoster as jest.Mock).mockReset();
    (getProviderScheduleSettings as jest.Mock).mockReset();
    (getProviderScheduleSettings as jest.Mock).mockResolvedValue({ strictProviderSchedule: false });
    mockedGetMedicalAlerts.mockReset();
    mockedGetMedicalAlerts.mockResolvedValue({
      hasCriticalAlert: false,
      requiresPremedication: false,
      anamnesisStatus: 'CURRENT',
      alerts: [],
      anamnesisReviewedAt: '2026-01-01T00:00:00.000Z',
      validityMonths: 12,
      anamnesisExpiresOn: '2027-01-01',
  today: '2026-10-20',
  timeZone: 'America/Bogota',
      lastReview: null,
    });
  });

  // DX-121: el tipo fija la duración.
  describe('tipo de cita', () => {
    it('preselecciona paciente, motivo e ítems de visita y guarda sus vínculos (DX-256)', async()=>{
    mockedCreateAppointment.mockResolvedValue(createdAppointment);
    render(<AppointmentForm token="tok" onCreated={jest.fn()} defaultPatient={patientsPage.items[0]} defaultProviderId="staff-1" defaultReason="Visita 2 · Corona" defaultDate={FUTURE_DATE} defaultStartTime="09:00" defaultEndTime="09:30" planItemIds={['plan-item-1','plan-item-2']}/>);
    expect(screen.getByDisplayValue('Visita 2 · Corona')).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Cambiar'})).not.toBeInTheDocument();
    const user=userEvent.setup();
    await user.click(await screen.findByRole('button',{name:'Agendar cita'}));
    await waitFor(()=>expect(mockedCreateAppointment).toHaveBeenCalledWith('tok',expect.objectContaining({patientId:'pat-1',reason:'Visita 2 · Corona',planItemIds:['plan-item-1','plan-item-2']})));
  });
  it('elegir «Endodoncia 90 min» fija la hora de fin y se envía el tipo', async () => {
      const user = userEvent.setup();
      mockedCreateAppointment.mockResolvedValue(createdAppointment);
      await renderFormAndWaitForLoad();
      await selectMariaByDoc(user);
      await user.selectOptions(screen.getByLabelText(/profesional/i), 'staff-1');
      await typeDate(user, /^fecha$/i, FUTURE_DATE);
      await typeTime(user, /hora de inicio/i, '09:00');
      await screen.findByRole('option', { name: 'Endodoncia · 90 min' });
      await user.selectOptions(screen.getByLabelText(/tipo de cita/i), 'type-endo');

      expect(readTime(/hora de fin/i)).toBe('10:30');
      // Cambiar la hora de inicio arrastra la de fin con la duración del tipo.
      await typeTime(user, /hora de inicio/i, '11:00');
      expect(readTime(/hora de fin/i)).toBe('12:30');

      await user.click(screen.getByRole('button', { name: /agendar/i }));
      await waitFor(() => expect(mockedCreateAppointment).toHaveBeenCalledTimes(1));
      expect(mockedCreateAppointment.mock.calls[0][1]).toMatchObject({
        appointmentTypeId: 'type-endo',
        start: new Date(`${FUTURE_DATE}T11:00:00`).toISOString(),
        end: new Date(`${FUTURE_DATE}T12:30:00`).toISOString(),
      });
    });

    it('solo ofrece los tipos activos que devuelve la API', async () => {
      await renderFormAndWaitForLoad();
      await screen.findByRole('option', { name: 'Endodoncia · 90 min' });
      expect(mockedListTypes).toHaveBeenCalledWith('tok');
    });

    it('prefija el profesional desde la columna', async () => {
      render(<AppointmentForm token="tok" onCreated={jest.fn()} defaultProviderId="staff-2" />);
      await screen.findByRole('option', { name: /dr\. luis gómez/i });
      expect(screen.getByLabelText(/profesional/i)).toHaveValue('staff-2');
    });
  });

  it('renders patient, provider, date/time and reason fields with accessible labels', async () => {
    render(<AppointmentForm token="tok" onCreated={jest.fn()} />);
    expect(screen.getByLabelText(/^paciente$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/profesional/i)).toBeInTheDocument();
    expect(dateGroup(/^fecha$/i)).toBeInTheDocument();
    expect(dateGroup(/hora de inicio/i)).toBeInTheDocument();
    expect(dateGroup(/hora de fin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/motivo/i)).toBeInTheDocument();
    await waitFor(() => expect(mockedListStaff).toHaveBeenCalled());
  });

  it('shows matching patients as a clickable list once you search, and the provider select from GET /staff', async () => {
    const user = userEvent.setup();
    await renderFormAndWaitForLoad();
    // No search yet: results are hidden behind a hint, not shown as a list.
    expect(screen.getByText(/escribe el documento o el nombre/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^paciente$/i), 'pérez');
    expect(await screen.findByRole('option', { name: /carlos pérez/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /maría lópez/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /dr\. luis gómez/i })).toBeInTheDocument();
  });

  it('loads the initial patient options from the server with a bounded pageSize (no query yet)', async () => {
    await renderFormAndWaitForLoad();
    expect(mockedListPatients).toHaveBeenCalledWith('tok', { pageSize: 20 });
  });

  it('debounces the server-side patient search, calling listPatients with the typed query and pageSize 20', async () => {
    const user = userEvent.setup();
    await renderFormAndWaitForLoad();
    mockedListPatients.mockClear();
    mockedListPatients.mockResolvedValue({
      ...patientsPage,
      items: [patientsPage.items[1]],
    });

    await user.type(screen.getByLabelText(/^paciente$/i), 'carlos');

    // Debounced — the call doesn't happen synchronously on each keystroke.
    expect(mockedListPatients).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(mockedListPatients).toHaveBeenCalledWith('tok', { query: 'carlos', pageSize: 20 }),
    );
    expect(await screen.findByRole('option', { name: /carlos pérez/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /maría lópez/i })).not.toBeInTheDocument();
  });

  it('auto-selects the patient when the typed query exactly matches one document number', async () => {
    const user = userEvent.setup();
    await renderFormAndWaitForLoad();

    await user.type(screen.getByLabelText(/^paciente$/i), '123');

    // The chosen-patient chip shows who's booked — no list to pick from.
    expect(await screen.findByRole('button', { name: /cambiar/i })).toBeInTheDocument();
    expect(screen.getByText('María López')).toBeInTheDocument();
    expect(screen.getByText('ID local 123')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    // The search box collapses once a patient is chosen.
    expect(screen.queryByLabelText(/^paciente$/i)).not.toBeInTheDocument();
  });

  it('prints the docTypeName of the DTO, or the generic name when it is missing', async () => {
    const user = userEvent.setup();
    await renderFormAndWaitForLoad();
    // pat-2 llega sin `docTypeName` (API anterior en el hueco): el genérico.
    await user.type(screen.getByLabelText(/^paciente$/i), '456');
    expect(await screen.findByRole('button', { name: /cambiar/i })).toBeInTheDocument();
    expect(screen.getByText('Documento nacional 456')).toBeInTheDocument();
    expect(screen.queryByText(/NATIONAL_ID/)).not.toBeInTheDocument();
  });

  it('DX-247: al elegir un paciente con profilaxis antibiótica avisa «Requiere premedicación» antes de agendar', async () => {
    mockedGetMedicalAlerts.mockResolvedValue({
      hasCriticalAlert: true,
      requiresPremedication: true,
      anamnesisStatus: 'CURRENT',
      alerts: ['profilaxisAntibiotica'],
      anamnesisReviewedAt: '2026-01-01T00:00:00.000Z',
      validityMonths: 12,
      anamnesisExpiresOn: '2027-01-01',
  today: '2026-10-20',
  timeZone: 'America/Bogota',
      lastReview: null,
    });
    const user = userEvent.setup();
    await renderFormAndWaitForLoad();
    await selectMariaByDoc(user);
    expect(await screen.findByTestId('premedication-notice')).toHaveTextContent(
      'Requiere premedicación',
    );
    expect(mockedGetMedicalAlerts).toHaveBeenCalledWith('tok', 'pat-1');
  });

  it('DX-247: un paciente sin anamnesis sale «Sin anamnesis», no «sin alertas»', async () => {
    mockedGetMedicalAlerts.mockResolvedValue({
      hasCriticalAlert: false,
      requiresPremedication: false,
      anamnesisStatus: 'MISSING',
      alerts: [],
      anamnesisReviewedAt: null,
      validityMonths: 12,
      anamnesisExpiresOn: null,
      today: '2026-10-20',
      timeZone: 'America/Bogota',
      lastReview: null,
    });
    const user = userEvent.setup();
    await renderFormAndWaitForLoad();
    await selectMariaByDoc(user);
    expect(await screen.findByText('Sin anamnesis')).toBeInTheDocument();
    expect(screen.queryByTestId('premedication-notice')).not.toBeInTheDocument();
  });

  it('lets you swap the chosen patient with "Cambiar", restoring the search box', async () => {
    const user = userEvent.setup();
    await renderFormAndWaitForLoad();
    await selectMariaByDoc(user);

    await user.click(screen.getByRole('button', { name: /cambiar/i }));

    // Back to searching, with the query cleared so it doesn't re-select.
    const search = await screen.findByLabelText(/^paciente$/i);
    expect(search).toHaveValue('');
    expect(screen.queryByText('María López')).not.toBeInTheDocument();
  });

  it('blocks submit and shows a validation message when end is not after start', async () => {
    const user = userEvent.setup();
    await renderFormAndWaitForLoad();
    await selectMariaByDoc(user);
    await user.selectOptions(screen.getByLabelText(/profesional/i), 'staff-1');
    await typeDate(user, /^fecha$/i, FUTURE_DATE);
    await typeTime(user, /hora de inicio/i, '09:30');
    await typeTime(user, /hora de fin/i, '09:00');

    await user.click(screen.getByRole('button', { name: /agendar|guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/fin.*posterior.*inicio/i);
    expect(mockedCreateAppointment).not.toHaveBeenCalled();
  });


  describe('horario de atención de la sede', () => {
    /** Horario del día de FUTURE_DATE: 09:00–13:00, para probar dentro y fuera. */
    function hoursForFutureDate() {
      const weekday = new Date(`${FUTURE_DATE}T00:00:00`).getDay();
      return {
        timezone: 'America/Bogota',
        ranges: [{ weekday, startMinute: 9 * 60, endMinute: 13 * 60 }],
      };
    }

    it('muestra el horario del día como pista al elegir la fecha', async () => {
      mockedGetSchedule.mockResolvedValue(hoursForFutureDate());
      const user = userEvent.setup();
      await renderFormAndWaitForLoad();

      await typeDate(user, /^fecha$/i, FUTURE_DATE);

      expect(await screen.findByText(/horario de ese día: 09:00–13:00/i)).toBeInTheDocument();
    });

    it('bloquea el submit fuera del horario, diciendo cuándo SÍ se atiende', async () => {
      mockedGetSchedule.mockResolvedValue(hoursForFutureDate());
      const user = userEvent.setup();
      await renderFormAndWaitForLoad();

      await selectMariaByDoc(user);
      await user.selectOptions(screen.getByLabelText(/profesional/i), 'staff-1');
      await typeDate(user, /^fecha$/i, FUTURE_DATE);
      await typeTime(user, /hora de inicio/i, '20:00');
      await typeTime(user, /hora de fin/i, '20:30');

      await user.click(screen.getByRole('button', { name: /agendar|guardar/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /fuera del horario de atención.*09:00–13:00/i,
      );
      expect(mockedCreateAppointment).not.toHaveBeenCalled();
    });

    it('acepta una cita DENTRO del horario', async () => {
      mockedGetSchedule.mockResolvedValue(hoursForFutureDate());
      mockedCreateAppointment.mockResolvedValue(createdAppointment);
      const user = userEvent.setup();
      await renderFormAndWaitForLoad();

      await selectMariaByDoc(user);
      await user.selectOptions(screen.getByLabelText(/profesional/i), 'staff-1');
      await typeDate(user, /^fecha$/i, FUTURE_DATE);
      await typeTime(user, /hora de inicio/i, '10:00');
      await typeTime(user, /hora de fin/i, '10:30');

      await user.click(screen.getByRole('button', { name: /agendar|guardar/i }));

      await waitFor(() => expect(mockedCreateAppointment).toHaveBeenCalledTimes(1));
    });

    it('avisa que la sede no atiende ese día cuando está cerrado', async () => {
      // Horario que solo abre OTRO día que el de FUTURE_DATE.
      const weekday = new Date(`${FUTURE_DATE}T00:00:00`).getDay();
      mockedGetSchedule.mockResolvedValue({
        timezone: 'America/Bogota',
        ranges: [{ weekday: (weekday + 1) % 7, startMinute: 540, endMinute: 780 }],
      });
      const user = userEvent.setup();
      await renderFormAndWaitForLoad();

      await typeDate(user, /^fecha$/i, FUTURE_DATE);

      expect(await screen.findByText(/la sede no atiende ese día/i)).toBeInTheDocument();
    });
  });

  describe('no agendar en el pasado', () => {
    // TST-020: reloj fijo a mediodía; con el real, «hace 5 min» caía en el día
    // anterior si la corrida empezaba justo después de las 00:00.
    beforeEach(() => {
      fakeDateOnly(new Date(2026, 5, 15, 12, 0, 0));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('el date picker no ofrece días anteriores a hoy (min = hoy local)', async () => {
      const user = userEvent.setup();
      await renderFormAndWaitForLoad();
      // Reloj fijo: hoy es 15/06/2026. En el calendario, el 14 no se puede elegir.
      await user.click(within(dateGroup(/^fecha$/i)).getByRole('button', { name: /calendario/i }));
      const grid = await screen.findByRole('grid');
      expect(within(grid).getByRole('button', { name: /14 de junio de 2026/ })).toHaveAttribute('aria-disabled', 'true');
      expect(within(grid).getByRole('button', { name: /15 de junio de 2026/ })).not.toHaveAttribute('aria-disabled');
    });

    // El caso que el `min` del date input NO puede cubrir (el día es válido, la
    // HORA ya pasó) y que motivó esta validación. La fecha/hora se derivan de
    // `now - 5min`, así que es siempre "hoy, un instante ya pasado" salvo que la
    // corrida caiga en los primeros 5 minutos del día.
    it('bloquea el submit con HOY a una hora que ya pasó y no llama a createAppointment', async () => {
      const user = userEvent.setup();
      await renderFormAndWaitForLoad();
      const past = new Date(Date.now() - 5 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const pastDate = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`;
      const pastTime = `${pad(past.getHours())}:${pad(past.getMinutes())}`;

      await selectMariaByDoc(user);
      await user.selectOptions(screen.getByLabelText(/profesional/i), 'staff-1');
      await typeDate(user, /^fecha$/i, pastDate);
      await typeTime(user, /hora de inicio/i, pastTime);
      await typeTime(user, /hora de fin/i, '23:59');

      await user.click(screen.getByRole('button', { name: /agendar|guardar/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/no se puede agendar en el pasado/i);
      expect(mockedCreateAppointment).not.toHaveBeenCalled();
    });
  });

  it('submits createAppointment with the correct ISO start/end payload', async () => {
    const user = userEvent.setup();
    mockedCreateAppointment.mockResolvedValue(createdAppointment);
    await renderFormAndWaitForLoad();
    await fillValidForm(user);
    await user.type(screen.getByLabelText(/motivo/i), 'Control');

    await user.click(screen.getByRole('button', { name: /agendar|guardar/i }));

    await waitFor(() => expect(mockedCreateAppointment).toHaveBeenCalledTimes(1));
    const [token, input] = mockedCreateAppointment.mock.calls[0];
    expect(token).toBe('tok');
    expect(input.patientId).toBe('pat-1');
    expect(input.providerId).toBe('staff-1');
    expect(input.reason).toBe('Control');
    expect(new Date(input.start).getTime()).toBeLessThan(new Date(input.end ?? '').getTime());
    expect(input.start).toBe(new Date(`${FUTURE_DATE}T09:00:00`).toISOString());
    expect(input.end).toBe(new Date(`${FUTURE_DATE}T09:30:00`).toISOString());
  });

  describe('hueco reservado (DX-446)', () => {
    const reservedMessage =
      'Ese horario está reservado para urgencias (Consulta de urgencia). Elige otro hueco o usa un tipo permitido.';
    const reservedError = (canOverride: boolean) =>
      new ApiError(409, reservedMessage, { messages: [reservedMessage], code: 'RESERVED_SLOT', canOverride });

    it('sin permiso: el 409 se lee en el formulario y no ofrece agendar igualmente', async () => {
      const user = userEvent.setup();
      mockedCreateAppointment.mockRejectedValue(reservedError(false));
      await renderFormAndWaitForLoad();
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /^agendar cita$/i }));

      expect(await screen.findByText(reservedMessage)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /agendar igualmente/i })).not.toBeInTheDocument();
    });

    it('con permiso: pide el motivo y reintenta con `overrideReason`', async () => {
      const user = userEvent.setup();
      mockedCreateAppointment
        .mockRejectedValueOnce(reservedError(true))
        .mockResolvedValueOnce(createdAppointment);
      await renderFormAndWaitForLoad();
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /^agendar cita$/i }));

      const force = await screen.findByRole('button', { name: /agendar igualmente/i });
      await user.click(force);
      expect(await screen.findByText(/entre 5 y 300 caracteres/i)).toBeInTheDocument();
      expect(mockedCreateAppointment).toHaveBeenCalledTimes(1);

      await user.type(screen.getByLabelText(/motivo para agendar igualmente/i), 'Dolor agudo');
      await user.click(force);
      await waitFor(() => expect(mockedCreateAppointment).toHaveBeenCalledTimes(2));
      expect(mockedCreateAppointment.mock.calls[1][1]).toMatchObject({
        patientId: 'pat-1',
        overrideReason: 'Dolor agudo',
      });
    });

    it('el motivo recibe el foco y, si cambia la hora, ya no ofrece agendar igualmente la cita anterior', async () => {
      const user = userEvent.setup();
      mockedCreateAppointment.mockRejectedValueOnce(reservedError(true));
      await renderFormAndWaitForLoad();
      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /^agendar cita$/i }));

      await screen.findByRole('button', { name: /agendar igualmente/i });
      expect(screen.getByLabelText(/motivo para agendar igualmente/i)).toHaveFocus();

      await typeTime(user, /hora de fin/i, '10:00');
      expect(screen.queryByRole('button', { name: /agendar igualmente/i })).not.toBeInTheDocument();
    });
  });

  it('calls onCreated with the created appointment on success', async () => {
    const user = userEvent.setup();
    const onCreated = jest.fn();
    mockedCreateAppointment.mockResolvedValue(createdAppointment);
    render(<AppointmentForm token="tok" onCreated={onCreated} />);
    await screen.findByRole('option', { name: /dra\. ana ríos/i });
    await waitFor(() => expect(mockedListPatients).toHaveBeenCalled());
    await fillValidForm(user);

    await user.click(screen.getByRole('button', { name: /agendar|guardar/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(createdAppointment));
  });

  it('disables the submit button and shows "Guardando…" while submitting', async () => {
    const user = userEvent.setup();
    let resolveCreate: () => void = () => {};
    mockedCreateAppointment.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = () => resolve(createdAppointment);
      }),
    );
    await renderFormAndWaitForLoad();
    await fillValidForm(user);

    const submit = screen.getByRole('button', { name: /agendar|guardar/i });
    expect(submit).not.toBeDisabled();
    await user.click(submit);
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent(/guardando/i);
    resolveCreate();
    await waitFor(() => expect(mockedCreateAppointment).toHaveBeenCalledTimes(1));
  });

  it('shows a clear overlap message (es) when createAppointment rejects with a 409', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    const user = userEvent.setup();
    mockedCreateAppointment.mockRejectedValue(
      new ApiError(409, 'El profesional ya tiene una cita en ese horario'),
    );
    await renderFormAndWaitForLoad();
    await fillValidForm(user);

    await user.click(screen.getByRole('button', { name: /agendar|guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El profesional ya tiene una cita en ese horario',
    );
  });

  it('cuando falla la carga de profesionales, sustituye el select por el error', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedListStaff.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));

    render(<AppointmentForm token="tok" onCreated={jest.fn()} />);

    // Se busca por texto (no `findByRole('status')` a secas): el chip del
    // paciente elegido y el estado "sin resultados" también usan
    // `role="status"`, así que una consulta de rol sin más sería una carrera.
    const region = await screen.findByText(/no se pudieron cargar/i);
    expect(region.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByLabelText(/profesional/i)).not.toBeInTheDocument();
  });

  it('cuando falla la carga de pacientes, el buscador se queda y el error aparece debajo', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedListPatients.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));

    render(<AppointmentForm token="tok" onCreated={jest.fn()} />);
    await waitFor(() => expect(mockedListPatients).toHaveBeenCalled());

    const region = await screen.findByText(/no se pudieron cargar/i);
    expect(region.closest('[role="status"]')).not.toBeNull();
    // Escribir sigue siendo válido: el input se queda, solo falló la lista.
    expect(screen.getByLabelText(/^paciente$/i)).toBeInTheDocument();
  });

  it('prefills start and end time from props', async () => {
    render(
      <AppointmentForm
        token="tok"
        onCreated={jest.fn()}
        defaultDate="2026-03-09"
        defaultStartTime="09:00"
        defaultEndTime="09:30"
      />,
    );
    await waitFor(() => expect(mockedListStaff).toHaveBeenCalled());
    expect(readTime(/hora de inicio/i)).toBe('09:00');
    expect(readTime(/hora de fin/i)).toBe('09:30');
  });

  describe('inline "Crear paciente" dialog', () => {
    it('opens the dialog with the PatientForm fields when the trigger is clicked', async () => {
      const user = userEvent.setup();
      await renderFormAndWaitForLoad();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /crear paciente/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByLabelText(/^nombre$/i)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/apellido/i)).toBeInTheDocument();
      expect(within(dialog).getByLabelText(/tipo de documento/i)).toBeInTheDocument();
    });

    it('offers to create a patient (pre-filling the document) when a document search finds no match', async () => {
      const user = userEvent.setup();
      mockedListPatients.mockResolvedValue({ ...patientsPage, items: [], total: 0 });
      await renderFormAndWaitForLoad();

      await user.type(screen.getByLabelText(/^paciente$/i), '999');
      // The "no match" region (role=status) offers its own create button.
      const noMatch = await screen.findByRole('status');
      expect(noMatch).toHaveTextContent(/no encontramos/i);

      await user.click(within(noMatch).getByRole('button', { name: /crear paciente/i }));
      const dialog = await screen.findByRole('dialog');
      // The typed document number is carried into the create form.
      expect(within(dialog).getByLabelText(/número de documento/i)).toHaveValue('999');
    });

    it('creates, selects and shows the new patient as the chosen one, and closes the dialog', async () => {
      const user = userEvent.setup();
      mockedCreatePatient.mockResolvedValue(newPatient);
      await renderFormAndWaitForLoad();

      await user.click(screen.getByRole('button', { name: /crear paciente/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/^nombre$/i), 'Sofía');
      await user.type(within(dialog).getByLabelText(/apellido/i), 'Ramírez');
      await user.selectOptions(within(dialog).getByLabelText(/tipo de documento/i), 'NATIONAL_ID');

      await user.click(within(dialog).getByRole('button', { name: /crear paciente/i }));

      await waitFor(() => expect(mockedCreatePatient).toHaveBeenCalledTimes(1));
      const [token, input] = mockedCreatePatient.mock.calls[0];
      expect(token).toBe('tok');
      expect(input).toEqual({
        firstName: 'Sofía',
        lastName: 'Ramírez',
        docType: 'NATIONAL_ID',
        sex: 'UNSPECIFIED',
      });

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByText('Sofía Ramírez')).toBeInTheDocument();
    });

    it('keeps the dialog open and shows an error when createPatient fails, without selecting anything', async () => {
      const { ApiError } = jest.requireActual('../../lib/api/client');
      const user = userEvent.setup();
      mockedCreatePatient.mockRejectedValue(new ApiError(409, 'Documento ya registrado'));
      await renderFormAndWaitForLoad();

      await user.click(screen.getByRole('button', { name: /crear paciente/i }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText(/^nombre$/i), 'Sofía');
      await user.type(within(dialog).getByLabelText(/apellido/i), 'Ramírez');
      await user.selectOptions(within(dialog).getByLabelText(/tipo de documento/i), 'NATIONAL_ID');

      await user.click(within(dialog).getByRole('button', { name: /crear paciente/i }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Documento ya registrado');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // Nothing got selected: the search box is still there, no chip.
      expect(screen.getByLabelText(/^paciente$/i)).toBeInTheDocument();
      expect(screen.queryByText('Sofía Ramírez')).not.toBeInTheDocument();
    });
  });
  // DX-233: aviso no bloqueante si la cita cae fuera del horario del profesional.
  describe('horario del profesional (DX-233)', () => {
    afterEach(() => window.localStorage.clear());

    function mockRosterDay(ranges: { startMinute: number; endMinute: number }[] | null) {
      (getRoster as jest.Mock).mockImplementation((_t: string, params: { weekStart: string }) =>
        Promise.resolve({
          from: params.weekStart,
          to: params.weekStart,
          locationId: 'loc-1',
          locations: [],
          providers: [
            {
              providerId: 'staff-1',
              fullName: 'Dra. Ana Ríos',
              role: 'DENTIST',
              configured: true,
              days: [
                {
                  date: params.weekStart,
                  weekday: 4,
                  unrestricted: ranges === null,
                  assignments: [],
                  worksAtLocation: ranges === null || ranges.length > 0,
                  locationRanges: ranges,
                },
              ],
            },
          ],
        }),
      );
    }

    it('fuera de su horario en la sede avisa sin impedir agendar', async () => {
      window.localStorage.setItem('dentalix.activeLocationId', 'loc-1');
      mockRosterDay([{ startMinute: 14 * 60, endMinute: 19 * 60 }]);
      mockedCreateAppointment.mockResolvedValue({ id: 'a1' } as never);
      const user = userEvent.setup();
      await renderFormAndWaitForLoad();
      await fillValidForm(user);

      expect(
        await screen.findByText(
          'Fuera del horario de Dra. Ana Ríos en esta sede (ese día: 14:00–19:00). Se puede agendar igual; quedará el aviso.',
        ),
      ).toBeInTheDocument();
      expect(getRoster).toHaveBeenCalledWith('tok', { weekStart: FUTURE_DATE, days: 1, locationId: 'loc-1' });
      await user.click(screen.getByRole('button', { name: 'Agendar cita' }));
      await waitFor(() => expect(mockedCreateAppointment).toHaveBeenCalled());
    });

    it('en modo estricto avisa de que la clínica no lo permite; dentro del horario no dice nada', async () => {
      window.localStorage.setItem('dentalix.activeLocationId', 'loc-1');
      mockRosterDay([]);
      (getProviderScheduleSettings as jest.Mock).mockResolvedValue({ strictProviderSchedule: true });
      const user = userEvent.setup();
      await renderFormAndWaitForLoad();
      await fillValidForm(user);
      expect(
        await screen.findByText(
          'Dra. Ana Ríos no atiende en esta sede ese día. La clínica no permite citar fuera del horario del profesional.',
        ),
      ).toBeInTheDocument();

      mockRosterDay([{ startMinute: 8 * 60, endMinute: 13 * 60 }]);
      await typeDate(user, /^fecha$/i, FUTURE_DATE);
      await waitFor(() =>
        expect(screen.queryByText(/no atiende en esta sede ese día/)).not.toBeInTheDocument(),
      );
    });

    it('sin sede activa no consulta el cuadrante', async () => {
      const user = userEvent.setup();
      await renderFormAndWaitForLoad();
      await fillValidForm(user);
      expect(getRoster).not.toHaveBeenCalled();
    });
  });

});

describe('«Adelantar si hay hueco» (DX-210)', () => {
  const tokenFor = (role: string) =>
    `h.${Buffer.from(JSON.stringify({ sub: 'u1', role })).toString('base64url')}.s`;

  it('recepción la marca y viaja en la cita nueva', async () => {
    const user = userEvent.setup();
    mockedCreateAppointment.mockResolvedValue(createdAppointment);
    render(<AppointmentForm token={tokenFor('RECEPTION')} onCreated={jest.fn()} />);
    await screen.findByRole('option', { name: /dra\. ana ríos/i });
    await waitFor(() => expect(mockedListPatients).toHaveBeenCalled());
    await fillValidForm(user);
    await user.click(screen.getByRole('checkbox', { name: 'Adelantar si hay hueco' }));
    await user.click(screen.getByRole('button', { name: /agendar|guardar/i }));
    await waitFor(() => expect(mockedCreateAppointment).toHaveBeenCalled());
    expect(mockedCreateAppointment.mock.calls[0][1]).toMatchObject({ wantsEarlier: true });
  });

  it('la asistente no ve la casilla', async () => {
    render(<AppointmentForm token={tokenFor('ASSISTANT')} onCreated={jest.fn()} />);
    await screen.findByRole('option', { name: /dra\. ana ríos/i });
    expect(screen.queryByRole('checkbox', { name: 'Adelantar si hay hueco' })).not.toBeInTheDocument();
  });

});

describe('AppointmentForm con el reloj de la sede (DX-378)', () => {
  const mockedListLocations = listLocations as jest.MockedFunction<typeof listLocations>;
  afterEach(() => mockedListLocations.mockResolvedValue([utcSede()]));

  it('la fecha y las horas elegidas son las de la sede (Caracas), no las del navegador (UTC)', async () => {
    mockedListLocations.mockResolvedValue([caracasSede()]);
    mockedCreateAppointment.mockResolvedValue(createdAppointment);
    const user = userEvent.setup();
    await renderFormAndWaitForLoad();
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /agendar cita/i }));
    await waitFor(() => expect(mockedCreateAppointment).toHaveBeenCalled());
    const input = mockedCreateAppointment.mock.calls.at(-1)![1];
    expect(input.start).toBe(wallInstant(FUTURE_DATE, 9 * 60, 'America/Caracas').toISOString());
    expect(input.end).toBe(wallInstant(FUTURE_DATE, 9 * 60 + 30, 'America/Caracas').toISOString());
  });

  it('sin la zona de la sede, el campo de fecha se sustituye por su error con Reintentar', async () => {
    mockedListLocations.mockResolvedValue([caracasSede({ timeZone: null })]);
    render(<AppointmentForm token="tok" onCreated={jest.fn()} />);
    expect(await screen.findByText('Sin zona de sede')).toBeInTheDocument();
  });
});
