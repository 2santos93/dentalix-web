import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewEvolutionModal } from './new-evolution-modal';
import { listNoteTemplates } from '@/lib/clinical-notes/note-templates-api';
import { createClinicalEntry } from '@/lib/patients/clinical-api';
import { prophylaxisTemplate, resinTemplate } from './fixtures';

jest.mock('../../lib/clinical-notes/note-templates-api', () => ({
  ...jest.requireActual('../../lib/clinical-notes/note-templates-api'),
  listNoteTemplates: jest.fn(),
}));
jest.mock('../../lib/patients/clinical-api', () => ({
  ...jest.requireActual('../../lib/patients/clinical-api'),
  createClinicalEntry: jest.fn(),
}));

const mockedList = listNoteTemplates as jest.MockedFunction<typeof listNoteTemplates>;
const mockedCreate = createClinicalEntry as jest.MockedFunction<typeof createClinicalEntry>;

const created = {
  id: 'ce-1',
  tenantId: 't1',
  patientId: 'p1',
  entryDate: '2026-10-17T00:00:00.000Z',
  reason: null,
  notes: 'x',
  performedById: 'u1',
  createdAt: '2026-10-17T15:00:00.000Z',
  addenda: [],
};

function renderModal(props: Partial<React.ComponentProps<typeof NewEvolutionModal>> = {}) {
  const onCreated = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <NewEvolutionModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      patientId="p1"
      onCreated={onCreated}
      {...props}
    />,
  );
  return { onCreated, onOpenChange };
}

async function pickResin(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('radio', { name: /resina/i }));
}

