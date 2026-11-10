import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewEvolutionModal } from './new-evolution-modal';
import { listNoteTemplates } from '@/lib/clinical-notes/note-templates-api';
import { createClinicalEntry, getClinicalEntrySigning } from '@/lib/patients/clinical-api';
import { toast } from 'sonner';
import { controlTemplate, prophylaxisTemplate, resinTemplate } from './fixtures';
import { searchIcd10 } from '@/lib/reference/icd10-api';

// DX-378: el día de la cita sale con la zona y el formato de la sede (Caracas, es-VE).
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(() => Promise.resolve([jest.requireActual('../../lib/test/sede-clock').caracasSede()])),
}));
jest.mock('../../lib/clinical-notes/note-templates-api', () => ({
  ...jest.requireActual('../../lib/clinical-notes/note-templates-api'),
  listNoteTemplates: jest.fn(),
}));
jest.mock('../../lib/patients/clinical-api', () => ({
  ...jest.requireActual('../../lib/patients/clinical-api'),
  createClinicalEntry: jest.fn(),
  getClinicalEntrySigning: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { warning: jest.fn(), success: jest.fn(), error: jest.fn() } }));
const mockedWarning = toast.warning as jest.Mock;

jest.mock('../../lib/reference/icd10-api', () => ({ searchIcd10: jest.fn() }));
const mockedIcd10 = searchIcd10 as jest.MockedFunction<typeof searchIcd10>;

const mockedList = listNoteTemplates as jest.MockedFunction<typeof listNoteTemplates>;
const mockedCreate = createClinicalEntry as jest.MockedFunction<typeof createClinicalEntry>;
const mockedSigning = getClinicalEntrySigning as jest.MockedFunction<typeof getClinicalEntrySigning>;
const SIGNED_OK = { professionalLicense: 'RP-1', warnMissingProfessionalLicense: true, warnings: [] };
const MISSING = {
  code: 'PROFESSIONAL_LICENSE_MISSING' as const,
  message: 'La evolución se guardó sin tu número de registro profesional.',
};

