import { render, screen, waitFor, within } from '@testing-library/react';
import { ConsentTemplatesManager } from './consent-templates-manager';
import { unknownVariables } from './consent-template-form-modal';
import {
  createConsentTemplate,
  listConsentTemplates,
  updateConsentTemplate,
} from '@/lib/consents/consents-api';
import { notifyError } from '@/components/errors/notify';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/consents/consents-api', () => ({
  ...jest.requireActual('../../lib/consents/consents-api'),
  listConsentTemplates: jest.fn(),
  createConsentTemplate: jest.fn(),
  updateConsentTemplate: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = listConsentTemplates as jest.MockedFunction<typeof listConsentTemplates>;
const mockedCreate = createConsentTemplate as jest.MockedFunction<typeof createConsentTemplate>;
const mockedUpdate = updateConsentTemplate as jest.MockedFunction<typeof updateConsentTemplate>;

const exo = {
  id: 'tpl-1',
  tenantId: 't1',
  title: 'Exodoncia',
  body: 'Yo, {{paciente}}, autorizo.',
  active: true,
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('ConsentTemplatesManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([exo]);
  });

  it('solo ADMIN: otro rol ve el aviso y no se pide nada', () => {
    render(<ConsentTemplatesManager token="tok" allowed={false} />);
    expect(screen.getByText(/solo administración gestiona/i)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('lista todas las plantillas con estado y versión', async () => {
    render(<ConsentTemplatesManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Plantillas de consentimiento' });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent('Exodoncia');
    expect(row).toHaveTextContent('Activa');
    expect(mockedList).toHaveBeenCalledWith('tok');
    expect(screen.getByText('1 plantilla')).toBeInTheDocument();
  });

  it('estado vacío y error con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    mockedList.mockResolvedValueOnce([]);
    render(<ConsentTemplatesManager token="tok" allowed />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Caído');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/todavía no hay plantillas/i)).toBeInTheDocument();
  });

  it('crea una plantilla insertando una variable desde los botones', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({ ...exo, id: 'tpl-2', title: 'Endodoncia' });
    render(<ConsentTemplatesManager token="tok" allowed />);
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: /nueva plantilla/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva plantilla' });
    await user.type(within(dialog).getByLabelText('Título'), 'Endodoncia');
    await user.type(within(dialog).getByLabelText('Texto del consentimiento'), 'Autoriza ');
    await user.click(within(dialog).getByRole('button', { name: /\{\{paciente\}\}/ }));
    expect(within(dialog).getByLabelText('Texto del consentimiento')).toHaveValue(
      'Autoriza {{paciente}}',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Crear plantilla' }));
    expect(mockedCreate).toHaveBeenCalledWith('tok', {
      title: 'Endodoncia',
      body: 'Autoriza {{paciente}}',
    });
    await waitFor(() => expect(screen.getAllByText('Endodoncia').length).toBeGreaterThan(0));
  });

  it('avisa de variables mal escritas y no deja guardar', async () => {
    const user = setupUser();
    render(<ConsentTemplatesManager token="tok" allowed />);
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: /nueva plantilla/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Título'), 'X');
    // userEvent interpreta `{` como tecla especial: se escapa duplicándola.
    await user.type(within(dialog).getByLabelText('Texto del consentimiento'), 'Hola {{{{edad}}');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('{{edad}}');
    expect(within(dialog).getByRole('button', { name: 'Crear plantilla' })).toBeDisabled();
  });

  it('edita (avisando que lo firmado no cambia) y muestra el error de la API en el modal', async () => {
    const user = setupUser();
    mockedUpdate.mockRejectedValueOnce(new ApiError(409, 'Ya existe una plantilla de consentimiento con ese título.'));
    render(<ConsentTemplatesManager token="tok" allowed />);
    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: 'Editar «Exodoncia»' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar plantilla' });
    expect(dialog).toHaveTextContent(/ya firmados no cambian/i);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/ya existe una plantilla/i);
  });

  it('desactiva; si falla avisa con un toast con reintento', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValueOnce({ ...exo, active: false });
    mockedUpdate.mockRejectedValueOnce(new Error('red'));
    render(<ConsentTemplatesManager token="tok" allowed />);

    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: 'Desactivar «Exodoncia»' }));
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'tpl-1', { active: false });
    await waitFor(() => expect(within(table).getByText('Inactiva')).toBeInTheDocument());

    await user.click(within(table).getByRole('button', { name: 'Activar «Exodoncia»' }));
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        expect.stringContaining('Exodoncia'),
        expect.objectContaining({ onRetry: expect.any(Function) }),
      ),
    );
  });
});

describe('unknownVariables', () => {
  it('coincide con la API: mayúsculas y espacios toleradas, sin repetir', () => {
    expect(unknownVariables('{{ Paciente }} {{edad}} {{edad}}')).toEqual(['edad']);
  });
});
