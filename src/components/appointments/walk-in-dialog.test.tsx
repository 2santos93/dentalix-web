import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { getPatient, listPatients } from '@/lib/patients/patients-api';
import { createWalkIn, type WalkInResult } from '@/lib/appointments/walk-in';
import { notifyInClinicChanged } from '@/lib/appointments/patient-flow';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { WalkInDialog, walkInCopy as copy } from './walk-in-dialog';

jest.mock('../../lib/appointments/staff-api', () => ({
  ...jest.requireActual('../../lib/appointments/staff-api'),
  listStaff: jest.fn(),
}));
jest.mock('../../lib/patients/patients-api', () => ({
  ...jest.requireActual('../../lib/patients/patients-api'),
  listPatients: jest.fn(),
  getPatient: jest.fn(),
}));
jest.mock('../../lib/appointments/walk-in', () => ({
  ...jest.requireActual('../../lib/appointments/walk-in'),
  createWalkIn: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));
jest.mock('../../lib/appointments/patient-flow', () => ({
  ...jest.requireActual('../../lib/appointments/patient-flow'),
  notifyInClinicChanged: jest.fn(),
}));

const staffMock = listStaff as jest.MockedFunction<typeof listStaff>;
const patientsMock = listPatients as jest.MockedFunction<typeof listPatients>;
const getPatientMock = getPatient as jest.MockedFunction<typeof getPatient>;
const createMock = createWalkIn as jest.MockedFunction<typeof createWalkIn>;
const locationsMock = listLocations as jest.MockedFunction<typeof listLocations>;

const CENTRO = clinicLocation({ id: 'loc-centro', name: 'Sede Centro' });
const NORTE = clinicLocation({ id: 'loc-norte', name: 'Sede Norte' });
const CERRADA = clinicLocation({ id: 'loc-cerrada', name: 'Sede Cerrada', isActive: false });

const STAFF: StaffMember[] = [
  { userId: 'dent-1', fullName: 'Dra. Lina', role: 'DENTIST', locationIds: null },
  { userId: 'dent-norte', fullName: 'Dr. Norte', role: 'DENTIST', locationIds: ['loc-norte'] },
  { userId: 'rec-1', fullName: 'Recepción', role: 'RECEPTION', locationIds: null },
];

const RESULT = { id: 'a1', patientFirstName: 'Lucía', patientLastName: 'Sin Cita' } as WalkInResult;

function renderDialog(locationId: string | null = 'loc-centro', defaultProviderId: string | null = null) {
  const onOpenChange = jest.fn();
  const onCreated = jest.fn();
  render(
    <WalkInDialog
      open
      onOpenChange={onOpenChange}
      token="T"
      locationId={locationId}
      defaultProviderId={defaultProviderId}
      onCreated={onCreated}
    />,
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
  locationsMock.mockResolvedValue([CENTRO, NORTE, CERRADA]);
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
          existingPatient: { id: 'p-dup', firstName: 'Berta', lastName: 'Urgencia' },
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
    // Antes de usarlo ya se ve a quién pertenece el documento.
    expect(screen.getByText(/Berta Urgencia/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy.useExisting }));
    // QA DX-470: el paciente real, no el nombre tecleado.
    expect(screen.getByTestId('walk-in-patient')).toHaveTextContent('Berta Urgencia');
    expect(screen.getByTestId('walk-in-patient')).not.toHaveTextContent('Lucía');
    expect(getPatientMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
    expect(createMock.mock.calls[1][1]).toMatchObject({ patientId: 'p-dup' });
    expect(createMock.mock.calls[1][1]).not.toHaveProperty('newPatient');
  });

  it('documento repetido sin nombre en el 409: busca al paciente por id y muestra el suyo', async () => {
    const user = userEvent.setup();
    createMock.mockRejectedValueOnce(
      new ApiError(409, 'Ya existe un paciente con ese número de documento.', {
        code: 'PATIENT_DUPLICATE',
        existingPatientId: 'p-dup',
      }),
    );
    getPatientMock.mockResolvedValue({ id: 'p-dup', firstName: 'Sebastián', lastName: 'Niño Cabrera', docNumber: 'DEMO-0024' } as never);
    renderDialog();
    await fillNewPatient(user);
    await user.type(screen.getByLabelText(copy.docNumber), 'DEMO-0024');
    await user.selectOptions(await screen.findByLabelText(copy.provider), 'dent-1');
    await user.click(screen.getByRole('button', { name: copy.submit }));
    await user.click(await screen.findByRole('button', { name: copy.useExisting }));
    await waitFor(() => expect(screen.getByTestId('walk-in-patient')).toHaveTextContent('Sebastián Niño Cabrera'));
    expect(getPatientMock).toHaveBeenCalledWith('T', 'p-dup');
    expect(screen.getByText('DEMO-0024')).toBeInTheDocument();
  });

  it('error de red al enviar: «Reintentar» reenvía con los datos conservados', async () => {
    const user = userEvent.setup();
    createMock.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch'))).mockResolvedValueOnce(RESULT);
    const { onOpenChange } = renderDialog();
    await fillNewPatient(user);
    await user.selectOptions(await screen.findByLabelText(copy.provider), 'dent-1');
    await user.click(screen.getByRole('checkbox', { name: 'Dolor' }));
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(await screen.findByText(/No hay conexión con el servidor/)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.firstName)).toHaveValue('Lucía');

    await user.click(screen.getByRole('button', { name: copy.retry }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
    expect(createMock.mock.calls[1]).toEqual(createMock.mock.calls[0]);
    expect(createMock.mock.calls[1][1]).toMatchObject({ triageFlags: ['PAIN'], newPatient: { firstName: 'Lucía' } });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('un error que no es de red (403) no ofrece «Reintentar»', async () => {
    const user = userEvent.setup();
    createMock.mockRejectedValueOnce(new ApiError(403, 'No tienes acceso a esta sede.', { code: 'LOCATION_NOT_ALLOWED' }));
    renderDialog();
    await fillNewPatient(user);
    await user.selectOptions(await screen.findByLabelText(copy.provider), 'dent-1');
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(await screen.findByText('No tienes acceso a esta sede.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.retry })).not.toBeInTheDocument();
  });

  it('teléfono demasiado corto: el campo dice cuántos dígitos pide (la API pide 5 caracteres)', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByLabelText(copy.provider);
    await user.click(screen.getByRole('radio', { name: copy.newPatient }));
    await user.type(screen.getByLabelText(copy.firstName), 'Lucía');
    await user.type(screen.getByLabelText(copy.lastName), 'Sin Cita');
    await user.type(screen.getByLabelText(copy.phone), '12');
    await user.click(screen.getByRole('button', { name: copy.submit }));
    const phone = screen.getByLabelText(copy.phone);
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(copy.phoneTooShort).toBe('El teléfono debe tener al menos 5 dígitos.');
    expect(phone).toHaveAccessibleDescription(expect.stringContaining(copy.phoneTooShort));
    expect(phone).not.toHaveAccessibleDescription(expect.stringContaining(copy.missingPatient));
    expect(screen.getByLabelText(copy.firstName)).not.toHaveAttribute('aria-invalid');
    expect(createMock).not.toHaveBeenCalled();
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

  it('alta mínima incompleta: cada campo anuncia SU error y el foco va al primero (DX-486)', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByLabelText(copy.provider);
    await user.click(screen.getByRole('radio', { name: copy.newPatient }));
    await user.click(screen.getByRole('button', { name: copy.submit }));
    const expected: [string, string][] = [
      [copy.firstName, copy.missingFirstName],
      [copy.lastName, copy.missingLastName],
      [copy.phone, copy.missingPhone],
    ];
    for (const [label, message] of expected) {
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAccessibleDescription(expect.stringContaining(message));
    }
    // Tres mensajes distintos: el lector no repite el mismo tres veces.
    expect(new Set(expected.map(([, m]) => m)).size).toBe(3);
    expect(screen.queryByText(copy.missingPatient)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(copy.firstName)).toHaveFocus());
    expect(createMock).not.toHaveBeenCalled();
  });

  it('el foco va al primer campo inválido: con el nombre escrito, al apellido', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByLabelText(copy.provider);
    await user.click(screen.getByRole('radio', { name: copy.newPatient }));
    await user.type(screen.getByLabelText(copy.firstName), 'Lucía');
    await user.click(screen.getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(screen.getByLabelText(copy.lastName)).toHaveFocus());
  });

  it('paciente existente sin elegir: el foco va a «Buscar paciente»; con paciente, al profesional', async () => {
    const user = userEvent.setup();
    patientsMock.mockResolvedValue({
      items: [{ id: 'p-1', firstName: 'Berta', lastName: 'Urgencia', docNumber: '470001' }],
      total: 1,
      page: 1,
      pageSize: 8,
    } as never);
    renderDialog();
    await screen.findByLabelText(copy.provider);
    await user.click(screen.getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(screen.getByLabelText(copy.search)).toHaveFocus());
    expect(screen.getByLabelText(copy.search)).toHaveAccessibleDescription(copy.missingPatient);

    await user.type(screen.getByLabelText(copy.search), 'Ber');
    await user.click(await screen.findByRole('button', { name: /Berta Urgencia/ }));
    await user.click(screen.getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(screen.getByLabelText(copy.provider)).toHaveFocus());
  });

  it('cambiar la búsqueda vacía los resultados anteriores y dice «Buscando…» hasta la respuesta nueva', async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => {};
    patientsMock
      .mockResolvedValueOnce({
        items: [{ id: 'p-1', firstName: 'Berta', lastName: 'Urgencia', docNumber: '470001' }],
        total: 1,
        page: 1,
        pageSize: 8,
      } as never)
      .mockReturnValueOnce(new Promise((resolve) => (answer = resolve)) as never);
    renderDialog();
    await user.type(screen.getByLabelText(copy.search), 'Ber');
    expect(await screen.findByRole('button', { name: /Berta Urgencia/ })).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: copy.search }), 'n');
    // Al instante, antes de que la búsqueda nueva salga: ni un resultado viejo.
    expect(screen.queryByRole('button', { name: /Berta Urgencia/ })).not.toBeInTheDocument();
    expect(screen.getByText(copy.searching)).toBeInTheDocument();
    await waitFor(() => expect(patientsMock).toHaveBeenLastCalledWith('T', { query: 'Bern', pageSize: 8 }));
    expect(screen.getByText(copy.searching)).toBeInTheDocument();

    answer({
      items: [{ id: 'p-2', firstName: 'Bernardo', lastName: 'Ríos', docNumber: null }],
      total: 1,
      page: 1,
      pageSize: 8,
    });
    expect(await screen.findByRole('button', { name: /Bernardo Ríos/ })).toBeInTheDocument();
    expect(screen.queryByText(copy.searching)).not.toBeInTheDocument();
  });

  it('volver a la búsqueda anterior la enseña sin quedarse en «Buscando…»', async () => {
    const user = userEvent.setup();
    patientsMock.mockResolvedValue({
      items: [{ id: 'p-1', firstName: 'Berta', lastName: 'Urgencia', docNumber: '470001' }],
      total: 1,
      page: 1,
      pageSize: 8,
    } as never);
    renderDialog();
    await user.type(screen.getByLabelText(copy.search), 'Ber');
    expect(await screen.findByRole('button', { name: /Berta Urgencia/ })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: copy.search }), 't{Backspace}');
    expect(await screen.findByRole('button', { name: /Berta Urgencia/ })).toBeInTheDocument();
  });

  describe('sede (DX-486)', () => {
    it('con una sede activa la nombra y no pide elegirla', async () => {
      renderDialog('loc-centro');
      expect(await screen.findByTestId('walk-in-location')).toHaveTextContent(copy.atLocation('Sede Centro'));
      expect(screen.queryByRole('combobox', { name: copy.location })).not.toBeInTheDocument();
    });

    it('con «Todas las sedes» pide la sede (solo las activas), filtra profesionales y la manda en X-Location-Id', async () => {
      const user = userEvent.setup();
      createMock.mockResolvedValue(RESULT);
      renderDialog(null);
      const sedeSelect = await screen.findByRole('combobox', { name: copy.location });
      await waitFor(() =>
        expect(within(sedeSelect).getAllByRole('option').map((o) => o.textContent)).toEqual([
          copy.locationPlaceholder,
          'Sede Centro',
          'Sede Norte',
        ]),
      );
      // Sin sede no se ofrece a nadie: no hay sede con la que filtrar.
      const provider = screen.getByLabelText(copy.provider);
      expect(provider).toBeDisabled();
      expect(within(provider).getByRole('option')).toHaveTextContent(copy.providerNeedsLocation);

      await user.selectOptions(sedeSelect, 'loc-centro');
      expect(within(screen.getByLabelText(copy.provider)).getAllByRole('option').map((o) => o.textContent)).toEqual([
        copy.providerPlaceholder,
        'Dra. Lina',
      ]);
      await user.selectOptions(sedeSelect, 'loc-norte');
      expect(within(screen.getByLabelText(copy.provider)).getAllByRole('option').map((o) => o.textContent)).toEqual([
        copy.providerPlaceholder,
        'Dra. Lina',
        'Dr. Norte',
      ]);

      await fillNewPatient(user);
      await user.selectOptions(screen.getByLabelText(copy.provider), 'dent-norte');
      await user.click(screen.getByRole('button', { name: copy.submit }));
      await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
      expect(createMock.mock.calls[0][1]).toMatchObject({ providerId: 'dent-norte' });
      expect(createMock.mock.calls[0][2]).toBe('loc-norte');
    });

    it('con «Todas las sedes» y sin elegirla: error en el campo, el foco va a él y no se envía', async () => {
      const user = userEvent.setup();
      renderDialog(null);
      const sedeSelect = await screen.findByRole('combobox', { name: copy.location });
      await screen.findByRole('option', { name: 'Sede Norte' });
      await user.click(screen.getByRole('button', { name: copy.submit }));
      await waitFor(() => expect(sedeSelect).toHaveFocus());
      expect(sedeSelect).toHaveAttribute('aria-invalid', 'true');
      expect(sedeSelect).toHaveAccessibleDescription(copy.missingLocation);
      expect(createMock).not.toHaveBeenCalled();
    });

    it('cambiar a una sede donde no atiende el profesional elegido lo suelta', async () => {
      const user = userEvent.setup();
      renderDialog(null, 'dent-norte');
      const sedeSelect = await screen.findByRole('combobox', { name: copy.location });
      await screen.findByRole('option', { name: 'Sede Norte' });
      await user.selectOptions(sedeSelect, 'loc-norte');
      expect(screen.getByLabelText(copy.provider)).toHaveValue('dent-norte');
      await user.selectOptions(sedeSelect, 'loc-centro');
      expect(screen.getByLabelText(copy.provider)).toHaveValue('');
      await fillNewPatient(user);
      await user.click(screen.getByRole('button', { name: copy.submit }));
      expect(await screen.findByText(copy.missingProvider)).toBeInTheDocument();
      expect(createMock).not.toHaveBeenCalled();
    });

    it('con «Todas las sedes» y una sola sede activa, esa queda elegida y nombrada', async () => {
      const user = userEvent.setup();
      createMock.mockResolvedValue(RESULT);
      locationsMock.mockResolvedValue([NORTE, CERRADA]);
      renderDialog(null);
      expect(await screen.findByTestId('walk-in-location')).toHaveTextContent(copy.atLocation('Sede Norte'));
      await fillNewPatient(user);
      await user.selectOptions(screen.getByLabelText(copy.provider), 'dent-norte');
      await user.click(screen.getByRole('button', { name: copy.submit }));
      await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
      expect(createMock.mock.calls[0][2]).toBe('loc-norte');
    });

    it('el sobrecupo pedido en una sede no se arrastra a otra: se vuelve a intentar el hueco reservado', async () => {
      const user = userEvent.setup();
      createMock
        .mockRejectedValueOnce(
          new ApiError(409, 'No queda ningún hueco reservado libre hoy para este profesional.', {
            code: 'NO_RESERVED_SLOT',
          }),
        )
        .mockResolvedValueOnce(RESULT);
      renderDialog(null);
      const sedeSelect = await screen.findByRole('combobox', { name: copy.location });
      await screen.findByRole('option', { name: 'Sede Norte' });
      await user.selectOptions(sedeSelect, 'loc-centro');
      await fillNewPatient(user);
      await user.selectOptions(screen.getByLabelText(copy.provider), 'dent-1');
      await user.click(screen.getByRole('button', { name: copy.submit }));
      await user.type(await screen.findByLabelText(copy.overbookReason), 'Dolor agudo, no puede esperar');

      await user.selectOptions(sedeSelect, 'loc-norte');
      expect(screen.queryByTestId('walk-in-overbook')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: copy.submit }));
      await waitFor(() => expect(createMock).toHaveBeenCalledTimes(2));
      expect(createMock.mock.calls[1][1]).not.toHaveProperty('overbookReason');
      expect(createMock.mock.calls[1][2]).toBe('loc-norte');
    });

    it('si no cargan las sedes, «Atender» deja el foco en su «Reintentar»', async () => {
      const user = userEvent.setup();
      locationsMock.mockRejectedValue(new Error('boom'));
      renderDialog(null);
      await screen.findByText(copy.locationsError);
      await screen.findByLabelText(copy.provider);
      await user.click(screen.getByRole('button', { name: copy.submit }));
      await waitFor(() => expect(screen.getAllByRole('button', { name: copy.retry })[0]).toHaveFocus());
      expect(createMock).not.toHaveBeenCalled();
    });

    it('si no cargan las sedes con «Todas las sedes»: error con «Reintentar»', async () => {
      const user = userEvent.setup();
      locationsMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([CENTRO, NORTE]);
      renderDialog(null);
      expect(await screen.findByText(copy.locationsError)).toBeInTheDocument();
      await user.click(screen.getAllByRole('button', { name: copy.retry })[0]);
      expect(await screen.findByRole('option', { name: 'Sede Norte' })).toBeInTheDocument();
    });
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
