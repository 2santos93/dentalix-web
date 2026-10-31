import { render, screen, waitFor, within } from '@testing-library/react';
import { PostOpTemplateFormModal } from './postop-template-form-modal';
import {
  createPostOpTemplate,
  updatePostOpTemplate,
  type PostOpTemplate,
} from '@/lib/postop/postop-api';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import { listAppointmentTypes, type AppointmentType } from '@/lib/appointments/appointment-types-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/postop/postop-api', () => ({
  ...jest.requireActual('../../lib/postop/postop-api'),
  createPostOpTemplate: jest.fn(),
  updatePostOpTemplate: jest.fn(),
}));
jest.mock('../../lib/odontogram/catalog-api', () => ({
  ...jest.requireActual('../../lib/odontogram/catalog-api'),
  listCatalogItems: jest.fn(),
}));
jest.mock('../../lib/appointments/appointment-types-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointment-types-api'),
  listAppointmentTypes: jest.fn(),
}));

const mockedCreate = createPostOpTemplate as jest.MockedFunction<typeof createPostOpTemplate>;
const mockedUpdate = updatePostOpTemplate as jest.MockedFunction<typeof updatePostOpTemplate>;
const mockedCatalog = listCatalogItems as jest.MockedFunction<typeof listCatalogItems>;
const mockedTypes = listAppointmentTypes as jest.MockedFunction<typeof listAppointmentTypes>;

