import { render, screen, waitFor, within } from '@testing-library/react';
import { PrescriptionTemplatesManager } from './prescription-templates-manager';
import {
  createPrescriptionTemplate,
  deletePrescriptionTemplate,
  listPrescriptionTemplates,
  updatePrescriptionTemplate,
} from '@/lib/prescriptions/prescriptions-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { postExodoncia } from '@/lib/test/prescriptions';

jest.mock('../../lib/prescriptions/prescriptions-api', () => ({
  ...jest.requireActual('../../lib/prescriptions/prescriptions-api'),
  listPrescriptionTemplates: jest.fn(),
  createPrescriptionTemplate: jest.fn(),
  updatePrescriptionTemplate: jest.fn(),
  deletePrescriptionTemplate: jest.fn(),
}));

const mockedList = listPrescriptionTemplates as jest.MockedFunction<typeof listPrescriptionTemplates>;
const mockedCreate = createPrescriptionTemplate as jest.MockedFunction<
  typeof createPrescriptionTemplate
>;
const mockedUpdate = updatePrescriptionTemplate as jest.MockedFunction<
  typeof updatePrescriptionTemplate
>;
const mockedDelete = deletePrescriptionTemplate as jest.MockedFunction<
  typeof deletePrescriptionTemplate
>;

describe('PrescriptionTemplatesManager', () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([postExodoncia]);
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
    mockedDelete.mockReset();
  });

  it('sin permiso (no ADMIN) solo muestra el aviso y no pide nada', () => {
    render(<PrescriptionTemplatesManager token="tok" allowed={false} />);
    expect(
      screen.getByText('Solo administración gestiona las plantillas de receta.'),
    ).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('vacío y error de carga con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Caída')).mockResolvedValueOnce([]);
    render(<PrescriptionTemplatesManager token="tok" allowed />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las plantillas.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Todavía no hay plantillas de receta.')).toBeInTheDocument();
  });

  it('crea una plantilla con su medicamento', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({ ...postExodoncia, id: 'tpl2', name: 'Analgesia' });
    render(<PrescriptionTemplatesManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Plantillas de receta' });
    await user.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva plantilla de receta' });
    const submit = within(dialog).getByRole('button', { name: 'Crear plantilla' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Analgesia');
    await user.type(within(dialog).getByLabelText(/principio activo/i), 'Paracetamol');
    await user.type(within(dialog).getByLabelText(/concentración/i), '500 mg');
    await user.click(submit);
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        name: 'Analgesia',
        notes: '',
        items: [{ activeIngredient: 'Paracetamol', concentration: '500 mg' }],
      }),
    );
    expect(await screen.findAllByText('Analgesia')).not.toHaveLength(0);
  });

  it('the template form marks every field but the active ingredient as optional, packages included', async () => {
    const user = setupUser();
    render(<PrescriptionTemplatesManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Plantillas de receta' });
    await user.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva plantilla de receta' });
    expect(within(dialog).getByLabelText('Principio activo (DCI)')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Concentración (opcional)')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Nº de envases (opcional)')).toBeInTheDocument();
    expect(within(dialog).queryByRole('textbox', { name: /Nº de registro del medicamento/ })).not.toBeInTheDocument();
    // Una plantilla no imprime nada: las letras las decide el ajuste al emitir.
    expect(within(dialog).queryByText('Se imprime también en letras.')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Cantidad total (opcional)')).toHaveAccessibleDescription('');
  });

  it('edita y retira con confirmación', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...postExodoncia, name: 'Post-exodoncia adulto' });
    mockedDelete.mockResolvedValue(undefined);
    render(<PrescriptionTemplatesManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Plantillas de receta' });
    await user.click(within(table).getByRole('button', { name: 'Acciones de «Post-exodoncia»' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar plantilla de receta' });
    expect(within(dialog).getByLabelText(/principio activo/i)).toHaveValue('Ibuprofeno');
    const name = within(dialog).getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, 'Post-exodoncia adulto');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
    expect(await within(table).findByText('Post-exodoncia adulto')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: 'Acciones de «Post-exodoncia adulto»' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Retirar' }));
    const confirm = await screen.findByRole('dialog', { name: '¿Retirar la plantilla?' });
    await user.click(within(confirm).getByRole('button', { name: 'Retirar' }));
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('tok', 'tpl1'));
    expect(await screen.findByText('Todavía no hay plantillas de receta.')).toBeInTheDocument();
  });
});
