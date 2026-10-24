import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgendaView } from './agenda-view';
import { Toaster } from '@/components/errors/toaster';
import { ApiError } from '@/lib/api/client';
import { localDayRange, localWeekRange } from '@/lib/appointments/day-range';
import { createAppointment, listAppointments, updateAppointment } from '@/lib/appointments/appointments-api';
import { listStaff } from '@/lib/appointments/staff-api';
import { listPatients } from '@/lib/patients/patients-api';
import { createConfirmationLink } from '@/lib/appointments/confirmations-api';
import { getAppointmentReminders } from '@/lib/reminders/reminders-api';
import { getAppointmentPostOp } from '@/lib/postop/postop-api';
import { deleteScheduleBlock, listScheduleBlocks } from '@/lib/appointments/schedule-blocks-api';
import { listWaitlist, scheduleFromWaitlist } from '@/lib/appointments/waitlist-api';
import { listLocations } from '@/lib/locations/locations-api';
import { getLocationSchedule } from '@/lib/locations/schedule-api';
import { listOpeningCandidates } from '@/lib/appointments/opening-candidates';
import { getRoster } from '@/lib/locations/provider-schedule-api';

/** DX-295: el estado se elige abriendo la lista y pulsando una opción. */
async function pickStatus(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, label: string) {
  await user.click(trigger);
  await user.click(screen.getByRole('option', { name: label }));
}

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching odontogram-tab.test.tsx's / appointment-form.test.tsx's
// convention. Both `AgendaView` and the real (unmocked) `AppointmentForm` it
// renders import from these same modules, so one mock per module covers both.
jest.mock('../../lib/appointments/appointments-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointments-api'),
  createAppointment: jest.fn(),
  listAppointments: jest.fn(),
  updateAppointment: jest.fn(),
}));
// DX-279: la vista previa del aviso del diálogo de cancelar.
jest.mock('../../lib/cancellations/cancellation', () => ({
  ...jest.requireActual('../../lib/cancellations/cancellation'),
  getCancellationPreview: jest.fn().mockResolvedValue({
    appointmentId: 'apt-c',
    noticeMinutes: 300,
    lateCancellation: true,
    policy: { id: 'p1', version: 1, noticeHours: 24 },
  }),
}));
jest.mock('../../lib/appointments/appointment-types-api', () => ({
  listAppointmentTypes: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([{ id: 'loc-1', name: 'Sede principal' }]),
}));
// Sede sin horario configurado: nada sombreado, nada bloqueado.
jest.mock('../../lib/locations/schedule-api', () => ({
  ...jest.requireActual('../../lib/locations/schedule-api'),
  getLocationSchedule: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../lib/appointments/staff-api', () => ({
  listStaff: jest.fn(),
}));
jest.mock('../../lib/patients/patients-api', () => ({
  listPatients: jest.fn(),
}));
jest.mock('../../lib/appointments/confirmations-api', () => ({
  createConfirmationLink: jest.fn(),
}));
jest.mock('../../lib/reminders/reminders-api', () => ({
  ...jest.requireActual('../../lib/reminders/reminders-api'),
  getAppointmentReminders: jest.fn(),
}));
// DX-222: el panel «Indicaciones» se prueba aparte; aquí basta con que cargue.
jest.mock('../../lib/postop/postop-api', () => ({
  ...jest.requireActual('../../lib/postop/postop-api'),
  getAppointmentPostOp: jest.fn().mockResolvedValue({
    patientId: 'p1',
    suggested: [],
    others: [],
    email: { allowed: false, reason: null, toMasked: null, toResponsible: false },
    whatsapp: { phone: null, reason: null },
    locationPhone: null,
    deliveries: [],
  }),
  deliverPostOp: jest.fn(),
}));
// DX-122: bloqueos y pendientes (su comportamiento propio se prueba abajo).
jest.mock('../../lib/appointments/schedule-blocks-api', () => ({
  ...jest.requireActual('../../lib/appointments/schedule-blocks-api'),
  listScheduleBlocks: jest.fn().mockResolvedValue([]),
  deleteScheduleBlock: jest.fn().mockResolvedValue(undefined),
}));
// DX-170: «Registrar evolución» abre el modal, que pide las plantillas.
jest.mock('../../lib/clinical-notes/note-templates-api', () => ({
  listNoteTemplates: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/appointments/waitlist-api', () => ({
  listWaitlist: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
  scheduleFromWaitlist: jest.fn(),
}));
// DX-233: cuadrante del día en la sede (por defecto, nadie con horario).
jest.mock('../../lib/locations/provider-schedule-api', () => ({
  ...jest.requireActual('../../lib/locations/provider-schedule-api'),
  getRoster: jest.fn().mockResolvedValue({
    from: '2026-01-01',
    to: '2026-01-01',
    locationId: null,
    locations: [],
    providers: [],
  }),
}));
// DX-210: «Ocupar este hueco» (el panel se prueba aparte; aquí, el cableado).
jest.mock('../../lib/appointments/opening-candidates', () => ({
  ...jest.requireActual('../../lib/appointments/opening-candidates'),
  listOpeningCandidates: jest.fn(),
}));

const mockedCreateAppointment = createAppointment as jest.MockedFunction<typeof createAppointment>;
const mockedListAppointments = listAppointments as jest.MockedFunction<typeof listAppointments>;
const mockedUpdateAppointment = updateAppointment as jest.MockedFunction<typeof updateAppointment>;
const mockedListStaff = listStaff as jest.MockedFunction<typeof listStaff>;
const mockedListPatients = listPatients as jest.MockedFunction<typeof listPatients>;
const mockedCreateConfirmationLink = createConfirmationLink as jest.MockedFunction<
  typeof createConfirmationLink
>;

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
      docType: 'CC' as const,
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
  ],
  total: 1,
  page: 1,
  pageSize: 100,
};

