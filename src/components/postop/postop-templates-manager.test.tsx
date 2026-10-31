import { render, screen, waitFor, within } from '@testing-library/react';
import { PostOpTemplatesManager } from './postop-templates-manager';
import {
  listPostOpTemplates,
  loadSamplePostOpTemplates,
  updatePostOpTemplate,
  type PostOpTemplate,
} from '@/lib/postop/postop-api';
import { listCatalogItems } from '@/lib/odontogram/catalog-api';
import { listAppointmentTypes } from '@/lib/appointments/appointment-types-api';
import { notifyError } from '@/components/errors/notify';
import { Toaster } from '@/components/errors/toaster';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/postop/postop-api', () => ({
  ...jest.requireActual('../../lib/postop/postop-api'),
  listPostOpTemplates: jest.fn(),
  createPostOpTemplate: jest.fn(),
  updatePostOpTemplate: jest.fn(),
  loadSamplePostOpTemplates: jest.fn(),
}));
jest.mock('../../lib/odontogram/catalog-api', () => ({
  ...jest.requireActual('../../lib/odontogram/catalog-api'),
  listCatalogItems: jest.fn(),
}));
jest.mock('../../lib/appointments/appointment-types-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointment-types-api'),
  listAppointmentTypes: jest.fn(),
}));
jest.mock('../errors/notify', () => ({
  ...jest.requireActual('../errors/notify'),
  notifyError: jest.fn(),
}));

const mockedList = listPostOpTemplates as jest.MockedFunction<typeof listPostOpTemplates>;
const mockedUpdate = updatePostOpTemplate as jest.MockedFunction<typeof updatePostOpTemplate>;
const mockedSamples = loadSamplePostOpTemplates as jest.MockedFunction<
  typeof loadSamplePostOpTemplates
>;

function template(overrides: Partial<PostOpTemplate> = {}): PostOpTemplate {
  return {
    id: 'tpl-1',
    code: 'EXO',
    title: 'Después de una exodoncia',
    body: 'Hola {{paciente}}, muerde la gasa 30 minutos.',
    version: 1,
    active: true,
    catalogItems: [
      { id: 'c1', code: 'EXO-01', labelEs: 'Exodoncia simple' },
      { id: 'c2', code: 'CIR-03', labelEs: 'Cirugía de tercer molar' },
    ],
    appointmentTypes: [{ id: 'a1', name: 'Cirugía' }],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const exo = template();

function renderManager(allowed = true) {
  return render(
    <>
      <PostOpTemplatesManager token="tok" allowed={allowed} />
      <Toaster />
    </>,
  );
}

describe('PostOpTemplatesManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([exo]);
    (listCatalogItems as jest.Mock).mockResolvedValue([]);
    (listAppointmentTypes as jest.Mock).mockResolvedValue([]);
  });

  it('solo ADMIN: otro rol ve el candado y no se pide nada', () => {
    renderManager(false);
    expect(screen.getByRole('status')).toHaveTextContent(/solo administración gestiona/i);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('mientras carga muestra un esqueleto; luego la tabla con código, vínculos, estado y versión', async () => {
    renderManager();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Indicaciones postoperatorias' });
    expect(mockedList).toHaveBeenCalledWith('tok');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    expect(headers).toEqual(['Código', 'Título', 'Vínculos', 'Estado', 'Versión', 'Actualizada', 'Acciones']);
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent('EXO');
    expect(row).toHaveTextContent('Después de una exodoncia');
    expect(row).toHaveTextContent('2 procedimientos · 1 tipo de cita');
    expect(row).toHaveTextContent('Activa');
    expect(screen.getByText('1 plantilla')).toBeInTheDocument();
  });

  it('error con reintento que vuelve a pedir la lista; vacío ofrece «Cargar ejemplos»', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    mockedList.mockResolvedValueOnce([]);
    renderManager();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar las indicaciones postoperatorias.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('Caído');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Aún no hay indicaciones')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Cargar ejemplos' })).toBeInTheDocument();
  });

  it('«Cargar ejemplos» añade las 5 plantillas a la lista', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedSamples.mockResolvedValue(
      ['POI-EXO', 'POI-CORDAL', 'POI-ENDO', 'POI-IMPLANTE', 'POI-PROTESIS'].map((code, i) =>
        template({ id: `s${i}`, code, title: `Ejemplo ${code}` }),
      ),
    );
    renderManager();
    await user.click(await screen.findByRole('button', { name: 'Cargar ejemplos' }));
    expect(mockedSamples).toHaveBeenCalledWith('tok');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect(screen.getByText('5 plantillas')).toBeInTheDocument();
    expect(await screen.findByText(/se cargaron 5 plantillas de ejemplo/i)).toBeInTheDocument();
  });

  it('si «Cargar ejemplos» falla avisa con un toast con reintento', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedSamples.mockRejectedValue(new ApiError(500, 'Caído'));
    renderManager();
    await user.click(await screen.findByRole('button', { name: 'Cargar ejemplos' }));
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        'No pudimos cargar las plantillas de ejemplo.',
        expect.objectContaining({ onRetry: expect.any(Function) }),
      ),
    );
  });

  it('edita y la fila muestra la versión que devuelve la API', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...exo, title: 'Tras una exodoncia', version: 2 });
    renderManager();
    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: 'Acciones de «Después de una exodoncia»' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar indicaciones' });
    const title = within(dialog).getByLabelText('Título');
    await user.clear(title);
    await user.type(title, 'Tras una exodoncia');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'tpl-1', { title: 'Tras una exodoncia' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const row = within(screen.getByRole('table')).getAllByRole('row')[1];
    expect(row).toHaveTextContent('Tras una exodoncia');
    expect(within(row).getAllByRole('cell')[4]).toHaveTextContent('2');
    expect(await screen.findByText('Guardada. Ahora va por la versión 2.')).toBeInTheDocument();
  });

  it('desactiva; si falla avisa con un toast con reintento', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValueOnce({ ...exo, active: false });
    mockedUpdate.mockRejectedValueOnce(new Error('red'));
    renderManager();
    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: 'Acciones de «Después de una exodoncia»' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'tpl-1', { active: false });
    await waitFor(() => expect(within(table).getByText('Inactiva')).toBeInTheDocument());

    await user.click(within(table).getByRole('button', { name: 'Acciones de «Después de una exodoncia»' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Activar' }));
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        'No pudimos cambiar el estado de «Después de una exodoncia».',
        expect.objectContaining({ onRetry: expect.any(Function) }),
      ),
    );
  });

  it('sin vínculos lo dice en la fila', async () => {
    mockedList.mockResolvedValue([template({ catalogItems: [], appointmentTypes: [] })]);
    renderManager();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Sin vínculos');
  });
});
