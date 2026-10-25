import { render, screen, waitFor, within } from '@testing-library/react';
import { PatientCommunicationSection } from './patient-communication-section';
import {
  getPatientCommunication,
  getPatientOptOutWarnings,
  updatePatientCommunication,
  type PatientCommunication,
} from '@/lib/patients/communication-api';
import { ApiError } from '@/lib/api/api-error';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/patients/communication-api', () => ({
  ...jest.requireActual('../../lib/patients/communication-api'),
  getPatientCommunication: jest.fn(),
  getPatientOptOutWarnings: jest.fn(),
  updatePatientCommunication: jest.fn(),
}));

const mockedGet = getPatientCommunication as jest.MockedFunction<typeof getPatientCommunication>;
const mockedUpdate = updatePatientCommunication as jest.MockedFunction<
  typeof updatePatientCommunication
>;

const NEEDS_MOBILE =
  'Para elegir WhatsApp el paciente necesita un móvil válido. Revisa el número (si es de otro país, escríbelo con + y su indicativo).';

function comms(over: Partial<PatientCommunication> = {}): PatientCommunication {
  return {
    patientId: 'p1',
    contactChannel: 'EMAIL',
    clinicDefaultChannel: 'EMAIL',
    phone: '+573101234567',
    phoneE164: '+573101234567',
    phoneStatus: 'VALID',
    phoneCountry: 'CO',
    email: 'ana@example.com',
    whatsappOptIn: null,
    reminderOptOut: null,
    recipient: {
      kind: 'PATIENT',
      name: 'Ana',
      email: 'ana@example.com',
      minor: false,
      responsiblePartyId: null,
    },
    ...over,
  };
}

function renderSection(canEdit = true, onChanged?: (c: PatientCommunication) => void) {
  return render(
    <PatientCommunicationSection
      token="tok"
      patientId="p1"
      canEdit={canEdit}
      onChanged={onChanged}
    />,
  );
}