function catalogItem(id: string, code: string, labelEs: string): DentalCatalogItem {
  return {
    id,
    tenantId: 't1',
    code,
    category: null,
    kind: 'PROCEDURE',
    labelEs,
    labelEn: null,
    labelPt: null,
    color: '#888888',
    defaultPrice: null,
    active: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function appointmentType(id: string, name: string): AppointmentType {
  return {
    id,
    tenantId: 't1',
    name,
    durationMinutes: 60,
    color: '#7C3AED',
    active: true,
    isUrgent: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

const exo: PostOpTemplate = {
  id: 'tpl-1',
  code: 'EXO',
  title: 'Después de una exodoncia',
  body: 'Hola {{paciente}}, muerde la gasa 30 minutos.',
  version: 1,
  active: true,
  catalogItems: [{ id: 'c1', code: 'EXO-01', labelEs: 'Exodoncia simple' }],
  appointmentTypes: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function renderModal(template: PostOpTemplate | null = null) {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <PostOpTemplateFormModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      template={template}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange, dialog: screen.getByRole('dialog') };
}

describe('PostOpTemplateFormModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCatalog.mockResolvedValue([
      catalogItem('c1', 'EXO-01', 'Exodoncia simple'),
      catalogItem('c2', 'CIR-03', 'Cirugía de tercer molar'),
    ]);
    mockedTypes.mockResolvedValue([appointmentType('a1', 'Cirugía'), appointmentType('a2', 'Control')]);
  });

  it('carga solo procedimientos activos y los tipos de cita', async () => {
    renderModal();
    await screen.findByRole('checkbox', { name: /exodoncia simple/i });
    expect(mockedCatalog).toHaveBeenCalledWith('tok', { kind: 'PROCEDURE', activeOnly: true });
    expect(mockedTypes).toHaveBeenCalledWith('tok');
    expect(screen.getByRole('group', { name: 'Tipos de cita' })).toBeInTheDocument();
  });

  it('crea: código en mayúsculas, variable insertada y vínculos elegidos', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({ ...exo, id: 'tpl-2', code: 'CIR-3M' });
    const { onSaved, onOpenChange, dialog } = renderModal();
    await within(dialog).findByRole('checkbox', { name: /cirugía de tercer molar/i });

    await user.type(within(dialog).getByLabelText('Código'), 'cir-3m');
    expect(within(dialog).getByLabelText('Código')).toHaveValue('CIR-3M');
    await user.type(within(dialog).getByLabelText('Título'), 'Tras cirugía de cordal');
    await user.type(within(dialog).getByLabelText('Indicaciones'), 'Hola ');
    await user.click(within(dialog).getByRole('button', { name: /\{\{paciente\}\}/ }));
    expect(within(dialog).getByLabelText('Indicaciones')).toHaveValue('Hola {{paciente}}');
    await user.click(within(dialog).getByRole('checkbox', { name: /cirugía de tercer molar/i }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Cirugía' }));

    await user.click(within(dialog).getByRole('button', { name: 'Crear plantilla' }));
    expect(mockedCreate).toHaveBeenCalledWith('tok', {
      code: 'CIR-3M',
      title: 'Tras cirugía de cordal',
      body: 'Hola {{paciente}}',
      catalogItemIds: ['c2'],
      appointmentTypeIds: ['a1'],
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'tpl-2' })));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('valida el código con el patrón del dominio al salir del campo', async () => {
    const user = setupUser();
    const { dialog } = renderModal();
    await user.type(within(dialog).getByLabelText('Código'), 'a');
    await user.tab();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'El código admite de 2 a 20 letras mayúsculas, números o guiones.',
    );
    expect(within(dialog).getByLabelText('Código')).toHaveAttribute('aria-invalid', 'true');
    await user.type(within(dialog).getByLabelText('Título'), 'X');
    await user.type(within(dialog).getByLabelText('Indicaciones'), 'Texto');
    await user.click(within(dialog).getByRole('button', { name: 'Crear plantilla' }));
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('avisa de variables desconocidas con un error en línea y no deja crear', async () => {
    const user = setupUser();
    const { dialog } = renderModal();
    await user.type(within(dialog).getByLabelText('Código'), 'EXO');
    await user.type(within(dialog).getByLabelText('Título'), 'X');
    // userEvent interpreta `{` como tecla especial: se escapa duplicándola.
    await user.type(within(dialog).getByLabelText('Indicaciones'), 'Hola {{{{edad}}');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Estas variables no existen: {{edad}}.',
    );
    expect(within(dialog).getByRole('button', { name: 'Crear plantilla' })).toBeDisabled();
  });

  it('edita: el código no se puede cambiar y solo se envía lo que cambió', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...exo, title: 'Tras una exodoncia', version: 2 });
    const { onSaved, dialog } = renderModal(exo);
    expect(within(dialog).getByLabelText('Código')).toHaveAttribute('readonly');
    expect(within(dialog).getByLabelText('Código')).toHaveValue('EXO');
    expect(dialog).toHaveTextContent(/sube la versión/i);
    await within(dialog).findByRole('checkbox', { name: /exodoncia simple/i });
    expect(within(dialog).getByRole('checkbox', { name: /exodoncia simple/i })).toBeChecked();

    const title = within(dialog).getByLabelText('Título');
    await user.clear(title);
    await user.type(title, 'Tras una exodoncia');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'tpl-1', { title: 'Tras una exodoncia' });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 2 })));
  });

  it('edita vínculos: envía la lista completa de procedimientos y no toca el texto', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue(exo);
    const { dialog } = renderModal(exo);
    await user.click(await within(dialog).findByRole('checkbox', { name: /cirugía de tercer molar/i }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'tpl-1', { catalogItemIds: ['c1', 'c2'] });
  });

  it('sin cambios no llama a la API y cierra', async () => {
    const user = setupUser();
    const { onOpenChange, dialog } = renderModal(exo);
    await within(dialog).findByRole('checkbox', { name: /exodoncia simple/i });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('un vínculo a un procedimiento ya inactivo sigue visible y marcado', async () => {
    mockedCatalog.mockResolvedValue([catalogItem('c2', 'CIR-03', 'Cirugía de tercer molar')]);
    const { dialog } = renderModal(exo);
    expect(
      await within(dialog).findByRole('checkbox', { name: /exodoncia simple/i }),
    ).toBeChecked();
  });

  it('si fallan las opciones de vínculos, las sustituye con reintento y el resto sigue', async () => {
    const user = setupUser();
    mockedCatalog.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    const { dialog } = renderModal();
    const retry = await within(dialog).findByRole('button', { name: 'Reintentar' });
    expect(within(dialog).getByLabelText('Título')).toBeEnabled();
    await user.click(retry);
    expect(await within(dialog).findByRole('checkbox', { name: /exodoncia simple/i })).toBeInTheDocument();
    expect(mockedCatalog).toHaveBeenCalledTimes(2);
  });

  it('Enter en el filtro de procedimientos no envía el formulario', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue(exo);
    const { onOpenChange, dialog } = renderModal();
    await user.type(within(dialog).getByLabelText('Código'), 'EXO');
    await user.type(within(dialog).getByLabelText('Título'), 'X');
    await user.type(within(dialog).getByLabelText('Indicaciones'), 'Texto');
    const filter = await within(dialog).findByRole('searchbox', { name: /buscar procedimiento/i });
    await user.type(filter, 'exo{Enter}');
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(dialog).getAllByRole('checkbox', { name: /exodoncia simple/i })).toHaveLength(1);
  });

  it('muestra el error de la API dentro del modal', async () => {
    const user = setupUser();
    mockedCreate.mockRejectedValue(new ApiError(409, 'Ya existe una plantilla con ese código.'));
    const { dialog } = renderModal();
    await user.type(within(dialog).getByLabelText('Código'), 'EXO');
    await user.type(within(dialog).getByLabelText('Título'), 'X');
    await user.type(within(dialog).getByLabelText('Indicaciones'), 'Texto');
    await user.click(within(dialog).getByRole('button', { name: 'Crear plantilla' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/ya existe una plantilla/i);
  });
  it.each([null, exo])('el código describe su hint en alta y edición (%p)', async (template) => {
    renderModal(template);
    const input = screen.getByLabelText('Código');
    expect(input).toHaveAccessibleDescription(template ? 'El código no se puede cambiar.' : 'Corto y único, p. ej. EXO o CIR-3M. No se puede cambiar después.');
    await screen.findByRole('checkbox', { name: /exodoncia simple/i });
  });

  it('marca retirados y al cambiar vínculos solo envía procedimientos activos', async () => {
    const user = setupUser();
    mockedCatalog.mockResolvedValue([catalogItem('c2', 'CIR-03', 'Cirugía de tercer molar')]);
    mockedUpdate.mockResolvedValue(exo);
    const { dialog } = renderModal(exo);
    const retired = await within(dialog).findByRole('checkbox', { name: /Exodoncia simple.*retirado/i });
    expect(retired).toBeChecked();
    expect(retired).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /Cirugía de tercer molar/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'tpl-1', { catalogItemIds: ['c2'] });
  });

  it('editar solo el título conserva el vínculo retirado sin reenviarlo', async () => {
    const user = setupUser();
    mockedCatalog.mockResolvedValue([]);
    mockedUpdate.mockResolvedValue(exo);
    renderModal(exo);
    await screen.findByRole('checkbox', { name: /Exodoncia simple/ });
    await user.type(screen.getByLabelText('Título'), ' actualizado');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'tpl-1', { title: exo.title + ' actualizado' });
  });

});