describe('NewEvolutionModal (DX-170)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedList.mockResolvedValue([resinTemplate, prophylaxisTemplate]);
    mockedCreate.mockResolvedValue(created);
  });

  it('busca plantillas por nombre o carpeta, sin tildes', async () => {
    const user = userEvent.setup();
    renderModal();
    const search = await screen.findByRole('searchbox', { name: /buscar plantilla/i });
    await user.type(search, 'periodoncia');
    expect(screen.getByRole('radio', { name: /profilaxis/i })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /resina/i })).toBeNull();
    await user.clear(search);
    await user.type(search, 'xyz');
    expect(screen.getByText(/ninguna plantilla coincide con «xyz»/i)).toBeInTheDocument();
  });

  it('muestra todas las preguntas a la vez con los valores por defecto y la vista previa', async () => {
    const user = userEvent.setup();
    renderModal();
    await pickResin(user);

    const questions = screen.getByRole('region', { name: /preguntas de la plantilla/i });
    expect(within(questions).getByRole('group', { name: 'Superficie' })).toBeInTheDocument();
    expect(within(questions).getByRole('group', { name: 'Material' })).toBeInTheDocument();
    expect(within(questions).getByRole('textbox', { name: 'Observaciones' })).toBeInTheDocument();
    expect(within(questions).getByRole('checkbox', { name: 'Resina A2' })).toBeChecked();
    expect(screen.getByLabelText(/texto de la evolución/i)).toHaveValue(
      'Resina en superficie [sin respuesta] con Resina A2. Observaciones: [sin respuesta].',
    );
  });

  it('DENTIST responde y guarda: el texto lleva las respuestas y la plantilla usada', async () => {
    const user = userEvent.setup();
    const { onCreated, onOpenChange } = renderModal();
    await pickResin(user);

    await user.click(screen.getByRole('radio', { name: 'O' }));
    await user.click(screen.getByRole('checkbox', { name: 'Adhesivo universal' }));
    await user.type(screen.getByRole('textbox', { name: 'Observaciones' }), 'Sin sensibilidad');
    expect(screen.getByLabelText(/texto de la evolución/i)).toHaveValue(
      'Resina en superficie O con Resina A2 y Adhesivo universal. Observaciones: Sin sensibilidad.',
    );

    await user.click(screen.getByRole('button', { name: /guardar evolución/i }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', {
      notes:
        'Resina en superficie O con Resina A2 y Adhesivo universal. Observaciones: Sin sensibilidad.',
      templateId: 'tpl-resina',
    });
    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('«Omitir» deja el hueco «[sin respuesta]» aunque haya valor por defecto', async () => {
    const user = userEvent.setup();
    renderModal();
    await pickResin(user);
    await user.click(screen.getByRole('button', { name: /omitir «material»/i }));
    expect(screen.getByRole('button', { name: /omitir «material»/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('checkbox', { name: 'Resina A2' })).toBeDisabled();
    expect(screen.getByLabelText(/texto de la evolución/i)).toHaveValue(
      'Resina en superficie [sin respuesta] con [sin respuesta]. Observaciones: [sin respuesta].',
    );
  });

  it('el texto final se puede editar antes de guardar, y volver a componer', async () => {
    const user = userEvent.setup();
    renderModal();
    await pickResin(user);
    const text = screen.getByLabelText(/texto de la evolución/i);
    await user.clear(text);
    await user.type(text, 'Texto revisado a mano.');
    await user.click(screen.getByRole('radio', { name: 'M' }));
    // Editado a mano: las respuestas ya no lo pisan.
    expect(text).toHaveValue('Texto revisado a mano.');
    await user.click(screen.getByRole('button', { name: /volver a componer/i }));
    expect(text).toHaveValue(
      'Resina en superficie M con Resina A2. Observaciones: [sin respuesta].',
    );
  });

  it('sin plantillas activas lo dice en vez de «ninguna coincide»', async () => {
    mockedList.mockResolvedValue([]);
    renderModal();
    expect(
      await screen.findByText(/la clínica aún no tiene plantillas activas/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ninguna plantilla coincide/i)).toBeNull();
  });

  it('con el teclado las flechas recorren las plantillas sin plegar el selector', async () => {
    const user = userEvent.setup();
    renderModal();
    const none = await screen.findByRole('radio', { name: /sin plantilla/i });
    none.focus();
    await user.keyboard('{ArrowDown}');
    // Las flechas eligen (radio nativo), pero la lista sigue abierta para
    // poder seguir bajando; las preguntas ya se ven.
    expect(screen.getByRole('radio', { name: /profilaxis|resina/i, checked: true })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('radio', { name: /profilaxis|resina/i })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /cambiar la plantilla/i })).toBeNull();
  });

  it('al elegir con el ratón se pliega y el foco pasa a «Cambiar»; «Cambiar» lo devuelve a la lista', async () => {
    const user = userEvent.setup();
    renderModal();
    await pickResin(user);
    const change = screen.getByRole('button', { name: /cambiar la plantilla «resina»/i });
    expect(change).toHaveFocus();
    await user.click(change);
    expect(screen.getByRole('radio', { name: /resina/i })).toHaveFocus();
  });

  it('desde la cita: la liga y dice de qué cita es; la fecha de atención la pone la API (día de la cita en la zona de su sede)', async () => {
    const user = userEvent.setup();
    const start = new Date(2026, 9, 7, 9, 30).toISOString();
    renderModal({ appointment: { id: 'apt-1', start, providerName: 'Dra. Ríos' } });
    expect(
      screen.getByRole('dialog', { name: /registrar evolución/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Cita del 07/10 · Dra. Ríos')).toBeInTheDocument();
    expect(screen.queryByLabelText(/fecha de atención/i)).toBeNull();
    await screen.findByRole('radio', { name: /resina/i });
    await user.type(screen.getByLabelText(/texto de la evolución/i), 'Control sin novedad');
    await user.click(screen.getByRole('button', { name: /guardar evolución/i }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', {
        notes: 'Control sin novedad',
        appointmentId: 'apt-1',
      }),
    );
  });

  it('sin texto no guarda y lo dice junto al campo', async () => {
    const user = userEvent.setup();
    renderModal();
    await screen.findByRole('radio', { name: /resina/i });
    await user.click(screen.getByRole('button', { name: /guardar evolución/i }));
    expect(await screen.findByText(/escribe el texto de la evolución/i)).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('si las plantillas no cargan, el selector se sustituye por un reintento y lo demás sigue', async () => {
    mockedList.mockRejectedValueOnce(new Error('sin red'));
    const user = userEvent.setup();
    renderModal();
    expect(await screen.findByText('Plantillas no disponibles')).toBeInTheDocument();
    expect(screen.getByLabelText(/texto de la evolución/i)).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('radio', { name: /resina/i })).toBeInTheDocument();
  });

  it('si la API rechaza, el modal sigue abierto con el error en español', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedCreate.mockRejectedValue(new ApiError(400, 'La plantilla está desactivada: actívala en Ajustes'));
    const user = userEvent.setup();
    const { onOpenChange } = renderModal();
    await pickResin(user);
    await user.click(screen.getByRole('button', { name: /guardar evolución/i }));
    expect(await screen.findByText(/la plantilla está desactivada/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