function appointment(overrides: Partial<import('@/lib/appointments/appointments-api').Appointment> & { id: string }) {
  return {
    tenantId: 't1',
    patientId: 'pat-1',
    patientFirstName: null,
    patientLastName: null,
    providerId: 'staff-1',
    start: '2026-03-10T09:00:00.000Z',
    end: '2026-03-10T09:30:00.000Z',
    status: 'SCHEDULED' as const,
    reason: null,
    notes: null,
    createdById: null,
    locationId: 'loc-1',
    appointmentTypeId: null,
    appointmentType: null,
    confirmationSentAt: null,
    callbackRequestedAt: null,
    wantsEarlier: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const apt1 = appointment({ id: 'apt-1' });
const apt2 = appointment({ id: 'apt-2', patientId: 'pat-1' });

/** A promise this test controls the settlement of, to assert on the interim (pending) state — same helper as odontogram-tab.test.tsx. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// Local `YYYY-MM-DD` always in the FUTURE: AppointmentForm now rejects a start
// instant in the past, so a hardcoded date would rot.
const FUTURE_DATE = (() => {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
})();

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

describe('AgendaView', () => {
  beforeEach(() => {
    mockedCreateAppointment.mockReset();
    mockedListAppointments.mockReset();
    mockedUpdateAppointment.mockReset();
    mockedListStaff.mockReset();
    mockedListPatients.mockReset();
    mockedListPatients.mockResolvedValue(patientsPage);
    (getAppointmentReminders as jest.Mock).mockResolvedValue({
      enabled: true,
      leadHours: [48, 2],
      items: [],
    });
  });

  it('cuando falla la carga de profesionales, el filtro se sustituye por el error en su sitio', async () => {
    mockedListStaff.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));
    mockedListAppointments.mockResolvedValue([]);

    render(<AgendaView token="tok" />);

    // El error ocupa el lugar del filtro, no una franja debajo. Se busca por
    // texto (no `findByRole('status')` a secas): el spinner de carga del
    // calendario también usa `role="status"` y aparece/desaparece en la
    // misma ventana, así que una consulta de rol sin más es una carrera.
    const region = await screen.findByText(/no pudimos cargar profesionales/i);
    expect(region.closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByLabelText('Profesional')).not.toBeInTheDocument();

    // Y no interrumpe: la agenda sigue en pantalla y no hay alerta asertiva.
    expect(screen.getByRole('button', { name: /nueva cita/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('defaults the provider filter to "Todos" (all providers) and offers each staff member as an option', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValue([]);

    render(<AgendaView token="tok" />);

    const providerSelect = await screen.findByLabelText<HTMLSelectElement>(/profesional/i);
    // '' = "Todos los profesionales" — the month calendar shows the whole clinic.
    expect(providerSelect.value).toBe('');
    expect(
      within(providerSelect).getByRole('option', { name: /todos los profesionales/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(providerSelect).getByRole('option', { name: 'Dra. Ana Ríos' })).toBeInTheDocument(),
    );
  });

  it('in Día view fetches the selected day with localDayRange boundaries, scoped to the chosen provider', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValue([]);
    const user = userEvent.setup();

    render(<AgendaView token="tok" />);
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /^día$/i }));
    await user.click(screen.getByRole('button', { name: /^lista$/i }));
    await user.selectOptions(screen.getByLabelText(/profesional/i), 'staff-1');

    mockedListAppointments.mockClear();
    const dateInput = screen.getByLabelText(/^fecha$/i);
    await user.clear(dateInput);
    await user.type(dateInput, '2026-03-10');

    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
    const params = mockedListAppointments.mock.calls.at(-1)![1];
    const expected = localDayRange('2026-03-10');
    expect(params.from).toBe(expected.from);
    expect(params.to).toBe(expected.to);
    expect(params.providerId).toBe('staff-1');
  });

  it('refreshes appointments in place after a cita is created — DayAgenda stays mounted, "Actualizando…" shows instead of a full reload', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedCreateAppointment.mockResolvedValue(apt2);

    // First call (initial load) resolves immediately; the second call (the
    // post-create refresh triggered by `handleAppointmentCreated`) is
    // controlled manually so the test can assert the interim "refreshing"
    // state before it settles — mirrors odontogram-tab.test.tsx.
    const refetch = deferred<typeof apt1[]>();
    let callCount = 0;
    mockedListAppointments.mockImplementation(() => {
      callCount += 1;
      // #1 mount (month), #2 switching to Día (columnas), #3 «Lista» —
      // resolve immediately; #4 is the deferred post-action refresh whose
      // interim state the test asserts on.
      return callCount <= 3 ? Promise.resolve([apt1]) : refetch.promise;
    });

    const user = userEvent.setup();
    render(<AgendaView token="tok" />);

    // Switch to Día view — where the appointment table renders — then let the
    // initial load settle with the one appointment.
    await user.click(screen.getByRole('button', { name: /^día$/i }));
    await user.click(screen.getByRole('button', { name: /^lista$/i }));
    const table = await screen.findByRole('table', { name: /agenda del día/i });
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + apt1

    // Open the form and fill it in. Both the agenda's own selectors and the
    // form share the "Profesional"/"Fecha" label text while the form is
    // open — disambiguate by id (the form's fields, per `appointment-form.tsx`).
    await user.click(screen.getByRole('button', { name: /nueva cita/i }));
    // Auto-select María López (pat-1) by typing her exact document number —
    // wait for the chosen-patient chip ("Cambiar") so the debounced select lands.
    await user.type(screen.getByLabelText(/^paciente$/i), '123');
    await screen.findByRole('button', { name: /cambiar/i });
    await user.selectOptions(
      screen.getByLabelText(/profesional/i, { selector: '#appointment-provider' }),
      'staff-1',
    );
    const formDate = screen.getByLabelText(/^fecha$/i, { selector: '#appointment-date' });
    await user.clear(formDate);
    await user.type(formDate, FUTURE_DATE);
    await user.type(screen.getByLabelText(/hora de inicio/i), '09:00');
    await user.type(screen.getByLabelText(/hora de fin/i), '09:30');

    await user.click(screen.getByRole('button', { name: /agendar/i }));

    await waitFor(() => expect(mockedCreateAppointment).toHaveBeenCalledTimes(1));
    // The refresh-in-place fetch has started (2nd listAppointments call is
    // pending on `refetch`); the form closes and a non-blocking refreshing
    // indicator shows, but the day table must stay the SAME mounted node —
    // no full-page reload / remount.
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalledTimes(4));
    expect(screen.queryByRole('form', { name: /agendar cita/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/actualizando/i)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /agenda del día/i })).toBe(table);

    // Settle the refetch with both appointments — the indicator clears, the
    // table is still the same mounted node, now with the new row.
    refetch.resolve([apt1, apt2]);
    await waitFor(() => expect(screen.queryByText(/actualizando/i)).not.toBeInTheDocument());
    expect(screen.getByRole('table', { name: /agenda del día/i })).toBe(table);
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + apt1 + apt2
  });

  it('changing a row\'s status select calls updateAppointment(id, {status}) then refreshes the agenda in place — DayAgenda stays mounted (no remount)', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedUpdateAppointment.mockResolvedValue({ ...apt1, status: 'CONFIRMED' });

    // First call (initial load) resolves immediately with apt1 as SCHEDULED;
    // the second call (the post-PATCH refresh triggered by
    // `handleStatusChange`) is controlled manually so the test can assert
    // the interim state before it settles — same pattern as the
    // create-appointment refresh-in-place test above.
    const refetch = deferred<typeof apt1[]>();
    let callCount = 0;
    mockedListAppointments.mockImplementation(() => {
      callCount += 1;
      // #1 mount (month), #2 switching to Día (columnas), #3 «Lista» —
      // resolve immediately; #4 is the deferred post-action refresh whose
      // interim state the test asserts on.
      return callCount <= 3 ? Promise.resolve([apt1]) : refetch.promise;
    });

    const user = userEvent.setup();
    render(<AgendaView token="tok" />);

    await user.click(screen.getByRole('button', { name: /^día$/i }));
    await user.click(screen.getByRole('button', { name: /^lista$/i }));
    const table = await screen.findByRole('table', { name: /agenda del día/i });
    const statusSelect = within(table).getByRole('combobox');
    expect(statusSelect).toHaveTextContent('Agendada');

    await pickStatus(user, statusSelect, 'Confirmada');

    await waitFor(() =>
      expect(mockedUpdateAppointment).toHaveBeenCalledWith('tok', 'apt-1', { status: 'CONFIRMED' }),
    );
    // The refresh-in-place fetch has started (2nd listAppointments call
    // pending on `refetch`) — same mounted table node, control disabled
    // while its own update is in flight.
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalledTimes(4));
    expect(screen.getByRole('table', { name: /agenda del día/i })).toBe(table);

    refetch.resolve([{ ...apt1, status: 'CONFIRMED' }]);

    await waitFor(() =>
      expect(within(table).getByRole('combobox')).toHaveTextContent('Confirmada'),
    );
    expect(screen.getByRole('table', { name: /agenda del día/i })).toBe(table);
  });

  it('keeps the row\'s status select disabled until the in-place refresh actually resolves, not just until the PATCH settles (review fix)', async () => {
    mockedListStaff.mockResolvedValue(staff);

    // Both the PATCH and the follow-up refetch are DEFERRED so the test can
    // step through the timeline precisely: resolving `patch` alone must NOT
    // be enough to re-enable the select — only resolving `refetch` (the
    // in-place `listAppointments` call `handleStatusChange` triggers after
    // the PATCH) may. This is exactly the window the old fire-and-forget
    // `refreshAppointmentsInPlace()` (not awaited, with `updatingId` cleared
    // in the PATCH's own `.finally`) left open: the select re-enabled while
    // `appointments` still held the stale pre-change status.
    const patch = deferred<typeof apt1>();
    mockedUpdateAppointment.mockReturnValue(patch.promise);

    const refetch = deferred<typeof apt1[]>();
    let callCount = 0;
    mockedListAppointments.mockImplementation(() => {
      callCount += 1;
      // #1 mount (month), #2 switching to Día (columnas), #3 «Lista» —
      // resolve immediately; #4 is the deferred post-action refresh whose
      // interim state the test asserts on.
      return callCount <= 3 ? Promise.resolve([apt1]) : refetch.promise;
    });

    const user = userEvent.setup();
    render(<AgendaView token="tok" />);

    await user.click(screen.getByRole('button', { name: /^día$/i }));
    await user.click(screen.getByRole('button', { name: /^lista$/i }));
    const table = await screen.findByRole('table', { name: /agenda del día/i });
    const statusSelect = within(table).getByRole('combobox');
    expect(statusSelect).toHaveTextContent('Agendada');
    expect(statusSelect).not.toBeDisabled();

    await pickStatus(user, statusSelect, 'Confirmada');
    // Selecting a new value while disabled-testing must not race ahead:
    // the PATCH is in flight, so the select is already disabled.
    expect(statusSelect).toBeDisabled();

    // Resolve the PATCH but leave the refetch pending.
    patch.resolve({ ...apt1, status: 'CONFIRMED' });
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalledTimes(4));

    // THE ASSERTION THAT PROVES THE FIX: the PATCH has settled and the
    // in-place refresh has started, but has NOT resolved yet — the row must
    // still be disabled (and must still show the stale SCHEDULED value,
    // since `appointments` hasn't been updated yet). Against the old
    // fire-and-forget code, `updatingId` was already cleared here (its
    // `.finally` ran off the PATCH promise alone), so this assertion fails.
    expect(within(table).getByRole('combobox')).toBeDisabled();
    expect(within(table).getByRole('combobox')).toHaveTextContent('Agendada');

    // Now resolve the refresh — only now should the select re-enable, showing
    // the new status.
    refetch.resolve([{ ...apt1, status: 'CONFIRMED' }]);

    await waitFor(() =>
      expect(within(table).getByRole('combobox')).not.toBeDisabled(),
    );
    expect(within(table).getByRole('combobox')).toHaveTextContent('Confirmada');
  });

  it('el reintento del toast de refresh usa el filtro vigente al pulsar "Reintentar", no el capturado cuando el refresh falló (fix ronda 1: closure obsoleto)', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedUpdateAppointment.mockResolvedValue({ ...apt1, status: 'CONFIRMED' });

    let callCount = 0;
    mockedListAppointments.mockImplementation(() => {
      callCount += 1;
      // #1 mount (month), #2 switch to Día (columnas), #3 «Lista»: resolve
      // regardless of filter.
      if (callCount <= 3) return Promise.resolve([apt1]);
      // #4: the in-place refresh right after the status PATCH — fails while
      // providerId is still '' (todos). This is what builds the toast.
      if (callCount === 4) return Promise.reject(new Error('boom'));
      // #5: the user narrows the filter to staff-2 WHILE the toast is still
      // up — an ordinary fetch for that provider.
      if (callCount === 5) return Promise.resolve([]);
      // #6: clicking the toast's "Reintentar" — must replay with the
      // *current* filter (staff-2), not '' from when the toast was built.
      return Promise.resolve([apt2]);
    });

    const user = userEvent.setup();
    render(
      <>
        <AgendaView token="tok" />
        <Toaster />
      </>,
    );

    await user.click(screen.getByRole('button', { name: /^día$/i }));
    await user.click(screen.getByRole('button', { name: /^lista$/i }));
    const table = await screen.findByRole('table', { name: /agenda del día/i });
    const statusSelect = within(table).getByRole('combobox');

    await pickStatus(user, statusSelect, 'Confirmada');

    // The failed in-place refresh surfaces as a toast with a retry action.
    const retryButton = await screen.findByRole('button', { name: 'Reintentar' });
    await waitFor(() => expect(callCount).toBe(4));

    // Narrow the provider filter while the toast is still on screen — the
    // stale-closure trap: the toast's `onRetry` was built during the failed
    // refresh, when `providerId` was still ''.
    const providerSelect = screen.getByLabelText<HTMLSelectElement>(/^profesional$/i);
    await user.selectOptions(providerSelect, 'staff-2');
    await waitFor(() => expect(callCount).toBe(5));

    await user.click(retryButton);

    await waitFor(() => expect(callCount).toBe(6));
    const lastCallOpts = mockedListAppointments.mock.calls[5][1];
    expect(lastCallOpts).toMatchObject({ providerId: 'staff-2' });
  });

  it('opens the "Nueva cita" modal and pre-fills AppointmentForm\'s date with the selected day', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValue([]);
    const user = userEvent.setup();

    render(<AgendaView token="tok" />);
    await waitFor(() => expect(mockedListStaff).toHaveBeenCalled());

    const dateInput = screen.getByLabelText<HTMLInputElement>(/^fecha$/i);
    const selectedDate = dateInput.value;

    // The form lives in a modal now — closed until "Nueva cita" is clicked.
    expect(screen.queryByRole('form', { name: /agendar cita/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /nueva cita/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('form', { name: /agendar cita/i })).toBeInTheDocument();

    const formDateInput = screen.getByLabelText<HTMLInputElement>(/^fecha$/i, {
      selector: '#appointment-date',
    });
    expect(formDateInput.value).toBe(selectedDate);
  });

  it('defaults to Mes (calendar) view; switching to Semana fetches the week range and renders WeekAgenda', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValue([]);
    const user = userEvent.setup();

    render(<AgendaView token="tok" />);
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /^mes$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^semana$/i })).toHaveAttribute('aria-pressed', 'false');

    const dateInput = screen.getByLabelText<HTMLInputElement>(/^fecha$/i);
    await user.clear(dateInput);
    await user.type(dateInput, '2026-03-11');
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());

    mockedListAppointments.mockClear();
    await user.click(screen.getByRole('button', { name: /^semana$/i }));

    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
    const params = mockedListAppointments.mock.calls.at(-1)![1];
    const expected = localWeekRange('2026-03-11');
    expect(params.from).toBe(expected.from);
    expect(params.to).toBe(expected.to);
    // Default provider filter is "Todos" ('') → no providerId sent.
    expect(params.providerId).toBeUndefined();

    expect(screen.getByRole('button', { name: /^semana$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByLabelText(/agenda de la semana/i)).toBeInTheDocument();
  });

  it('shows a SectionError with a retry button (not a bare alert) when Semana fails to load, and the retry re-fetches (escalón 1)', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValueOnce([]); // month mount
    const user = userEvent.setup();

    render(<AgendaView token="tok" />);
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());

    mockedListAppointments.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));
    await user.click(screen.getByRole('button', { name: /^semana$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar la agenda.');
    // `SectionError` renders its own retry button next to the message — no
    // naked red text with nothing to press.
    const retryButton = within(alert).getByRole('button', { name: /reintentar/i });

    mockedListAppointments.mockResolvedValueOnce([]);
    await user.click(retryButton);

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await screen.findByLabelText(/agenda de la semana/i)).toBeInTheDocument();
  });

  it('shows a SectionError with a retry button when Mes (the default view) fails to load, and the retry re-fetches (fix ronda 1: Mes/Día no tenían onRetry)', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));
    const user = userEvent.setup();

    render(<AgendaView token="tok" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar la agenda.');
    const retryButton = within(alert).getByRole('button', { name: /reintentar/i });

    mockedListAppointments.mockResolvedValueOnce([]);
    await user.click(retryButton);

    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('clicking a day header in Semana view switches back to Día view with that date selected', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValue([]);
    const user = userEvent.setup();

    render(<AgendaView token="tok" />);
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());

    const dateInput = screen.getByLabelText<HTMLInputElement>(/^fecha$/i);
    await user.clear(dateInput);
    await user.type(dateInput, '2026-03-11');
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /^semana$/i }));
    await screen.findByLabelText(/agenda de la semana/i);

    const mondayHeader = screen
      .getAllByTestId('week-day-header')
      .find((h) => h.getAttribute('data-date') === '2026-03-09') as HTMLElement;
    await user.click(mondayHeader);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^día$/i })).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(dateInput.value).toBe('2026-03-09');
    // Back in Día view (columnas por profesional, DX-121) — with no
    // appointments mocked for this test, each column's empty state confirms
    // it's the one rendering (WeekAgenda has no such copy).
    expect(await screen.findAllByText('Sin citas hoy')).toHaveLength(staff.length);
    expect(screen.queryByLabelText(/agenda de la semana/i)).not.toBeInTheDocument();
  });

  it('week mode: clicking an empty slot opens the form prefilled with that date and time', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValue([]);
    mockedListPatients.mockResolvedValue(patientsPage);
    const user = userEvent.setup();

    render(<AgendaView token="tok" />);
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());

    const dateInput = screen.getByLabelText<HTMLInputElement>(/^fecha$/i);
    await user.clear(dateInput);
    await user.type(dateInput, '2026-03-11');
    await user.click(screen.getByRole('button', { name: /^semana$/i }));
    await screen.findByLabelText(/agenda de la semana/i);

    // Click en el hueco de las 09:00 del lunes 2026-03-09.
    await user.click(screen.getByTestId('week-grid-slot-2026-03-09-09:00'));

    // El form se abre pre-rellenado (fecha del slot + hora inicio 09:00).
    const formDate = await screen.findByLabelText<HTMLInputElement>(/^fecha$/i, {
      selector: '#appointment-date',
    });
    expect(formDate.value).toBe('2026-03-09');
    const startInput = document.querySelector<HTMLInputElement>('#appointment-start-time')!;
    expect(startInput.value).toBe('09:00');
  });

  it('DX-247: al abrir la cita de un paciente con profilaxis antibiótica el detalle avisa «Requiere premedicación»', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValue([
      {
        ...apt1,
        medicalAlerts: {
          hasCriticalAlert: true,
          requiresPremedication: true,
          anamnesisStatus: 'EXPIRED',
          alerts: ['profilaxisAntibiotica'],
          anamnesisReviewedAt: '2025-01-10T00:00:00.000Z',
        },
      },
    ]);
    const user = userEvent.setup();
    render(<AgendaView token="tok" />);
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
    const dateInput = screen.getByLabelText<HTMLInputElement>(/^fecha$/i);
    await user.clear(dateInput);
    await user.type(dateInput, '2026-03-11');
    await user.click(screen.getByRole('button', { name: /^semana$/i }));
    await screen.findByLabelText(/agenda de la semana/i);
    expect(screen.getByTestId('medical-alert-indicator')).toHaveAttribute('data-severity', 'critical');

    await user.click(screen.getByTestId('week-grid-appointment'));
    expect(await screen.findByTestId('premedication-notice')).toHaveTextContent('Requiere premedicación');
    expect(screen.getByTestId('appointment-medical-alerts')).toHaveTextContent(
      'Anamnesis caducada · última revisión 10/01/2025',
    );
  });

  it('week mode: the detail panel\'s status select reflects the server-confirmed status, not an optimistic one — a failed PATCH leaves it showing the real (unchanged) status', async () => {
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValue([apt1]);

    // The PATCH itself is deferred (and later rejected) so the test can
    // assert the select's value WHILE the PATCH is in flight and AFTER it
    // fails — it must never jump to the picked value optimistically.
    let rejectPatch!: (err: unknown) => void;
    const patchPromise = new Promise<typeof apt1>((_resolve, reject) => {
      rejectPatch = reject;
    });
    mockedUpdateAppointment.mockReturnValue(patchPromise);

    const user = userEvent.setup();
    render(<AgendaView token="tok" />);
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());

    const dateInput = screen.getByLabelText<HTMLInputElement>(/^fecha$/i);
    await user.clear(dateInput);
    await user.type(dateInput, '2026-03-11');
    await user.click(screen.getByRole('button', { name: /^semana$/i }));
    await screen.findByLabelText(/agenda de la semana/i);

    await user.click(screen.getByTestId('week-grid-appointment'));

    const statusSelect = await screen.findByRole('combobox', { name: /^Estado: / });
    expect(statusSelect).toHaveTextContent('Agendada');

    await pickStatus(user, statusSelect, 'Confirmada');

    // PATCH is in flight: the select stays bound to the (unchanged)
    // server-confirmed status from `appointments`, and is disabled.
    expect(statusSelect).toHaveTextContent('Agendada');
    expect(statusSelect).toBeDisabled();

    rejectPatch(new Error('boom'));
    // Sync point: the status failure is now a toast (rung 3), not a
    // role="alert" in this tree — wait on the select re-enabling instead,
    // which only happens once the failure has actually landed.
    await waitFor(() => expect(statusSelect).not.toBeDisabled());

    // After the failure: re-enabled, and still showing the real status —
    // no optimistic leak.
    expect(statusSelect).not.toBeDisabled();
    expect(statusSelect).toHaveTextContent('Agendada');
  });

  // DX-153: la línea de cobertura del detalle (nunca el número de afiliado).
  it.each([
    [
      'vencida',
      { status: 'EXPIRED' as const, payerName: 'Sura EPS', planName: 'Plan Oro', validTo: '2026-01-31' },
      'Cobertura: Sura EPS · venció el 31/01/2026',
    ],
    [
      'vigente con plan',
      { status: 'ACTIVE' as const, payerName: 'Sura EPS', planName: 'Plan Oro', validTo: null },
      'Cobertura: Sura EPS · Plan Oro',
    ],
    [
      'pendiente de inicio',
      { status: 'NOT_STARTED' as const, payerName: 'Sura EPS', planName: 'Plan Oro', validTo: null },
      'Cobertura: Sura EPS · pendiente de inicio',
    ],
  ])('Día: el detalle muestra la línea de cobertura (%s)', async (_label, coverage, expected) => {
    const future = new Date(Date.now() + 3 * 24 * 3600_000);
    const day = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    const start = new Date(`${day}T09:00:00`).toISOString();
    const end = new Date(`${day}T09:30:00`).toISOString();
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValue([
      appointment({ id: 'apt-cov', start, end, patientFirstName: 'María', coverage }),
    ]);
    const user = userEvent.setup();

    render(<AgendaView token="tok" />);
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /^día$/i }));
    const dateInput = screen.getByLabelText(/^fecha$/i);
    await user.clear(dateInput);
    await user.type(dateInput, day);

    const [detail] = await screen.findAllByRole('button', { name: /detalle de la cita de 09:00–09:30/i });
    await user.click(detail);

    expect(await screen.findByTestId('coverage-detail-line')).toHaveTextContent(expected);
  });

  it('Día: sin cobertura, el detalle no pinta la línea', async () => {
    const future = new Date(Date.now() + 3 * 24 * 3600_000);
    const day = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    const start = new Date(`${day}T09:00:00`).toISOString();
    const end = new Date(`${day}T09:30:00`).toISOString();
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValue([
      appointment({
        id: 'apt-nocov',
        start,
        end,
        patientFirstName: 'María',
        coverage: { status: 'NONE', payerName: null, planName: null, validTo: null },
      }),
    ]);
    const user = userEvent.setup();

    render(<AgendaView token="tok" />);
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /^día$/i }));
    const dateInput = screen.getByLabelText(/^fecha$/i);
    await user.clear(dateInput);
    await user.type(dateInput, day);

    const [detail] = await screen.findAllByRole('button', { name: /detalle de la cita de 09:00–09:30/i });
    await user.click(detail);

    await screen.findByLabelText(/estado/i);
    expect(screen.queryByTestId('coverage-detail-line')).not.toBeInTheDocument();
  });

  // DX-005: "Enviar confirmación" vive en el detalle de la cita, que ahora
  // también se abre desde las filas del Día (botón "Detalle").
  it('Día: "Detalle" abre la cita; "Enviar confirmación" genera el enlace y la agenda se refresca para mostrar "Confirmación pendiente"', async () => {
    const future = new Date(Date.now() + 3 * 24 * 3600_000);
    const day = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    const start = new Date(`${day}T09:00:00`).toISOString();
    const end = new Date(`${day}T09:30:00`).toISOString();
    const pendingApt = appointment({ id: 'apt-c', start, end, patientFirstName: 'María' });
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValue([pendingApt]);
    mockedCreateConfirmationLink.mockResolvedValue({
      url: 'http://demo.localhost:3001/confirmar/tok',
      expiresAt: start,
      whatsappPhone: '573105550101',
      appointment: {
        patientFirstName: 'María',
        start,
        end,
        providerName: 'Dra. Ana Ríos',
        locationName: 'Sede principal',
        locationAddress: null,
      },
    });
    const user = userEvent.setup();

    render(<AgendaView token="tok" />);
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /^día$/i }));
    const dateInput = screen.getByLabelText(/^fecha$/i);
    await user.clear(dateInput);
    await user.type(dateInput, day);

    const [detail] = await screen.findAllByRole('button', { name: /detalle de la cita de 09:00–09:30/i });
    await user.click(detail);

    // Tras generar, el refresh trae la cita ya marcada como pendiente.
    mockedListAppointments.mockResolvedValue([
      { ...pendingApt, confirmationSentAt: new Date().toISOString() },
    ]);
    await user.click(await screen.findByRole('button', { name: 'Enviar confirmación' }));

    await waitFor(() => expect(mockedCreateConfirmationLink).toHaveBeenCalledWith('tok', 'apt-c'));
    expect(await screen.findByLabelText('Enlace de confirmación')).toHaveValue(
      'http://demo.localhost:3001/confirmar/tok',
    );
    expect(screen.getByRole('link', { name: /abrir whatsapp/i })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/wa\.me\/573105550101\?text=/),
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('appointment-confirmation-indicator').length).toBeGreaterThan(0),
    );
    // El enlace sigue a la vista tras el refresh (el panel no se remonta).
    expect(screen.getByLabelText('Enlace de confirmación')).toBeInTheDocument();
    // DX-026: el mismo detalle enseña el estado de sus recordatorios.
    expect(getAppointmentReminders).toHaveBeenCalledWith('tok', 'apt-c');
    expect(
      screen.getByRole('heading', { name: 'Recordatorios por email' }),
    ).toBeInTheDocument();
    // DX-222: sin un rol legible en la sesión no se ofrecen las indicaciones.
    expect(screen.queryByRole('heading', { name: 'Indicaciones' })).not.toBeInTheDocument();
  });

  // DX-222: «Indicaciones» en el detalle de la cita, para cualquier rol de la clínica.
  it('el detalle de la cita monta el panel «Indicaciones» de esa cita', async () => {
    const receptionToken = `h.${btoa(JSON.stringify({ sub: 'u1', tenantId: 't1', role: 'RECEPTION' }))}.s`;
    const future = new Date(Date.now() + 3 * 24 * 3600_000);
    const day = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    const start = new Date(`${day}T09:00:00`).toISOString();
    const end = new Date(`${day}T09:30:00`).toISOString();
    mockedListStaff.mockResolvedValue(staff);
    mockedListAppointments.mockResolvedValue([appointment({ id: 'apt-p', start, end })]);
    const user = userEvent.setup();
    // Dos hermanos con la misma `key` hacen que React duplique paneles al
    // re-renderizar (el de confirmación salía repetido tras «Enviar confirmación»).
    const consoleError = jest.spyOn(console, 'error');

    render(<AgendaView token={receptionToken} />);
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /^día$/i }));
    const dateInput = screen.getByLabelText(/^fecha$/i);
    await user.clear(dateInput);
    await user.type(dateInput, day);
    const [detail] = await screen.findAllByRole('button', { name: /detalle de la cita de 09:00–09:30/i });
    await user.click(detail);

    expect(await screen.findByRole('region', { name: 'Indicaciones' })).toBeInTheDocument();
    expect(getAppointmentPostOp).toHaveBeenCalledWith(receptionToken, 'apt-p');
    expect(await screen.findByText('No hay indicaciones para esta cita')).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Confirmación del paciente' })).toHaveLength(1);
    const duplicateKeys = consoleError.mock.calls.filter((args) =>
      args.some((a) => typeof a === 'string' && a.includes('same key')),
    );
    expect(duplicateKeys).toEqual([]);
    consoleError.mockRestore();
  });

  // DX-121: vista Día en columnas por profesional.
  describe('Día en columnas', () => {
    // Token de clínica legible con rol de recepción (el arrastre y «Mover a…»
    // solo se pintan para quien puede mover citas).
    const receptionToken = `h.${btoa(JSON.stringify({ sub: 'u1', tenantId: 't1', role: 'RECEPTION' }))}.s`;
    const team = [
      ...staff,
      { userId: 'staff-3', fullName: 'Rita Recepción', role: 'RECEPTION' as const, locationIds: null },
    ];

    it('por defecto, una columna por odontólogo/administración y pide sus citas con providerIds', async () => {
      mockedListStaff.mockResolvedValue(team);
      mockedListAppointments.mockResolvedValue([]);
      const user = userEvent.setup();
      render(<AgendaView token="tok" />);
      await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());

      await user.click(screen.getByRole('button', { name: /^día$/i }));

      expect(await screen.findAllByTestId('day-column')).toHaveLength(2);
      const params = mockedListAppointments.mock.calls.at(-1)![1];
      expect(params.providerIds).toEqual(['staff-1', 'staff-2']);
      expect(params.providerId).toBeUndefined();
      expect(screen.getByRole('button', { name: /profesionales en columnas/i })).toHaveTextContent(
        '2 profesionales',
      );
    });

    // DX-089: con una sede activa, las columnas por defecto son los clínicos
    // que trabajan en ella (o en todas); si ninguno, como antes.
    describe('con una sede activa (DX-089)', () => {
      afterEach(() => window.localStorage.clear());
      const porSede = [
        { userId: 'staff-1', fullName: 'Dra. Norte', role: 'DENTIST' as const, locationIds: ['loc-2'] },
        { userId: 'staff-2', fullName: 'Dr. Todas', role: 'ADMIN' as const, locationIds: null },
        { userId: 'staff-4', fullName: 'Dr. Sur', role: 'DENTIST' as const, locationIds: ['loc-3'] },
      ];

      it('solo los profesionales de esa sede o de todas', async () => {
        window.localStorage.setItem('dentalix.activeLocationId', 'loc-2');
        mockedListStaff.mockResolvedValue(porSede);
        mockedListAppointments.mockResolvedValue([]);
        const user = userEvent.setup();
        render(<AgendaView token="tok" />);
        await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());

        await user.click(screen.getByRole('button', { name: /^día$/i }));

        expect(await screen.findAllByTestId('day-column')).toHaveLength(2);
        expect(mockedListAppointments.mock.calls.at(-1)![1].providerIds).toEqual([
          'staff-1',
          'staff-2',
        ]);
      });

      it('si nadie trabaja en esa sede, vuelve a todos los clínicos', async () => {
        window.localStorage.setItem('dentalix.activeLocationId', 'loc-9');
        mockedListStaff.mockResolvedValue(porSede.filter((m) => m.locationIds !== null));
        mockedListAppointments.mockResolvedValue([]);
        const user = userEvent.setup();
        render(<AgendaView token="tok" />);
        await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());

        await user.click(screen.getByRole('button', { name: /^día$/i }));

        expect(await screen.findAllByTestId('day-column')).toHaveLength(2);
        expect(mockedListAppointments.mock.calls.at(-1)![1].providerIds).toEqual([
          'staff-1',
          'staff-4',
        ]);
      });
    });

    it('«Mover a…» mueve la cita con un PATCH y refresca; un 409 deja todo como estaba', async () => {
      const future = new Date(Date.now() + 3 * 24 * 3600_000);
      const day = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
      const apt = appointment({
        id: 'apt-m',
        patientFirstName: 'María',
        start: new Date(`${day}T09:00:00`).toISOString(),
        end: new Date(`${day}T09:30:00`).toISOString(),
      });
      mockedListStaff.mockResolvedValue(staff);
      mockedListAppointments.mockResolvedValue([apt]);
      mockedUpdateAppointment.mockRejectedValueOnce(
        new ApiError(409, 'El profesional ya tiene una cita en ese horario'),
      );
      const user = userEvent.setup();
      render(
        <>
          <AgendaView token={receptionToken} />
          <Toaster />
        </>,
      );
      await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
      await user.click(screen.getByRole('button', { name: /^día$/i }));
      const dateInput = screen.getByLabelText(/^fecha$/i);
      await user.clear(dateInput);
      await user.type(dateInput, day);

      await user.click(await screen.findByRole('button', { name: 'Mover a… la cita de María' }));
      await user.selectOptions(screen.getByLabelText('Profesional', { selector: '#move-provider' }), 'staff-2');
      await user.click(screen.getByRole('button', { name: 'Mover cita' }));

      expect(await screen.findByText('El profesional ya tiene una cita en ese horario')).toBeInTheDocument();
      expect(mockedUpdateAppointment).toHaveBeenCalledWith(receptionToken, 'apt-m', {
        start: apt.start,
        end: apt.end,
        providerId: 'staff-2',
      });

      // Segundo intento: el servidor acepta y la agenda se refresca.
      mockedUpdateAppointment.mockResolvedValueOnce({ ...apt, providerId: 'staff-2' });
      mockedListAppointments.mockResolvedValue([{ ...apt, providerId: 'staff-2' }]);
      const calls = mockedListAppointments.mock.calls.length;
      await user.click(screen.getByRole('button', { name: 'Mover cita' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(mockedListAppointments.mock.calls.length).toBeGreaterThan(calls));
      const [, second] = screen.getAllByTestId('day-column');
      expect(await within(second).findByText('María')).toBeInTheDocument();
      // Con el modal cerrado, quien usa teclado o lector de pantalla necesita
      // saber que el movimiento se guardó.
      expect(await screen.findByText('Cita movida.')).toBeInTheDocument();
    });
  });

  // DX-233: el horario de cada profesional en la sede activa.
  describe('horario del profesional (DX-233)', () => {
    afterEach(() => {
      window.localStorage.clear();
      (getRoster as jest.Mock).mockReset().mockResolvedValue({
        from: '2026-01-01',
        to: '2026-01-01',
        locationId: null,
        locations: [],
        providers: [],
      });
    });

    function rosterDay(date: string, worksAtLocation: boolean, locationRanges: { startMinute: number; endMinute: number }[] | null) {
      return { date, weekday: 2, unrestricted: false, assignments: [], worksAtLocation, locationRanges };
    }

    it('oculta a quien no atiende ese día en la sede, con «Mostrar todos», y sombrea fuera de su horario', async () => {
      window.localStorage.setItem('dentalix.activeLocationId', 'loc-1');
      mockedListStaff.mockResolvedValue(staff);
      mockedListAppointments.mockResolvedValue([]);
      (getRoster as jest.Mock).mockImplementation((_t: string, params: { weekStart: string }) =>
        Promise.resolve({
          from: params.weekStart,
          to: params.weekStart,
          locationId: 'loc-1',
          locations: [{ id: 'loc-1', name: 'Sede principal', timeZone: 'America/Bogota' }],
          providers: [
            {
              providerId: 'staff-1',
              fullName: 'Dra. Ana Ríos',
              role: 'DENTIST',
              configured: true,
              days: [rosterDay(params.weekStart, true, [{ startMinute: 9 * 60, endMinute: 13 * 60 }])],
            },
            {
              providerId: 'staff-2',
              fullName: 'Dr. Luis Gómez',
              role: 'DENTIST',
              configured: true,
              days: [rosterDay(params.weekStart, false, [])],
            },
          ],
        }),
      );
      const user = userEvent.setup();
      render(<AgendaView token="tok" />);
      await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
      await user.click(screen.getByRole('button', { name: /^día$/i }));

      await waitFor(() => expect(screen.getAllByTestId('day-column')).toHaveLength(1));
      expect(getRoster).toHaveBeenLastCalledWith('tok', expect.objectContaining({ days: 1, locationId: 'loc-1' }));
      const [only] = screen.getAllByTestId('day-column');
      expect(only).toHaveAttribute('data-provider-id', 'staff-1');
      expect(within(only).getAllByTestId('provider-off-band').length).toBeGreaterThan(0);

      const toggle = screen.getByRole('checkbox', { name: /mostrar todos/i });
      expect(screen.getByText('1 profesional no atiende este día en esta sede.')).toBeInTheDocument();
      await user.click(toggle);
      expect(screen.getAllByTestId('day-column')).toHaveLength(2);
    });

    it('con «Todas las sedes» no pide el cuadrante ni oculta a nadie', async () => {
      mockedListStaff.mockResolvedValue(staff);
      mockedListAppointments.mockResolvedValue([]);
      const user = userEvent.setup();
      render(<AgendaView token="tok" />);
      await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
      await user.click(screen.getByRole('button', { name: /^día$/i }));
      expect(await screen.findAllByTestId('day-column')).toHaveLength(2);
      expect(getRoster).not.toHaveBeenCalled();
      expect(screen.queryByRole('checkbox', { name: /mostrar todos/i })).not.toBeInTheDocument();
    });
  });

  describe('bloqueos y pendientes (DX-122)', () => {
    const mockedListBlocks = listScheduleBlocks as jest.MockedFunction<typeof listScheduleBlocks>;
    const mockedDeleteBlock = deleteScheduleBlock as jest.MockedFunction<typeof deleteScheduleBlock>;
    const mockedListWaitlist = listWaitlist as jest.MockedFunction<typeof listWaitlist>;
    const tokenFor = (role: string) =>
      `h.${btoa(JSON.stringify({ sub: 'u1', tenantId: 't1', role }))}.s`;
    // TST-020: «hoy» fijo. Con el reloj real, una corrida que cruza las 00:00
    // calculaba `today` un día y pintaba la agenda al siguiente.
    const FIXED_NOW = new Date(2026, 5, 15, 12, 0, 0);
    const today = (() => {
      const d = FIXED_NOW;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const lunch = {
      id: 'b-1',
      tenantId: 't1',
      providerId: null,
      locationId: null,
      start: new Date(`${today}T13:00:00`).toISOString(),
      end: new Date(`${today}T14:00:00`).toISOString(),
      kind: 'LUNCH' as const,
      allowsBooking: true,
      note: null,
      createdById: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    beforeEach(() => {
      fakeDateOnly(FIXED_NOW);
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    beforeEach(() => {
      mockedListBlocks.mockReset().mockResolvedValue([lunch]);
      mockedDeleteBlock.mockReset().mockResolvedValue(undefined);
      mockedListWaitlist.mockReset().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 });
      mockedListStaff.mockResolvedValue(staff);
      mockedListAppointments.mockResolvedValue([]);
    });

    it('Día: pinta los bloqueos del día y recepción puede quitarlos con confirmación', async () => {
      const user = userEvent.setup();
      render(<AgendaView token={tokenFor('RECEPTION')} />);
      await user.click(screen.getByRole('button', { name: /^día$/i }));

      expect(await screen.findAllByTestId('schedule-block')).toHaveLength(2);
      const range = mockedListBlocks.mock.calls.at(-1)![1];
      expect(range).toEqual(localDayRange(today));

      await user.click(screen.getAllByRole('button', { name: /^Quitar bloqueo: Almuerzo/ })[0]);
      const dialog = await screen.findByRole('dialog', { name: 'Quitar el bloqueo' });
      const calls = mockedListBlocks.mock.calls.length;
      await user.click(within(dialog).getByRole('button', { name: 'Quitar bloqueo' }));
      await waitFor(() => expect(mockedDeleteBlock).toHaveBeenCalledWith(tokenFor('RECEPTION'), 'b-1'));
      await waitFor(() => expect(mockedListBlocks.mock.calls.length).toBeGreaterThan(calls));
    });

    it('«Bloquear horario» solo para quien puede bloquear (no la asistente)', async () => {
      const { unmount } = render(<AgendaView token={tokenFor('ASSISTANT')} />);
      await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: 'Bloquear horario' })).not.toBeInTheDocument();
      unmount();

      const user = userEvent.setup();
      render(<AgendaView token={tokenFor('RECEPTION')} />);
      await user.click(await screen.findByRole('button', { name: 'Bloquear horario' }));
      expect(await screen.findByRole('dialog', { name: 'Bloquear horario' })).toBeInTheDocument();
    });

    it('cancelar una cita recarga «Pendientes por agendar»', async () => {
      const apt = appointment({ id: 'apt-c', start: new Date(`${today}T09:00:00`).toISOString(), end: new Date(`${today}T09:30:00`).toISOString() });
      mockedListAppointments.mockResolvedValue([apt]);
      mockedUpdateAppointment.mockResolvedValue({ ...apt, status: 'CANCELLED' });
      const user = userEvent.setup();
      render(<AgendaView token={tokenFor('RECEPTION')} />);
      await user.click(screen.getByRole('button', { name: /^día$/i }));
      await user.click(screen.getByRole('button', { name: 'Lista' }));
      await waitFor(() => expect(mockedListWaitlist).toHaveBeenCalled());
      const before = mockedListWaitlist.mock.calls.length;

      const [select] = await screen.findAllByTestId('appointment-status-select');
      await pickStatus(user, select, 'Cancelada');
      // DX-279: cancelar pide origen y motivo, y avisa si es tardía.
      const dialog = await screen.findByRole('dialog', { name: /Cancelar la cita de/ });
      expect(mockedUpdateAppointment).not.toHaveBeenCalled();
      await user.click(within(dialog).getByLabelText(/El paciente avisa/));
      expect(await within(dialog).findByTestId('late-cancellation-warning')).toHaveTextContent(
        'Cancelación tardía: aviso de 5 h, la política pide 24 h',
      );
      await user.selectOptions(within(dialog).getByLabelText('Motivo'), 'ILLNESS');
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar la cita' }));
      expect(mockedUpdateAppointment).toHaveBeenCalledWith(expect.any(String), 'apt-c', {
        status: 'CANCELLED',
        cancelledByKind: 'STAFF_FOR_PATIENT',
        cancelReasonCode: 'ILLNESS',
      });
      await waitFor(() => expect(mockedListWaitlist.mock.calls.length).toBeGreaterThan(before));
    });

    it('con el teclado, Enter sobre «Cancelada» abre el diálogo y Esc lo cierra sin cambiar nada, con el foco en el selector (QA 14)', async () => {
      const apt = appointment({ id: 'apt-k', start: new Date(`${today}T09:00:00`).toISOString(), end: new Date(`${today}T09:30:00`).toISOString() });
      mockedListAppointments.mockResolvedValue([apt]);
      const user = userEvent.setup();
      render(<AgendaView token={tokenFor('RECEPTION')} />);
      await user.click(screen.getByRole('button', { name: /^día$/i }));
      await user.click(screen.getByRole('button', { name: 'Lista' }));
      const [select] = await screen.findAllByTestId('appointment-status-select');
      select.focus();
      await user.keyboard('{ArrowDown}');
      const option = await screen.findByRole('option', { name: 'Cancelada' });
      option.focus();
      await user.keyboard('{Enter}');
      const dialog = await screen.findByRole('dialog', { name: /Cancelar la cita de/ });
      await user.keyboard('{Escape}');
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      await waitFor(() => expect(select).toHaveFocus());
      expect(select).toHaveTextContent('Agendada');
      expect(mockedUpdateAppointment).not.toHaveBeenCalled();
    });
  });
  // DX-170: la evolución se registra desde la tarjeta de la cita.
  describe('«Registrar evolución» (DX-170)', () => {
    const tokenFor = (role: string) =>
      `h.${btoa(JSON.stringify({ sub: 'staff-1', tenantId: 't1', role }))}.s`;
    const completed = appointment({
      id: 'apt-done',
      status: 'COMPLETED',
      patientFirstName: 'María',
      patientLastName: 'López',
    });

    async function openDetail(token: string) {
      mockedListStaff.mockResolvedValue(staff);
      mockedListAppointments.mockResolvedValue([completed]);
      const user = userEvent.setup();
      render(<AgendaView token={token} />);
      await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
      const dateInput = screen.getByLabelText<HTMLInputElement>(/^fecha$/i);
      await user.clear(dateInput);
      await user.type(dateInput, '2026-03-11');
      await user.click(screen.getByRole('button', { name: /^semana$/i }));
      await screen.findByLabelText(/agenda de la semana/i);
      await user.click(screen.getByTestId('week-grid-appointment'));
      await screen.findByLabelText(/^estado$/i);
      return user;
    }

    it('DENTIST lo ve en una cita atendida y abre el formulario ligado a la cita', async () => {
      const user = await openDetail(tokenFor('DENTIST'));
      await user.click(screen.getByRole('button', { name: 'Registrar evolución' }));
      const dialog = await screen.findByRole('dialog', { name: 'Registrar evolución' });
      expect(within(dialog).getByText(/^Cita del \d{2}\/\d{2} · Dra\. Ana Ríos$/)).toBeInTheDocument();
    });

    it('RECEPTION no ve el botón', async () => {
      await openDetail(tokenFor('RECEPTION'));
      expect(screen.queryByRole('button', { name: 'Registrar evolución' })).toBeNull();
    });
  });
  // DX-295: el selector de estado del detalle no cambia la cita al moverse con
  // las flechas; solo con Enter o con un clic en una opción.
  describe('selector de estado del detalle con teclado (DX-295)', () => {
    const tokenFor = (role: string) =>
      `h.${btoa(JSON.stringify({ sub: 'staff-1', tenantId: 't1', role }))}.s`;

    async function openDetail(token: string, apt: ReturnType<typeof appointment>) {
      mockedListStaff.mockResolvedValue(staff);
      mockedListAppointments.mockResolvedValue([apt]);
      const user = userEvent.setup();
      render(<AgendaView token={token} />);
      await waitFor(() => expect(mockedListAppointments).toHaveBeenCalled());
      const dateInput = screen.getByLabelText<HTMLInputElement>(/^fecha$/i);
      await user.clear(dateInput);
      await user.type(dateInput, '2026-03-11');
      await user.click(screen.getByRole('button', { name: /^semana$/i }));
      await screen.findByLabelText(/agenda de la semana/i);
      await user.click(screen.getByTestId('week-grid-appointment'));
      const trigger = await screen.findByRole('combobox', { name: /^Estado: / });
      return { user, trigger };
    }

    it('↑/↓ no envían ningún PATCH; Enter aplica la opción enfocada', async () => {
      mockedUpdateAppointment.mockResolvedValue({ ...apt1, status: 'CONFIRMED' });
      const { user, trigger } = await openDetail(tokenFor('RECEPTION'), apt1);
      expect(trigger).toHaveAccessibleName('Estado: Agendada');

      trigger.focus();
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowUp}{ArrowDown}{ArrowUp}');
      expect(screen.getByRole('option', { name: 'Confirmada' })).toHaveFocus();
      expect(mockedUpdateAppointment).not.toHaveBeenCalled();

      await user.keyboard('{Enter}');
      await waitFor(() =>
        expect(mockedUpdateAppointment).toHaveBeenCalledWith(tokenFor('RECEPTION'), 'apt-1', {
          status: 'CONFIRMED',
        }),
      );
      expect(mockedUpdateAppointment).toHaveBeenCalledTimes(1);
    });

    it('Esc tras recorrer la lista no cambia nada', async () => {
      const { user, trigger } = await openDetail(tokenFor('RECEPTION'), apt1);
      trigger.focus();
      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(trigger).toHaveTextContent('Agendada');
      expect(mockedUpdateAppointment).not.toHaveBeenCalled();
    });

    it('salir de «Completada» con Enter sigue abriendo el diálogo del motivo, sin PATCH', async () => {
      const completed = appointment({ id: 'apt-done', status: 'COMPLETED' });
      const { user, trigger } = await openDetail(tokenFor('ADMIN'), completed);
      trigger.focus();
      // La lista abre en «Completada»; ↑ lleva a «Confirmada».
      await user.keyboard('{ArrowDown}{ArrowUp}');
      expect(mockedUpdateAppointment).not.toHaveBeenCalled();
      await user.keyboard('{Enter}');
      expect(
        await screen.findByRole('dialog', { name: '¿Pasar la cita completada a «Confirmada»?' }),
      ).toBeInTheDocument();
      expect(mockedUpdateAppointment).not.toHaveBeenCalled();
    });
  });
  // DX-210: cableado de «Ocupar este hueco» en la vista Día.
  describe('«Ocupar este hueco» (DX-210)', () => {
    const mockedListLocations = listLocations as jest.MockedFunction<typeof listLocations>;
    const mockedSchedule = getLocationSchedule as jest.MockedFunction<typeof getLocationSchedule>;
    const mockedCandidates = listOpeningCandidates as jest.MockedFunction<typeof listOpeningCandidates>;
    const mockedScheduleFromWaitlist = scheduleFromWaitlist as jest.MockedFunction<
      typeof scheduleFromWaitlist
    >;
    const tokenFor = (role: string, sub = 'u1') =>
      `h.${btoa(JSON.stringify({ sub, tenantId: 't1', role }))}.s`;
    // Lunes 15/06/2026 a mediodía (hora local): la tarde queda libre.
    const FIXED_NOW = new Date(2026, 5, 15, 12, 0, 0);
    const today = '2026-06-15';
    const hours = {
      timezone: 'America/Bogota',
      ranges: [{ weekday: FIXED_NOW.getDay(), startMinute: 14 * 60, endMinute: 18 * 60 }],
    };
    const sedes = [
      { id: 'loc-1', name: 'Sede principal', isActive: true },
      { id: 'loc-2', name: 'Sede Norte', isActive: true },
    ];
    const candidate = {
      kind: 'WAITLIST' as const,
      patientId: 'pat-9',
      patientFirstName: 'Ana',
      patientLastName: 'Ríos',
      phone: null,
      whatsappPhone: null,
      whatsappBlocked: true,
      whatsappBlockedReason: 'NO_OPT_IN' as const,
      waitlistEntryId: 'wl-9',
      appointmentId: null,
      priority: 'URGENT' as const,
      durationMinutes: 30,
      appointmentType: null,
      reason: null,
      preferredWindow: null,
      providerId: null,
      currentAppointment: null,
      waitingSince: '2026-06-01T00:00:00.000Z',
      offersToday: 0,
      offeredForSlot: false,
      pendingOfferId: null,
    };

    beforeEach(() => {
      fakeDateOnly(FIXED_NOW);
      mockedListStaff.mockResolvedValue(staff);
      mockedListAppointments.mockResolvedValue([]);
      mockedCandidates.mockReset();
    });
    afterEach(() => {
      jest.useRealTimers();
      window.localStorage.clear();
      mockedListLocations.mockResolvedValue([{ id: 'loc-1', name: 'Sede principal' }] as never);
      mockedSchedule.mockResolvedValue(null);
    });

    it('un hueco libre de la columna abre el panel con la sede activa y su profesional; «Asignar» refresca la agenda', async () => {
      window.localStorage.setItem('dentalix.activeLocationId', 'loc-2');
      mockedListLocations.mockResolvedValue(sedes as never);
      mockedSchedule.mockResolvedValue(hours);
      mockedCandidates.mockImplementation((_t, slot) =>
        Promise.resolve({
          ...slot,
          timeZone: 'America/Bogota',
          providerOffSchedule: false,
          offerCap: 2,
          items: [candidate],
          truncated: false,
        }),
      );
      mockedScheduleFromWaitlist.mockResolvedValue({
        ...appointment({ id: 'apt-new', start: new Date(`${today}T14:00:00`).toISOString() }),
        warnings: [],
      } as never);
      const user = userEvent.setup();
      render(
        <>
          <AgendaView token={tokenFor('RECEPTION')} />
          <Toaster />
        </>,
      );
      await user.click(screen.getByRole('button', { name: /^día$/i }));
      const [gap] = await screen.findAllByRole('button', {
        name: /^Ocupar el hueco libre de 14:00–18:00 · Dra\. Ana Ríos$/,
      });
      await user.click(gap);

      const panel = await screen.findByTestId('fill-opening-panel');
      expect(within(panel).getByText(/Sede Norte/)).toBeInTheDocument();
      expect(mockedCandidates).toHaveBeenCalledWith(tokenFor('RECEPTION'), {
        locationId: 'loc-2',
        providerId: 'staff-1',
        start: new Date(`${today}T14:00:00`).toISOString(),
        end: new Date(`${today}T18:00:00`).toISOString(),
      });

      const calls = mockedListAppointments.mock.calls.length;
      await user.click(await within(panel).findByRole('button', { name: 'Asignar el hueco a Ana Ríos' }));
      await waitFor(() =>
        expect(mockedScheduleFromWaitlist).toHaveBeenCalledWith(tokenFor('RECEPTION'), 'wl-9', {
          providerId: 'staff-1',
          start: new Date(`${today}T14:00:00`).toISOString(),
        }),
      );
      await waitFor(() => expect(screen.queryByTestId('fill-opening-panel')).not.toBeInTheDocument());
      await waitFor(() => expect(mockedListAppointments.mock.calls.length).toBeGreaterThan(calls));
      expect(await screen.findByText('La agenda ya muestra al paciente en el hueco.')).toBeInTheDocument();
    });

    it('«Todas las sedes» con varias sedes: sin huecos libres inventados; la cita cancelada usa SU sede', async () => {
      mockedListLocations.mockResolvedValue(sedes as never);
      mockedSchedule.mockResolvedValue(hours);
      mockedCandidates.mockResolvedValue({
        locationId: 'loc-2',
        providerId: 'staff-1',
        start: '',
        end: '',
        providerOffSchedule: false,
        timeZone: 'America/Bogota',
        offerCap: 2,
        items: [],
        truncated: false,
      });
      mockedListAppointments.mockResolvedValue([
        appointment({
          id: 'apt-x',
          patientFirstName: 'María',
          status: 'CANCELLED',
          locationId: 'loc-2',
          start: new Date(`${today}T15:00:00`).toISOString(),
          end: new Date(`${today}T15:30:00`).toISOString(),
        }),
      ]);
      const user = userEvent.setup();
      render(<AgendaView token={tokenFor('RECEPTION')} />);
      await user.click(screen.getByRole('button', { name: /^día$/i }));
      const fill = await screen.findByTestId('fill-cancelled');
      expect(screen.queryAllByTestId('free-gap')).toHaveLength(0);
      await user.click(fill);
      await waitFor(() =>
        expect(mockedCandidates).toHaveBeenCalledWith(
          tokenFor('RECEPTION'),
          expect.objectContaining({ locationId: 'loc-2', providerId: 'staff-1' }),
        ),
      );
    });

    it('el odontólogo solo tiene «Ocupar» en su columna; la asistente, en ninguna', async () => {
      mockedSchedule.mockResolvedValue(hours);
      const user = userEvent.setup();
      const { unmount } = render(<AgendaView token={tokenFor('DENTIST', 'staff-2')} />);
      await user.click(screen.getByRole('button', { name: /^día$/i }));
      const gaps = await screen.findAllByTestId('free-gap');
      expect(gaps.every((g) => /Dr\. Luis Gómez$/.test(g.getAttribute('aria-label') ?? ''))).toBe(true);
      unmount();

      render(<AgendaView token={tokenFor('ASSISTANT')} />);
      await user.click(screen.getByRole('button', { name: /^día$/i }));
      await screen.findAllByTestId('day-column');
      expect(screen.queryAllByTestId('free-gap')).toHaveLength(0);
    });
  });
});
