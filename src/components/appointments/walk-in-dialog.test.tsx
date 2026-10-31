import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/api-error';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { listPatients } from '@/lib/patients/patients-api';
import { createWalkIn, type WalkInResult } from '@/lib/appointments/walk-in';
import { notifyInClinicChanged } from '@/lib/appointments/patient-flow';
import { WalkInDialog, walkInCopy as copy } from './walk-in-dialog';

jest.mock('../../lib/appointments/staff-api', () => ({
  ...jest.requireActual('../../lib/appointments/staff-api'),
  listStaff: jest.fn(),
}));
jest.mock('../../lib/patients/patients-api', () => ({
  ...jest.requireActual('../../lib/patients/patients-api'),
  listPatients: jest.fn(),
}));
jest.mock('../../lib/appointments/walk-in', () => ({
  ...jest.requireActual('../../lib/appointments/walk-in'),
  createWalkIn: jest.fn(),
}));
jest.mock('../../lib/appointments/patient-flow', () => ({
  ...jest.requireActual('../../lib/appointments/patient-flow'),
  notifyInClinicChanged: jest.fn(),
}));

const staffMock = listStaff as jest.MockedFunction<typeof listStaff>;
const patientsMock = listPatients as jest.MockedFunction<typeof listPatients>;
const createMock = createWalkIn as jest.MockedFunction<typeof createWalkIn>;

const STAFF: StaffMember[] = [
  { userId: 'dent-1', fullName: 'Dra. Lina', role: 'DENTIST', locationIds: null },
  { userId: 'dent-norte', fullName: 'Dr. Norte', role: 'DENTIST', locationIds: ['loc-norte'] },
  { userId: 'rec-1', fullName: 'Recepción', role: 'RECEPTION', locationIds: null },
];

const RESULT = { id: 'a1', patientFirstName: 'Lucía', patientLastName: 'Sin Cita' } as WalkInResult;

function renderDialog() {
  const onOpenChange = jest.fn();
  const onCreated = jest.fn();
  render(
    <WalkInDialog open onOpenChange={onOpenChange} token="T" locationId="loc-centro" onCreated={onCreated} />,
  );
  return { onOpenChange, onCreated };
}

async function fillNewPatient(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: copy.newPatient }));
  await user.type(screen.getByLabelText(copy.firstName), 'Lucía');
  await user.type(screen.getByLabelText(copy.lastName), 'Sin Cita');
  await user.type(screen.getByLabelText(copy.phone), '+58 412 555 0101');
}

beforeEach(() => {
  jest.clearAllMocks();
  staffMock.mockResolvedValue(STAFF);
  patientsMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 8 } as never);
});

