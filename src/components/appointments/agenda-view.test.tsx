import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgendaView } from './agenda-view';
import { localDayRange, localWeekRange } from '@/lib/appointments/day-range';
import { createAppointment, listAppointments, updateAppointment } from '@/lib/appointments/appointments-api';
import { listStaff } from '@/lib/appointments/staff-api';
import { listPatients } from '@/lib/patients/patients-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching odontogram-tab.test.tsx's / appointment-form.test.tsx's
// convention. Both `AgendaView` and the real (unmocked) `AppointmentForm` it
// renders import from these same modules, so one mock per module covers both.
jest.mock('../../lib/appointments/appointments-api', () => ({
  createAppointment: jest.fn(),
  listAppointments: jest.fn(),
  updateAppointment: jest.fn(),
}));
jest.mock('../../lib/appointments/staff-api', () => ({
  listStaff: jest.fn(),
}));
jest.mock('../../lib/patients/patients-api', () => ({
  listPatients: jest.fn(),
}));

const mockedCreateAppointment = createAppointment as jest.MockedFunction<typeof createAppointment>;
const mockedListAppointments = listAppointments as jest.MockedFunction<typeof listAppointments>;
const mockedUpdateAppointment = updateAppointment as jest.MockedFunction<typeof updateAppointment>;
const mockedListStaff = listStaff as jest.MockedFunction<typeof listStaff>;
const mockedListPatients = listPatients as jest.MockedFunction<typeof listPatients>;

const staff = [
  { userId: 'staff-1', fullName: 'Dra. Ana Ríos', role: 'DENTIST' as const },
  { userId: 'staff-2', fullName: 'Dr. Luis Gómez', role: 'DENTIST' as const },
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

describe('AgendaView', () => {
  beforeEach(() => {
    mockedCreateAppointment.mockReset();
    mockedListAppointments.mockReset();
    mockedUpdateAppointment.mockReset();
    mockedListStaff.mockReset();
    mockedListPatients.mockReset();
    mockedListPatients.mockResolvedValue(patientsPage);
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
      // #1 mount (month), #2 switching to Día — resolve immediately; #3 is the
      // deferred post-action refresh whose interim state the test asserts on.
      return callCount <= 2 ? Promise.resolve([apt1]) : refetch.promise;
    });

    const user = userEvent.setup();
    render(<AgendaView token="tok" />);

    // Switch to Día view — where the appointment table renders — then let the
    // initial load settle with the one appointment.
    await user.click(screen.getByRole('button', { name: /^día$/i }));
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
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalledTimes(3));
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
      // #1 mount (month), #2 switching to Día — resolve immediately; #3 is the
      // deferred post-action refresh whose interim state the test asserts on.
      return callCount <= 2 ? Promise.resolve([apt1]) : refetch.promise;
    });

    const user = userEvent.setup();
    render(<AgendaView token="tok" />);

    await user.click(screen.getByRole('button', { name: /^día$/i }));
    const table = await screen.findByRole('table', { name: /agenda del día/i });
    const statusSelect = within(table).getByRole<HTMLSelectElement>('combobox');
    expect(statusSelect.value).toBe('SCHEDULED');

    await user.selectOptions(statusSelect, 'CONFIRMED');

    await waitFor(() =>
      expect(mockedUpdateAppointment).toHaveBeenCalledWith('tok', 'apt-1', { status: 'CONFIRMED' }),
    );
    // The refresh-in-place fetch has started (2nd listAppointments call
    // pending on `refetch`) — same mounted table node, control disabled
    // while its own update is in flight.
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('table', { name: /agenda del día/i })).toBe(table);

    refetch.resolve([{ ...apt1, status: 'CONFIRMED' }]);

    await waitFor(() =>
      expect(within(table).getByRole<HTMLSelectElement>('combobox').value).toBe('CONFIRMED'),
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
      // #1 mount (month), #2 switching to Día — resolve immediately; #3 is the
      // deferred post-action refresh whose interim state the test asserts on.
      return callCount <= 2 ? Promise.resolve([apt1]) : refetch.promise;
    });

    const user = userEvent.setup();
    render(<AgendaView token="tok" />);

    await user.click(screen.getByRole('button', { name: /^día$/i }));
    const table = await screen.findByRole('table', { name: /agenda del día/i });
    const statusSelect = within(table).getByRole<HTMLSelectElement>('combobox');
    expect(statusSelect.value).toBe('SCHEDULED');
    expect(statusSelect).not.toBeDisabled();

    await user.selectOptions(statusSelect, 'CONFIRMED');
    // Selecting a new value while disabled-testing must not race ahead:
    // the PATCH is in flight, so the select is already disabled.
    expect(statusSelect).toBeDisabled();

    // Resolve the PATCH but leave the refetch pending.
    patch.resolve({ ...apt1, status: 'CONFIRMED' });
    await waitFor(() => expect(mockedListAppointments).toHaveBeenCalledTimes(3));

    // THE ASSERTION THAT PROVES THE FIX: the PATCH has settled and the
    // in-place refresh has started, but has NOT resolved yet — the row must
    // still be disabled (and must still show the stale SCHEDULED value,
    // since `appointments` hasn't been updated yet). Against the old
    // fire-and-forget code, `updatingId` was already cleared here (its
    // `.finally` ran off the PATCH promise alone), so this assertion fails.
    expect(within(table).getByRole<HTMLSelectElement>('combobox')).toBeDisabled();
    expect(within(table).getByRole<HTMLSelectElement>('combobox').value).toBe('SCHEDULED');

    // Now resolve the refresh — only now should the select re-enable, showing
    // the new status.
    refetch.resolve([{ ...apt1, status: 'CONFIRMED' }]);

    await waitFor(() =>
      expect(within(table).getByRole<HTMLSelectElement>('combobox')).not.toBeDisabled(),
    );
    expect(within(table).getByRole<HTMLSelectElement>('combobox').value).toBe('CONFIRMED');
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
    // Back in Día view (DayAgenda, not WeekAgenda) — with no appointments
    // mocked for this test, DayAgenda's empty state confirms it's the one
    // rendering (WeekAgenda has no such "no hay citas para este día" copy).
    expect(await screen.findByText(/no hay citas para este día/i)).toBeInTheDocument();
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

    const statusSelect = await screen.findByLabelText<HTMLSelectElement>(/^estado$/i);
    expect(statusSelect.value).toBe('SCHEDULED');

    await user.selectOptions(statusSelect, 'CONFIRMED');

    // PATCH is in flight: the select stays bound to the (unchanged)
    // server-confirmed status from `appointments`, and is disabled.
    expect(statusSelect.value).toBe('SCHEDULED');
    expect(statusSelect).toBeDisabled();

    rejectPatch(new Error('boom'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    // After the failure: re-enabled, and still showing the real status —
    // no optimistic leak.
    expect(statusSelect).not.toBeDisabled();
    expect(statusSelect.value).toBe('SCHEDULED');
  });
});
