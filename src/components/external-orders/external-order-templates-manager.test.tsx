import { render, screen, waitFor, within } from '@testing-library/react';
import { ExternalOrderTemplatesManager } from './external-order-templates-manager';
import {
  createExternalOrderTemplate,
  listExternalOrderTemplates,
  updateExternalOrderTemplate,
} from '@/lib/external-orders/external-orders-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeExternalOrderTemplate } from '@/lib/test/external-orders';

jest.mock('../../lib/external-orders/external-orders-api', () => ({
  ...jest.requireActual('../../lib/external-orders/external-orders-api'),
  listExternalOrderTemplates: jest.fn(),
  createExternalOrderTemplate: jest.fn(),
  updateExternalOrderTemplate: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = jest.mocked(listExternalOrderTemplates);
const mockedCreate = jest.mocked(createExternalOrderTemplate);
const mockedUpdate = jest.mocked(updateExternalOrderTemplate);
const TABLE = 'Plantillas de orden';

describe('ExternalOrderTemplatesManager (DX-572)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
  });

  it('vacío: la primaria vive en el vacío y crea una plantilla', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedCreate.mockResolvedValue(makeExternalOrderTemplate({ name: 'Panorámica', recipient: null }));
    render(<ExternalOrderTemplatesManager token="tok" />);
    expect(await screen.findByText('Aún no hay plantillas de orden')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { includeInactive: true });
    await user.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva plantilla de orden' });
    await user.click(within(dialog).getByRole('button', { name: 'Crear plantilla' }));
    expect(await within(dialog).findByText('Escribe un nombre (hasta 80 caracteres).')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Nombre', { exact: true }), 'Panorámica');
    await user.click(within(dialog).getByRole('button', { name: 'Crear plantilla' }));
    expect(await within(dialog).findByText('Escribe al menos un estudio.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Estudio 1', { exact: true }), 'Radiografía panorámica');
    await user.click(within(dialog).getByRole('button', { name: 'Crear plantilla' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        name: 'Panorámica',
        kind: 'IMAGING',
        items: ['Radiografía panorámica'],
        active: true,
      }),
    );
    expect(await screen.findByRole('table', { name: TABLE })).toHaveTextContent('Panorámica');
  });

  it('un nombre repetido (409) sale junto al campo', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeExternalOrderTemplate()]);
    mockedCreate.mockRejectedValue(
      new ApiError(409, 'Ya hay una plantilla con ese nombre.', { code: 'EXTERNAL_ORDER_TEMPLATE_DUPLICATE_NAME' }),
    );
    render(<ExternalOrderTemplatesManager token="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Nueva plantilla' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva plantilla de orden' });
    await user.type(within(dialog).getByLabelText('Nombre', { exact: true }), 'Radiografía panorámica');
    await user.type(within(dialog).getByLabelText('Estudio 1', { exact: true }), 'Panorámica');
    await user.click(within(dialog).getByRole('button', { name: 'Crear plantilla' }));
    expect(await within(dialog).findByText('Ya hay una plantilla con ese nombre.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Nombre', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  });

  it('editar manda la versión; un 409 de versión ofrece «Recargar» con la guardada', async () => {
    const user = setupUser();
    mockedList
      .mockResolvedValueOnce([makeExternalOrderTemplate()])
      .mockResolvedValueOnce([makeExternalOrderTemplate({ version: 2, recipient: 'Centro Nuevo' })]);
    mockedUpdate.mockRejectedValueOnce(new ApiError(409, 'Cambió.', { code: 'EXTERNAL_ORDER_TEMPLATE_STALE' }));
    render(<ExternalOrderTemplatesManager token="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Acciones de Radiografía panorámica' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar plantilla de orden' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'tpl1', expect.objectContaining({ version: 1 })),
    );
    expect(await within(dialog).findByText(/La plantilla cambió mientras la editabas/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Recargar' }));
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Destinatario habitual (opcional)', { exact: true })).toHaveValue('Centro Nuevo'),
    );
    mockedUpdate.mockResolvedValueOnce(makeExternalOrderTemplate({ version: 3, recipient: 'Centro Nuevo' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenLastCalledWith('tok', 'tpl1', expect.objectContaining({ version: 2 })),
    );
  });

  it('desactivar y activar con la versión', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([makeExternalOrderTemplate()]);
    mockedUpdate.mockResolvedValue(makeExternalOrderTemplate({ active: false, version: 2 }));
    render(<ExternalOrderTemplatesManager token="tok" />);
    const table = await screen.findByRole('table', { name: TABLE });
    expect(table).toHaveTextContent('Activa');
    await user.click(screen.getByRole('button', { name: 'Acciones de Radiografía panorámica' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'tpl1', { active: false, version: 1 }));
    await waitFor(() => expect(table).toHaveTextContent('Desactivada'));
  });
});