describe('WalkInDialog (DX-470)', () => {
  it('paciente nuevo: manda el alta mínima, el profesional, las señales y la nota', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue(RESULT);
    const { onOpenChange, onCreated } = renderDialog();
    await fillNewPatient(user);
    await user.selectOptions(await screen.findByLabelText(copy.provider), 'dent-1');
    await user.click(screen.getByRole('checkbox', { name: 'Dolor' }));
    await user.click(screen.getByRole('checkbox', { name: 'Fiebre' }));
    await user.type(screen.getByLabelText(copy.note), '  Muela 36  ');
    await user.click(screen.getByRole('button', { name: copy.submit }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith(
      'T',
      {
        providerId: 'dent-1',
        triageFlags: ['PAIN', 'FEVER'],
        triageNote: 'Muela 36',
        newPatient: { firstName: 'Lucía', lastName: 'Sin Cita', phone: '+58 412 555 0101' },
      },
      'loc-centro',
    );
    expect(notifyInClinicChanged).toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledWith(RESULT);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('solo ofrece a quien atiende en la sede (odontólogos y administración)', async () => {
    renderDialog();
    await screen.findByRole('option', { name: copy.providerPlaceholder });
    const select = screen.getByLabelText(copy.provider);
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([copy.providerPlaceholder, 'Dra. Lina']);
  });

  it('paciente existente: lo busca y manda su id', async () => {
    const user = userEvent.setup();
    patientsMock.mockResolvedValue({
      items: [{ id: 'p-1', firstName: 'Berta', lastName: 'Urgencia', docNumber: '470001' }],
      total: 1,
      page: 1,
      pageSize: 8,
    } as never);
    createMock.mockResolvedValue(RESULT);
    renderDialog();
    await user.type(screen.getByLabelText(copy.search), 'Ber');
    await user.click(await screen.findByRole('button', { name: /Berta Urgencia/ }));
    expect(screen.getByTestId('walk-in-patient')).toHaveTextContent('Berta Urgencia');
    await user.selectOptions(await screen.findByLabelText(copy.provider), 'dent-1');
    await user.click(screen.getByRole('button', { name: copy.submit }));
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith('T', { providerId: 'dent-1', triageFlags: [], patientId: 'p-1' }, 'loc-centro'),
    );
  });

  it('sin hueco reservado libre: pide el motivo y reintenta en sobrecupo', async () => {
    const user = userEvent.setup();
    createMock
      .mockRejectedValueOnce(
        new ApiError(409, 'No queda ningún hueco reservado libre hoy para este profesional.', {
          code: 'NO_RESERVED_SLOT',
        }),
      )
      .mockResolvedValueOnce(RESULT);
    renderDialog();
    await fillNewPatient(user);
    await user.selectOptions(await screen.findByLabelText(copy.provider), 'dent-1');
    await user.click(screen.getByRole('button', { name: copy.submit }));

    const overbook = await screen.findByTestId('walk-in-overbook');
    expect(overbook).toHaveTextContent('No queda ningún hueco reservado libre hoy');
    const reason = screen.getByLabelText(copy.overbookReason);
    expect(reason).toHaveFocus();
    await user.click(screen.getByRole('button', { name: copy.submitOverbook }));
    expect(screen.getByText(copy.overbookInvalid)).toBeInTheDocument();
    expect(createMock).toHaveBeenCalledTimes(1);

    await user.type(reason, 'Dolor agudo, no puede esperar');
    await user.click(screen.getByRole('button', { name: copy.submitOverbook }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
    expect(createMock.mock.calls[1][1]).toMatchObject({ overbookReason: 'Dolor agudo, no puede esperar' });
  });

  it('documento repetido: ofrece usar el paciente que ya existe', async () => {
    const user = userEvent.setup();
    createMock
      .mockRejectedValueOnce(
        new ApiError(409, 'Ya existe un paciente con ese número de documento.', {
          code: 'PATIENT_DUPLICATE',
          existingPatientId: 'p-dup',
        }),
      )
      .mockResolvedValueOnce(RESULT);
    renderDialog();
    await fillNewPatient(user);
    await user.type(screen.getByLabelText(copy.docNumber), '470001');
    await user.selectOptions(await screen.findByLabelText(copy.provider), 'dent-1');
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(await screen.findByText(copy.duplicateTitle)).toBeInTheDocument();
    expect(createMock.mock.calls[0][1]).toMatchObject({ newPatient: { docNumber: '470001' } });

    await user.click(screen.getByRole('button', { name: copy.useExisting }));
    expect(screen.getByTestId('walk-in-patient')).toHaveTextContent('Lucía Sin Cita');
    await user.click(screen.getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
    expect(createMock.mock.calls[1][1]).toMatchObject({ patientId: 'p-dup' });
    expect(createMock.mock.calls[1][1]).not.toHaveProperty('newPatient');
  });

  it('valida antes de enviar: paciente, profesional y nota ≤ 200', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByLabelText(copy.provider);
    await user.click(screen.getByLabelText(copy.note));
    await user.paste('x'.repeat(201));
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(screen.getByText(copy.missingPatient)).toBeInTheDocument();
    expect(screen.getByText(copy.missingProvider)).toBeInTheDocument();
    expect(screen.getByText(copy.noteTooLong)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('alta mínima incompleta: cada campo anuncia su error (aria-describedby)', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByLabelText(copy.provider);
    await user.click(screen.getByRole('radio', { name: copy.newPatient }));
    await user.click(screen.getByRole('button', { name: copy.submit }));
    for (const label of [copy.firstName, copy.lastName, copy.phone]) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAccessibleDescription(expect.stringContaining(copy.missingPatient));
    }
    expect(createMock).not.toHaveBeenCalled();
  });

  it('error de carga de profesionales con «Reintentar»; error al enviar en el formulario', async () => {
    const user = userEvent.setup();
    staffMock.mockRejectedValueOnce(new Error('boom'));
    renderDialog();
    expect(await screen.findByText(copy.providersError)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.retry }));
    const select = await screen.findByLabelText(copy.provider);
    await user.selectOptions(select, 'dent-1');
    createMock.mockRejectedValueOnce(new ApiError(403, 'No tienes acceso a esta sede.', { code: 'LOCATION_NOT_ALLOWED' }));
    await fillNewPatient(user);
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(await screen.findByText('No tienes acceso a esta sede.')).toBeInTheDocument();
  });

  it('carga: el selector de profesional dice que está cargando', () => {
    staffMock.mockReturnValue(new Promise(() => {}));
    renderDialog();
    expect(screen.getByRole('option', { name: copy.providersLoading })).toBeInTheDocument();
  });
});
