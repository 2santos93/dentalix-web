import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteTemplatesManager } from './note-templates-manager';
import { Toaster } from '@/components/errors/toaster';
import {
  createNoteTemplate,
  listNoteTemplates,
  loadSampleNoteTemplates,
  updateNoteTemplate,
} from '@/lib/clinical-notes/note-templates-api';
import { prophylaxisTemplate, resinTemplate } from './fixtures';

jest.mock('../../lib/clinical-notes/note-templates-api', () => ({
  ...jest.requireActual('../../lib/clinical-notes/note-templates-api'),
  listNoteTemplates: jest.fn(),
  createNoteTemplate: jest.fn(),
  updateNoteTemplate: jest.fn(),
  loadSampleNoteTemplates: jest.fn(),
}));

const mockedList = listNoteTemplates as jest.MockedFunction<typeof listNoteTemplates>;
const mockedCreate = createNoteTemplate as jest.MockedFunction<typeof createNoteTemplate>;
const mockedUpdate = updateNoteTemplate as jest.MockedFunction<typeof updateNoteTemplate>;
const mockedSamples = loadSampleNoteTemplates as jest.MockedFunction<
  typeof loadSampleNoteTemplates
>;

function renderManager(allowed = true) {
  return render(
    <>
      <NoteTemplatesManager token="tok" allowed={allowed} />
      <Toaster />
    </>,
  );
}

