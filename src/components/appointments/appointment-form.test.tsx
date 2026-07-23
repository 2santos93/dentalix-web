import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppointmentForm } from './appointment-form';
import { createAppointment } from '@/lib/appointments/appointments-api';
import { listStaff } from '@/lib/appointments/staff-api';
import { listPatients } from '@/lib/patients/patients-api';

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
}));

const mockedCreateAppointment = createAppointment as jest.MockedFunction<typeof createAppointment>;
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

async function renderFormAndWaitForLoad() {
  render(<AppointmentForm token="tok" tenant={null} onCreated={jest.fn()} />);
  await screen.findByRole('option', { name: /dra\. ana ríos/i });
  await screen.findByRole('option', { name: /maría lópez/i });
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/^paciente$/i), 'pat-1');
  await user.selectOptions(screen.getByLabelText(/profesional/i), 'staff-1');
  await user.type(screen.getByLabelText(/^fecha$/i), '2026-07-23');
  await user.type(screen.getByLabelText(/hora de inicio/i), '09:00');
  await user.type(screen.getByLabelText(/hora de fin/i), '09:30');
}

describe('AppointmentForm', () => {
  beforeEach(() => {
    mockedCreateAppointment.mockReset();
    mockedListStaff.mockReset();
    mockedListPatients.mockReset();
    mockedListStaff.mockResolvedValue(staff);
    mockedListPatients.mockResolvedValue(patientsPage);
  });

  it('renders patient, provider, date/time and reason fields with accessible labels', async () => {
    render(<AppointmentForm token="tok" tenant={null} onCreated={jest.fn()} />);
    expect(screen.getByLabelText(/^paciente$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/profesional/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^fecha$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hora de inicio/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hora de fin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/motivo/i)).toBeInTheDocument();
    await waitFor(() => expect(mockedListStaff).toHaveBeenCalled());
  });

  it('populates the patient select from GET /patients and the provider select from GET /staff', async () => {
    await renderFormAndWaitForLoad();
    expect(screen.getByRole('option', { name: /carlos pérez/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /dr\. luis gómez/i })).toBeInTheDocument();
  });

  it('filters the patient list client-side using the search box', async () => {
    const user = userEvent.setup();
    await renderFormAndWaitForLoad();
    await user.type(screen.getByLabelText(/buscar paciente/i), 'carlos');
    expect(screen.getByRole('option', { name: /carlos pérez/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /maría lópez/i })).not.toBeInTheDocument();
  });

  it('blocks submit and shows a validation message when end is not after start', async () => {
    const user = userEvent.setup();
    await renderFormAndWaitForLoad();
    await user.selectOptions(screen.getByLabelText(/^paciente$/i), 'pat-1');
    await user.selectOptions(screen.getByLabelText(/profesional/i), 'staff-1');
    await user.type(screen.getByLabelText(/^fecha$/i), '2026-07-23');
    await user.type(screen.getByLabelText(/hora de inicio/i), '09:30');
    await user.type(screen.getByLabelText(/hora de fin/i), '09:00');

    await user.click(screen.getByRole('button', { name: /agendar|crear|guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/fin.*posterior.*inicio/i);
    expect(mockedCreateAppointment).not.toHaveBeenCalled();
  });

  it('submits createAppointment with the correct ISO start/end payload', async () => {
    const user = userEvent.setup();
    mockedCreateAppointment.mockResolvedValue(createdAppointment);
    await renderFormAndWaitForLoad();
    await fillValidForm(user);
    await user.type(screen.getByLabelText(/motivo/i), 'Control');

    await user.click(screen.getByRole('button', { name: /agendar|crear|guardar/i }));

    await waitFor(() => expect(mockedCreateAppointment).toHaveBeenCalledTimes(1));
    const [token, input, tenant] = mockedCreateAppointment.mock.calls[0];
    expect(token).toBe('tok');
    expect(tenant).toBeNull();
    expect(input.patientId).toBe('pat-1');
    expect(input.providerId).toBe('staff-1');
    expect(input.reason).toBe('Control');
    expect(new Date(input.start).getTime()).toBeLessThan(new Date(input.end).getTime());
    expect(input.start).toBe(new Date('2026-07-23T09:00:00').toISOString());
    expect(input.end).toBe(new Date('2026-07-23T09:30:00').toISOString());
  });

  it('calls onCreated with the created appointment on success', async () => {
    const user = userEvent.setup();
    const onCreated = jest.fn();
    mockedCreateAppointment.mockResolvedValue(createdAppointment);
    render(<AppointmentForm token="tok" tenant={null} onCreated={onCreated} />);
    await screen.findByRole('option', { name: /dra\. ana ríos/i });
    await screen.findByRole('option', { name: /maría lópez/i });
    await fillValidForm(user);

    await user.click(screen.getByRole('button', { name: /agendar|crear|guardar/i }));

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

    const submit = screen.getByRole('button', { name: /agendar|crear|guardar/i });
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

    await user.click(screen.getByRole('button', { name: /agendar|crear|guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El profesional ya tiene una cita en ese horario',
    );
  });
});
