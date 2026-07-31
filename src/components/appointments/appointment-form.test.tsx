import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentForm } from './appointment-form';
import { createAppointment } from '@/lib/appointments/appointments-api';
import { listStaff } from '@/lib/appointments/staff-api';
import { createPatient, listPatients } from '@/lib/patients/patients-api';

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
jest.mock('../../lib/patients/patients-api', () => ({
  listPatients: jest.fn(),
  createPatient: jest.fn(),
}));

const mockedCreateAppointment = createAppointment as jest.MockedFunction<typeof createAppointment>;
const mockedListStaff = listStaff as jest.MockedFunction<typeof listStaff>;
const mockedListPatients = listPatients as jest.MockedFunction<typeof listPatients>;
const mockedCreatePatient = createPatient as jest.MockedFunction<typeof createPatient>;

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
    {
      id: 'pat-2',
      tenantId: 't1',
      firstName: 'Carlos',
      lastName: 'Pérez',
      docType: 'CC' as const,
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
  docType: 'CC' as const,
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
  providerId: 'staff-1',
  start: '2026-07-23T09:00:00.000Z',
  end: '2026-07-23T09:30:00.000Z',
  status: 'SCHEDULED' as const,
  reason: 'Control',
  notes: null,
  createdById: 'u1',
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
  await user.type(screen.getByLabelText(/^fecha$/i), FUTURE_DATE);
  await user.type(screen.getByLabelText(/hora de inicio/i), '09:00');
  await user.type(screen.getByLabelText(/hora de fin/i), '09:30');
}

describe('AppointmentForm', () => {
  beforeEach(() => {
    mockedCreateAppointment.mockReset();
    mockedListStaff.mockReset();
    mockedListPatients.mockReset();
    mockedCreatePatient.mockReset();
    mockedListStaff.mockResolvedValue(staff);
    mockedListPatients.mockResolvedValue(patientsPage);
  });

  it('renders patient, provider, date/time and reason fields with accessible labels', async () => {
    render(<AppointmentForm token="tok" onCreated={jest.fn()} />);
    expect(screen.getByLabelText(/^paciente$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/profesional/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^fecha$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hora de inicio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hora de fin/i)).toBeInTheDocument();
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
    expect(screen.getByText(/cc 123/i)).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    // The search box collapses once a patient is chosen.
    expect(screen.queryByLabelText(/^paciente$/i)).not.toBeInTheDocument();
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
    await user.type(screen.getByLabelText(/^fecha$/i), FUTURE_DATE);
    await user.type(screen.getByLabelText(/hora de inicio/i), '09:30');
    await user.type(screen.getByLabelText(/hora de fin/i), '09:00');

    await user.click(screen.getByRole('button', { name: /agendar|guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/fin.*posterior.*inicio/i);
    expect(mockedCreateAppointment).not.toHaveBeenCalled();
  });

  describe('no agendar en el pasado', () => {
    it('el date picker no ofrece días anteriores a hoy (min = hoy local)', async () => {
      await renderFormAndWaitForLoad();
      const today = new Date();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');

      expect(screen.getByLabelText(/^fecha$/i)).toHaveAttribute(
        'min',
        `${today.getFullYear()}-${mm}-${dd}`,
      );
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
      await user.type(screen.getByLabelText(/^fecha$/i), pastDate);
      await user.type(screen.getByLabelText(/hora de inicio/i), pastTime);
      await user.type(screen.getByLabelText(/hora de fin/i), '23:59');

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
    expect(new Date(input.start).getTime()).toBeLessThan(new Date(input.end).getTime());
    expect(input.start).toBe(new Date(`${FUTURE_DATE}T09:00:00`).toISOString());
    expect(input.end).toBe(new Date(`${FUTURE_DATE}T09:30:00`).toISOString());
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
    expect(screen.getByLabelText(/hora de inicio/i)).toHaveValue('09:00');
    expect(screen.getByLabelText(/hora de fin/i)).toHaveValue('09:30');
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

      await user.click(within(dialog).getByRole('button', { name: /crear paciente/i }));

      await waitFor(() => expect(mockedCreatePatient).toHaveBeenCalledTimes(1));
      const [token, input] = mockedCreatePatient.mock.calls[0];
      expect(token).toBe('tok');
      expect(input).toEqual({
        firstName: 'Sofía',
        lastName: 'Ramírez',
        docType: 'CC',
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

      await user.click(within(dialog).getByRole('button', { name: /crear paciente/i }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Documento ya registrado');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // Nothing got selected: the search box is still there, no chip.
      expect(screen.getByLabelText(/^paciente$/i)).toBeInTheDocument();
      expect(screen.queryByText('Sofía Ramírez')).not.toBeInTheDocument();
    });
  });
});