describe('NoteTemplatesManager (DX-170)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('vacío: «Aún no hay plantillas» con «Cargar ejemplos», que las trae a la lista', async () => {
    mockedList.mockResolvedValue([]);
    mockedSamples.mockResolvedValue([resinTemplate, prophylaxisTemplate]);
    const user = userEvent.setup();
    renderManager();

    const empty = await screen.findByText('Aún no hay plantillas');
    const action = within(empty.parentElement as HTMLElement).getByRole('button', {
      name: 'Cargar ejemplos',
    });
    await user.click(action);

    await waitFor(() => expect(mockedSamples).toHaveBeenCalledWith('tok'));
    expect(await screen.findByText('2 plantillas')).toBeInTheDocument();
    expect(await screen.findByText(/se cargaron 2 plantillas de ejemplo/i)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /plantillas de evolución/i });
    // Por carpeta: Operatoria antes que Periodoncia.
    expect(within(table).getAllByRole('row').map((r) => r.textContent)).toEqual([
      expect.stringContaining('Plantilla'),
      expect.stringContaining('Resina'),
      expect.stringContaining('Profilaxis'),
    ]);
  });

  it('carga con esqueleto y, si falla, «Reintentar» vuelve a pedirla', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedList.mockResolvedValueOnce([resinTemplate]);
    const user = userEvent.setup();
    renderManager();
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no pudimos cargar las plantillas de evolución/i,
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('1 plantilla')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('crea «Resina» con preguntas ONE, MULTI y TEXT desde el modal', async () => {
    mockedList.mockResolvedValue([]);
    mockedCreate.mockResolvedValue(resinTemplate);
    const user = userEvent.setup();
    renderManager();
    await screen.findByText('Aún no hay plantillas');

    await user.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
    const dialog = await screen.findByRole('dialog', { name: /nueva plantilla de evolución/i });
    await user.type(within(dialog).getByLabelText('Nombre'), 'Resina');
    await user.type(within(dialog).getByLabelText(/^carpeta$/i), 'Operatoria');
    await user.type(within(dialog).getByLabelText(/texto de la plantilla/i), 'Resina en superficie ');

    const add = within(dialog).getByRole('button', { name: 'Añadir pregunta' });
    await user.click(add);
    const p1 = within(dialog).getByRole('listitem', { name: 'Pregunta 1' });
    await user.type(within(p1).getByLabelText('Etiqueta'), 'Superficie');
    await user.type(within(p1).getByLabelText('Opciones'), 'O{Enter}M{Enter}D{Enter}V{Enter}L');
    await user.click(within(p1).getByRole('button', { name: /insertar el marcador de «superficie»/i }));

    await user.click(add);
    const p2 = within(dialog).getByRole('listitem', { name: 'Pregunta 2' });
    await user.type(within(p2).getByLabelText('Etiqueta'), 'Material');
    await user.selectOptions(within(p2).getByLabelText('Tipo'), 'MULTI');
    await user.type(within(p2).getByLabelText('Opciones'), 'Resina A2{Enter}Ionómero');
    await user.selectOptions(within(p2).getByLabelText('Valor por defecto'), 'Resina A2');
    await user.click(within(p2).getByRole('button', { name: /insertar el marcador de «material»/i }));

    await user.click(add);
    const p3 = within(dialog).getByRole('listitem', { name: 'Pregunta 3' });
    await user.type(within(p3).getByLabelText('Etiqueta'), 'Observaciones');
    await user.selectOptions(within(p3).getByLabelText('Tipo'), 'TEXT');
    await user.click(within(p3).getByRole('button', { name: /insertar el marcador de «observaciones»/i }));

    expect(within(dialog).getByLabelText(/texto de la plantilla/i)).toHaveValue(
      'Resina en superficie {{Superficie}} {{Material}} {{Observaciones}}',
    );
    expect(within(dialog).getByRole('region', { name: /vista previa/i })).toHaveTextContent(
      'Resina en superficie [sin respuesta] Resina A2 [sin respuesta]',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Crear plantilla' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate).toHaveBeenCalledWith('tok', {
      name: 'Resina',
      category: 'Operatoria',
      body: 'Resina en superficie {{Superficie}} {{Material}} {{Observaciones}}',
      prompts: [
        { label: 'Superficie', type: 'ONE', options: ['O', 'M', 'D', 'V', 'L'], defaultValue: null },
        { label: 'Material', type: 'MULTI', options: ['Resina A2', 'Ionómero'], defaultValue: 'Resina A2' },
        { label: 'Observaciones', type: 'TEXT', options: [], defaultValue: null },
      ],
    });
    expect(await screen.findByText('1 plantilla')).toBeInTheDocument();
  });

  it('al quitar la opción que era el valor por defecto, no la manda como defecto («Ninguno»)', async () => {
    mockedList.mockResolvedValue([resinTemplate]);
    mockedUpdate.mockResolvedValue(resinTemplate);
    const user = userEvent.setup();
    renderManager();
    // La fila entera abre la edición (su botón es el nombre de la plantilla).
    await user.click(await screen.findByRole('button', { name: 'Resina' }));
    const dialog = await screen.findByRole('dialog', { name: /editar plantilla de evolución/i });
    const p2 = within(dialog).getByRole('listitem', { name: 'Pregunta 2' });
    const options = within(p2).getByLabelText('Opciones');
    await user.clear(options);
    await user.type(options, 'Ionómero{Enter}Adhesivo universal');
    expect(within(p2).getByLabelText('Valor por defecto')).toHaveValue('');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const [, , input] = mockedUpdate.mock.calls[0];
    expect(input.prompts?.[1]).toEqual({
      label: 'Material',
      type: 'MULTI',
      options: ['Ionómero', 'Adhesivo universal'],
      defaultValue: null,
    });
  });

  it('muestra el 400 de la API en español sin cerrar el modal', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedList.mockResolvedValue([]);
    mockedCreate.mockRejectedValue(
      new ApiError(
        400,
        'El marcador {{Diente}} no corresponde a ninguna pregunta: crea una pregunta con esa etiqueta o quítalo del texto',
      ),
    );
    const user = userEvent.setup();
    renderManager();
    await screen.findByText('Aún no hay plantillas');
    await user.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Mala');
    await user.type(within(dialog).getByLabelText(/texto de la plantilla/i), 'Diente {{{{Diente}}');
    await user.click(within(dialog).getByRole('button', { name: 'Crear plantilla' }));
    expect(await within(dialog).findByText(/no corresponde a ninguna pregunta/i)).toBeInTheDocument();
  });

  it('desactiva una plantilla (sale del selector) sin quitarla de la lista', async () => {
    mockedList.mockResolvedValue([resinTemplate]);
    mockedUpdate.mockResolvedValue({ ...resinTemplate, active: false });
    const user = userEvent.setup();
    renderManager();
    const table = await screen.findByRole('table', { name: /plantillas de evolución/i });
    // Editar / Desactivar viven en el «⋯» de la fila.
    await user.click(within(table).getByRole('button', { name: 'Acciones de Resina' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'tpl-resina', { active: false }),
    );
    expect(await within(table).findByText('Desactivada')).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Acciones de Resina' }));
    expect(await screen.findByRole('menuitem', { name: 'Activar' })).toBeInTheDocument();
  });

  it('sin permiso (no ADMIN) no pide nada y lo explica', () => {
    renderManager(false);
    expect(screen.getByText(/solo administración gestiona las plantillas/i)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Nueva plantilla' })).toBeNull();
  });
});