describe('PatientCommunicationSection (DX-128)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPatientOptOutWarnings).mockResolvedValue([]);
  });

  it('carga con skeleton y muestra canal, móvil validado, WhatsApp y recordatorios', async () => {
    mockedGet.mockResolvedValue(
      comms({
        contactChannel: 'WHATSAPP',
        whatsappOptIn: {
          at: '2026-10-12T15:00:00.000Z',
          source: 'IN_PERSON',
          recordedBy: { id: 'u1', fullName: 'Rosa Recepción' },
        },
      }),
    );
    renderSection();
    expect(screen.getByRole('status', { name: 'Cargando comunicaciones' })).toBeInTheDocument();

    const section = screen.getByRole('region', { name: 'Comunicaciones' });
    expect(await within(section).findByText('+57 310 123 4567')).toBeInTheDocument();
    expect(within(section).getByText('Canal de los recordatorios').nextSibling).toHaveTextContent(
      'WhatsApp',
    );
    expect(within(section).getByText('Móvil válido')).toBeInTheDocument();
    expect(section).toHaveTextContent('Aceptó el 12/10/2026 · En persona · lo registró Rosa Recepción');
    expect(section).toHaveTextContent('Activos');
    expect(mockedGet).toHaveBeenCalledWith('tok', 'p1');
  });

  it('sin móvil: estado vacío «Sin móvil registrado»', async () => {
    mockedGet.mockResolvedValue(comms({ phone: null, phoneE164: null, phoneStatus: 'MISSING' }));
    renderSection();
    expect(await screen.findByText('Sin móvil registrado')).toBeInTheDocument();
  });

  it('un móvil inválido avisa que no sirve para WhatsApp', async () => {
    mockedGet.mockResolvedValue(
      comms({ phone: '601 234 5678', phoneE164: null, phoneStatus: 'INVALID' }),
    );
    renderSection();
    expect(await screen.findByText('601 234 5678')).toBeInTheDocument();
    expect(screen.getByText('Móvil no válido')).toBeInTheDocument();
    expect(
      screen.getByText('No sirve para WhatsApp: revisa el número o escríbelo con + y su indicativo.'),
    ).toBeInTheDocument();
  });

  it('muestra la baja con su fecha y origen', async () => {
    mockedGet.mockResolvedValue(
      comms({ reminderOptOut: { at: '2026-10-15T15:00:00.000Z', source: 'LINK' } }),
    );
    renderSection();
    expect(
      await screen.findByText('Dado de baja el 15/10/2026, con el enlace del email'),
    ).toBeInTheDocument();
  });

  it('error al cargar: sección con reintento', async () => {
    mockedGet.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(comms());
    const user = setupUser();
    renderSection();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar las comunicaciones del paciente.');
    await user.click(within(alert).getByRole('button'));
    expect(await screen.findByText('Móvil válido')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('el profesional lo ve en solo lectura: sin botón de editar', async () => {
    mockedGet.mockResolvedValue(comms());
    renderSection(false);
    await screen.findByText('Móvil válido');
    expect(screen.queryByRole('button', { name: 'Editar comunicaciones' })).not.toBeInTheDocument();
  });

  it('recepción cambia a WhatsApp con opt-in en persona: manda solo lo que cambió', async () => {
    mockedGet.mockResolvedValue(comms({ phone: null, phoneE164: null, phoneStatus: 'MISSING' }));
    mockedUpdate.mockResolvedValue(
      comms({
        contactChannel: 'WHATSAPP',
        whatsappOptIn: { at: '2026-10-17T10:00:00.000Z', source: 'IN_PERSON', recordedBy: null },
      }),
    );
    const user = setupUser();
    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Editar comunicaciones' }));
    const dialog = await screen.findByRole('dialog', { name: 'Comunicaciones del paciente' });
    await user.selectOptions(within(dialog).getByLabelText('Canal de los recordatorios'), 'WHATSAPP');
    await user.type(within(dialog).getByLabelText('Móvil'), '310 123 4567');
    await user.click(
      within(dialog).getByLabelText('Acepta que la clínica le escriba por WhatsApp'),
    );
    expect(within(dialog).getByLabelText('¿Dónde lo aceptó?')).toHaveValue('IN_PERSON');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'p1', {
      contactChannel: 'WHATSAPP',
      phone: '310 123 4567',
      whatsappOptIn: true,
      whatsappOptInSource: 'IN_PERSON',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Canal de los recordatorios').nextSibling).toHaveTextContent('WhatsApp');
  });

  it('WhatsApp sin móvil: lo explica en español sin llamar a la API', async () => {
    mockedGet.mockResolvedValue(comms({ phone: null, phoneE164: null, phoneStatus: 'MISSING' }));
    const user = setupUser();
    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Editar comunicaciones' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Canal de los recordatorios'), 'WHATSAPP');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getByText('Para elegir WhatsApp escribe el móvil del paciente.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Móvil')).toHaveAttribute('aria-invalid', 'true');
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('el 400 de la API (móvil inválido) se muestra en el formulario, que sigue abierto', async () => {
    mockedGet.mockResolvedValue(comms({ phone: '123', phoneE164: null, phoneStatus: 'INVALID' }));
    mockedUpdate.mockRejectedValue(
      new ApiError(400, NEEDS_MOBILE, { messages: [NEEDS_MOBILE] }),
    );
    const user = setupUser();
    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Editar comunicaciones' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Canal de los recordatorios'), 'WHATSAPP');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(NEEDS_MOBILE);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('anotar la baja a petición del paciente', async () => {
    mockedGet.mockResolvedValue(comms());
    mockedUpdate.mockResolvedValue(
      comms({ reminderOptOut: { at: '2026-10-17T10:00:00.000Z', source: 'STAFF' } }),
    );
    const user = setupUser();
    renderSection();
    await user.click(await screen.findByRole('button', { name: 'Editar comunicaciones' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Dado de baja de los recordatorios automáticos'));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'p1', { reminderOptOut: true });
    expect(
      await screen.findByText(/Dado de baja el 17\/10\/2026, anotada por la clínica/),
    ).toBeInTheDocument();
  });

  it('avisa a la ficha del cambio guardado (el teléfono de «Datos» no se queda viejo)', async () => {
    mockedGet.mockResolvedValue(comms({ phone: null, phoneE164: null, phoneStatus: 'MISSING' }));
    const saved = comms({ phone: '+573101234567' });
    mockedUpdate.mockResolvedValue(saved);
    const onChanged = jest.fn();
    const user = setupUser();
    renderSection(true, onChanged);
    await user.click(await screen.findByRole('button', { name: 'Editar comunicaciones' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Móvil'), '310 123 4567');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(saved));
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('un adulto no muestra destinatario; un menor, que los avisos van a su responsable (DX-203)', async () => {
    mockedGet.mockResolvedValueOnce(comms());
    const { unmount } = renderSection();
    expect(await screen.findByText('+57 310 123 4567')).toBeInTheDocument();
    expect(screen.queryByText('Destinatario de los avisos')).not.toBeInTheDocument();
    unmount();

    mockedGet.mockResolvedValueOnce(
      comms({
        recipient: {
          kind: 'RESPONSIBLE',
          name: 'Claudia',
          email: 'claudia@example.com',
          minor: true,
          responsiblePartyId: 'r1',
        },
      }),
    );
    renderSection();
    expect(await screen.findByText('Destinatario de los avisos')).toBeInTheDocument();
    expect(screen.getByText('Destinatario de los avisos').nextSibling).toHaveTextContent(
      'Su responsable, Claudia (claudia@example.com) · menor de edad',
    );
  });

  it('un menor sin tutor ni contacto lo advierte', async () => {
    mockedGet.mockResolvedValue(
      comms({
        recipient: {
          kind: 'PATIENT',
          name: 'Mateo',
          email: null,
          minor: true,
          responsiblePartyId: null,
        },
      }),
    );
    renderSection();
    expect(await screen.findByText('Destinatario de los avisos')).toBeInTheDocument();
    expect(screen.getByText('Destinatario de los avisos').nextSibling).toHaveTextContent(
      'El paciente: es menor de edad y no tiene responsable ni contacto registrado',
    );
  });
});

it('no consulta avisos si el rol no puede editar comunicaciones', async () => {
  jest.clearAllMocks();
  mockedGet.mockResolvedValue(comms());
  renderSection(false);
  await screen.findByText('Activos');
  expect(getPatientOptOutWarnings).not.toHaveBeenCalled();
});