function tokenForRole(role: string): string {
  const part = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part('{"alg":"HS256"}')}.${part(JSON.stringify({ sub: 'u-me', tenantId: 't1', role }))}.sig`;
}

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
    mockedSigning.mockReset();
    mockedSigning.mockResolvedValue(SIGNED_OK);
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

  describe('DX-354b (E9): «hoy» es el de la sede, no el del navegador', () => {
    // 02:30Z del 5 de noviembre: en Caracas (UTC-4) aún es el 4; el navegador (UTC) y Tokio ya están en el 5.
    beforeEach(() => {
      jest.useFakeTimers({
        now: new Date('2026-11-05T02:30:00Z'),
        doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
      });
    });
    afterEach(() => jest.useRealTimers());

    async function typeEntryDate(user: ReturnType<typeof userEvent.setup>, ddmmyyyy: string) {
      const group = await screen.findByRole('group', { name: /fecha de atención/i });
      await user.click(within(group).getAllByRole('spinbutton')[0]);
      await user.keyboard(ddmmyyyy);
    }

    it('rechaza el 5 de noviembre, que en la sede todavía es futuro', async () => {
      const user = userEvent.setup();
      renderModal();
      await pickResin(user);
      await typeEntryDate(user, '05112026');
      await user.click(screen.getByRole('button', { name: /guardar evolución/i }));
      expect(await screen.findByText('La fecha de atención no puede ser futura.')).toBeInTheDocument();
      expect(mockedCreate).not.toHaveBeenCalled();
    });

    it('acepta el 4 de noviembre, el día de la sede', async () => {
      const user = userEvent.setup();
      mockedCreate.mockResolvedValue(created);
      renderModal();
      await pickResin(user);
      await typeEntryDate(user, '04112026');
      await user.click(screen.getByRole('button', { name: /guardar evolución/i }));
      await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
      expect(mockedCreate.mock.calls[0][2]).toMatchObject({ entryDate: '2026-11-04T00:00:00.000Z' });
    });

    it('sin la zona de la sede el campo de fecha se sustituye por su error y no se puede guardar', async () => {
      const { listLocations } = jest.requireMock('../../lib/locations/locations-api') as { listLocations: jest.Mock };
      listLocations.mockImplementationOnce(() => Promise.reject(new Error('boom')));
      listLocations.mockImplementationOnce(() => Promise.reject(new Error('boom')));
      listLocations.mockImplementationOnce(() => Promise.reject(new Error('boom')));
      renderModal();
      expect(await screen.findByText('Sin formato de sede')).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: /fecha de atención/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /guardar evolución/i })).toBeDisabled();
    });
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
    expect(await screen.findByText('Cita del 7/10 · Dra. Ríos')).toBeInTheDocument();
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

describe('NewEvolutionModal · diagnósticos CIE-10 (DX-212)', () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([]);
    mockedCreate.mockReset().mockResolvedValue(created);
    mockedIcd10.mockReset().mockImplementation((_token, q) =>
      Promise.resolve(
        q.toLowerCase().startsWith('k05')
          ? [{ code: 'K05.1', labelEs: 'Gingivitis crónica' }]
          : [{ code: 'K02.1', labelEs: 'Caries de la dentina' }],
      ),
    );
  });

  it('guarda el principal y un relacionado en el 36 junto con la evolución', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByRole('textbox', { name: 'Texto de la evolución' }), 'Resina en 36');
    await user.type(
      screen.getByRole('combobox', { name: 'Diagnóstico principal (CIE-10)' }),
      'caries',
    );
    await user.click(await screen.findByRole('option', { name: /K02\.1/ }));
    await user.click(screen.getByRole('button', { name: /añadir relacionado/i }));
    await user.type(screen.getByRole('combobox', { name: 'Diagnóstico relacionado 1' }), 'K05');
    await user.click(await screen.findByRole('option', { name: /K05\.1/ }));
    await user.type(
      screen.getByRole('textbox', { name: /Diente \(FDI\) · Diagnóstico relacionado 1/ }),
      '36',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar evolución' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][2]).toMatchObject({
      notes: 'Resina en 36',
      diagnoses: [
        { icd10Code: 'K02.1', kind: 'PRINCIPAL' },
        { icd10Code: 'K05.1', kind: 'RELACIONADO', toothFdi: '36' },
      ],
    });
  });

  it('sin diagnóstico avisa pero deja guardar (sin el campo)', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.getByText('Opcional: puedes guardar la evolución sin diagnóstico.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Texto de la evolución' }), 'Control');
    await user.click(screen.getByRole('button', { name: 'Guardar evolución' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][2]).not.toHaveProperty('diagnoses');
  });

  it('un diente que no es FDI no se envía', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByRole('textbox', { name: 'Texto de la evolución' }), 'x');
    await user.type(
      screen.getByRole('combobox', { name: 'Diagnóstico principal (CIE-10)' }),
      'caries',
    );
    await user.click(await screen.findByRole('option', { name: /K02\.1/ }));
    await user.type(
      screen.getByRole('textbox', { name: /Diente \(FDI\) · Diagnóstico principal/ }),
      '19',
    );
    await user.click(screen.getByRole('button', { name: 'Guardar evolución' }));
    expect(await screen.findByText('El diente «19» no es un número FDI válido.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});


describe('NewEvolutionModal · registro profesional (DX-540)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedSigning.mockReset();
    mockedWarning.mockClear();
    mockedList.mockResolvedValue([resinTemplate]);
  });

  async function writeAndSave(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('radio', { name: /resina/i });
    await user.type(screen.getByLabelText(/texto de la evolución/i), 'Control');
    await user.click(screen.getByRole('button', { name: /guardar evolución/i }));
  }

  it('sin registro y con el aviso activo: lo dice antes de guardar, y guarda igual', async () => {
    const user = userEvent.setup();
    mockedSigning.mockResolvedValue({
      professionalLicense: null,
      warnMissingProfessionalLicense: true,
      warnings: [MISSING],
    });
    mockedCreate.mockResolvedValue({ ...created, authorProfessionalLicense: null, warnings: [MISSING] });
    const { onCreated } = renderModal({ token: tokenForRole('DENTIST') });

    const notice = await screen.findByText(/vas a firmar sin registro profesional/i);
    expect(notice.closest('[role="status"]')).toHaveTextContent(/pide a un administrador/i);
    expect(mockedSigning).toHaveBeenCalledWith(tokenForRole('DENTIST'));
    // El botón de guardar sigue activo: el aviso no bloquea.
    expect(screen.getByRole('button', { name: /guardar evolución/i })).toBeEnabled();

    await writeAndSave(user);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockedWarning).toHaveBeenCalledWith('Evolución guardada sin registro profesional', {
      description: MISSING.message,
      duration: 10000,
    });
  });

  it('ADMIN sin registro: el aviso enlaza a su ficha de Personal', async () => {
    mockedSigning.mockResolvedValue({
      professionalLicense: null,
      warnMissingProfessionalLicense: true,
      warnings: [MISSING],
    });
    renderModal({ token: tokenForRole('ADMIN') });
    const link = await screen.findByRole('link', { name: /cargar mi registro en personal/i });
    expect(link).toHaveAttribute('href', '/staff/u-me');
  });

  it('con registro (o con el aviso desactivado): ni aviso previo ni toast', async () => {
    const user = userEvent.setup();
    mockedSigning.mockResolvedValue(SIGNED_OK);
    mockedCreate.mockResolvedValue({ ...created, authorProfessionalLicense: 'RP-1', warnings: [] });
    const { onCreated } = renderModal({ token: tokenForRole('DENTIST') });
    await writeAndSave(user);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(screen.queryByText(/vas a firmar sin registro profesional/i)).toBeNull();
    expect(mockedWarning).not.toHaveBeenCalled();
  });

  it('si no se puede consultar la firma, el flujo sigue igual y el aviso llega tras guardar', async () => {
    const user = userEvent.setup();
    mockedSigning.mockRejectedValue(new Error('red'));
    mockedCreate.mockResolvedValue({ ...created, warnings: [MISSING] });
    const { onCreated } = renderModal({ token: tokenForRole('DENTIST') });
    await writeAndSave(user);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(screen.queryByText(/vas a firmar sin registro profesional/i)).toBeNull();
    expect(mockedWarning).toHaveBeenCalledTimes(1);
  });
});

describe('NewEvolutionModal · atajos de plantilla (DX-455)', () => {
  const resinWithShortcut = { ...resinTemplate, shortcut: '#resina' };

  beforeEach(() => {
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedList.mockResolvedValue([resinWithShortcut, controlTemplate, prophylaxisTemplate]);
    mockedCreate.mockResolvedValue(created);
    mockedSigning.mockReset();
    mockedSigning.mockResolvedValue(SIGNED_OK);
  });

  async function notesField() {
    await screen.findByRole('radio', { name: /resina/i });
    return screen.getByLabelText(/texto de la evolución/i) as HTMLTextAreaElement;
  }

  it('«#control » se sustituye por el texto de la plantilla, sin distinguir mayúsculas, y se anuncia', async () => {
    const user = userEvent.setup();
    renderModal();
    const notes = await notesField();
    await user.type(notes, 'Paciente acude. #CONTROL ');
    expect(notes).toHaveValue('Paciente acude. Control sin dolor ni sangrado. Cicatrización normal.');
    expect(notes.selectionStart).toBe(notes.value.length);
    expect(notes).toHaveFocus();
    expect(screen.getByText('Plantilla «Control postoperatorio» insertada.')).toBeInTheDocument();
    // La inserción es texto: no cambia la plantilla elegida (sigue «Sin plantilla»).
    expect(screen.getByRole('radio', { name: /sin plantilla/i })).toBeChecked();
  });

  it('el cursor queda al final de lo insertado aunque haya texto detrás', async () => {
    const user = userEvent.setup();
    renderModal();
    const notes = await notesField();
    await user.type(notes, 'Antes . Después');
    await user.type(notes, '#control ', { initialSelectionStart: 6, initialSelectionEnd: 6 });
    const body = controlTemplate.body;
    expect(notes).toHaveValue(`Antes ${body}. Después`);
    expect(notes.selectionStart).toBe(6 + body.length);
    expect(notes.selectionEnd).toBe(6 + body.length);
  });

  it('un atajo desconocido se queda como texto', async () => {
    const user = userEvent.setup();
    renderModal();
    const notes = await notesField();
    await user.type(notes, '#otro y #control.');
    expect(notes).toHaveValue('#otro y #control.');
  });

  it('una plantilla desactivada nunca se inserta por atajo', async () => {
    mockedList.mockResolvedValue([resinWithShortcut, { ...controlTemplate, active: false }]);
    const user = userEvent.setup();
    renderModal();
    const notes = await notesField();
    await user.type(notes, '#control ');
    expect(notes).toHaveValue('#control ');
  });

  it('con preguntas abre las mismas preguntas de la plantilla e inserta el texto compuesto', async () => {
    const user = userEvent.setup();
    renderModal();
    const notes = await notesField();
    await user.type(notes, 'Pieza 16: #resina ');
    const panel = screen.getByRole('group', { name: 'Preguntas de «Resina»' });
    expect(panel).toHaveFocus();
    // Mientras se contesta, el atajo sigue escrito y no se puede guardar.
    expect(notes).toHaveValue('Pieza 16: #resina ');
    expect(screen.getByRole('button', { name: /guardar evolución/i })).toBeDisabled();
    await user.click(within(panel).getByRole('radio', { name: 'O' }));
    await user.type(within(panel).getByRole('textbox', { name: 'Observaciones' }), 'Sin sensibilidad');
    await user.click(within(panel).getByRole('button', { name: 'Insertar en el texto' }));

    const text = 'Pieza 16: Resina en superficie O con Resina A2. Observaciones: Sin sensibilidad.';
    expect(notes).toHaveValue(text);
    expect(notes).toHaveFocus();
    expect(notes.selectionStart).toBe(text.length);
    expect(screen.queryByRole('group', { name: 'Preguntas de «Resina»' })).not.toBeInTheDocument();
    expect(screen.getByText('Plantilla «Resina» insertada.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /guardar evolución/i }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', { notes: text }));
  });

  it('«Cancelar» en las preguntas deja el atajo como texto', async () => {
    const user = userEvent.setup();
    renderModal();
    const notes = await notesField();
    await user.type(notes, '#Resina ');
    const panel = screen.getByRole('group', { name: 'Preguntas de «Resina»' });
    await user.click(within(panel).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('group', { name: 'Preguntas de «Resina»' })).not.toBeInTheDocument();
    expect(notes).toHaveValue('#Resina ');
    expect(notes).toHaveFocus();
  });

  it('un {{marcador}} sin rellenar desactiva «Guardar» y dice cuál falta', async () => {
    mockedList.mockResolvedValue([{ ...controlTemplate, body: 'Control del diente {{Diente}}.' }]);
    const user = userEvent.setup();
    renderModal();
    await screen.findByRole('radio', { name: /control/i });
    const notes = screen.getByLabelText(/texto de la evolución/i);
    await user.type(notes, '#control ');
    expect(notes).toHaveValue('Control del diente {{Diente}}.');
    const save = screen.getByRole('button', { name: /guardar evolución/i });
    expect(save).toBeDisabled();
    expect(notes).toHaveAccessibleDescription('Falta rellenar {{Diente}}.');
    expect(notes).toHaveAttribute('aria-invalid', 'true');

    await user.clear(notes);
    await user.type(notes, 'Control del diente 16.');
    expect(save).toBeEnabled();
    expect(screen.queryByText(/falta rellenar/i)).not.toBeInTheDocument();
  });

  it('varios marcadores sin rellenar se nombran todos', async () => {
    const user = userEvent.setup();
    renderModal();
    const notes = await notesField();
    await user.type(notes, '{{{{Diente}} y {{{{Cara}}');
    expect(notes).toHaveAccessibleDescription('Faltan por rellenar {{Diente}} y {{Cara}}.');
  });

  describe('plantilla sugerida por el procedimiento', () => {
    it('viene elegida con sus preguntas y lo dice; se puede cambiar', async () => {
      const user = userEvent.setup();
      renderModal({ suggestedTemplateId: 'tpl-resina', suggestedBy: 'Resina compuesta' });
      expect(await screen.findByRole('button', { name: 'Cambiar la plantilla «Resina»' })).toBeInTheDocument();
      expect(screen.getByText(/sugerida por el procedimiento «Resina compuesta»/i)).toBeInTheDocument();
      expect(screen.getByRole('region', { name: /preguntas de la plantilla/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/texto de la evolución/i)).toHaveValue(
        'Resina en superficie [sin respuesta] con Resina A2. Observaciones: [sin respuesta].',
      );

      await user.click(screen.getByRole('button', { name: 'Cambiar la plantilla «Resina»' }));
      await user.click(screen.getByRole('radio', { name: /profilaxis/i }));
      expect(screen.getByLabelText(/texto de la evolución/i)).toHaveValue('Profilaxis con Ultrasonido.');
      expect(screen.queryByText(/sugerida por el procedimiento/i)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /guardar evolución/i }));
      await waitFor(() =>
        expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', {
          notes: 'Profilaxis con Ultrasonido.',
          templateId: 'tpl-profilaxis',
        }),
      );
    });

    it('«Quitar plantilla» la quita junto con su texto antes de guardar', async () => {
      const user = userEvent.setup();
      renderModal({ suggestedTemplateId: 'tpl-resina', suggestedBy: 'Resina compuesta' });
      await user.click(await screen.findByRole('button', { name: 'Quitar plantilla' }));
      expect(screen.getByRole('radio', { name: /sin plantilla/i })).toBeChecked();
      expect(screen.getByLabelText(/texto de la evolución/i)).toHaveValue('');
      expect(screen.queryByRole('region', { name: /preguntas de la plantilla/i })).not.toBeInTheDocument();
      await user.type(screen.getByLabelText(/texto de la evolución/i), 'Hecho sin incidencias.');
      await user.click(screen.getByRole('button', { name: /guardar evolución/i }));
      await waitFor(() =>
        expect(mockedCreate).toHaveBeenCalledWith('tok', 'p1', { notes: 'Hecho sin incidencias.' }),
      );
    });

    it('una sugerida que no está entre las activas no se elige', async () => {
      renderModal({ suggestedTemplateId: 'tpl-desactivada', suggestedBy: 'Resina compuesta' });
      expect(await screen.findByRole('radio', { name: /sin plantilla/i })).toBeChecked();
      expect(screen.queryByText(/sugerida por el procedimiento/i)).not.toBeInTheDocument();
    });
  });
});
