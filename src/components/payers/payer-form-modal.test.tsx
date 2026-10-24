import { render, screen, waitFor, within } from '@testing-library/react';
import { PayerFormModal } from './payer-form-modal';
import { createPayer, updatePayer, type Payer } from '@/lib/payers/payers-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/payers/payers-api', () => ({
  ...jest.requireActual('../../lib/payers/payers-api'),
  createPayer: jest.fn(),
  updatePayer: jest.fn(),
}));

const mockedCreate = createPayer as jest.MockedFunction<typeof createPayer>;
const mockedUpdate = updatePayer as jest.MockedFunction<typeof updatePayer>;

const sanitas: Payer = {
  id: 'payer-1',
  name: 'Sanitas',
  type: 'EPS_CO',
  country: 'CO',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function setup(payer: Payer | null = null) {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <PayerFormModal open onOpenChange={onOpenChange} payer={payer} token="tok" onSaved={onSaved} />,
  );
  return { onSaved, onOpenChange, dialog: screen.getByRole('dialog') };
}

describe('PayerFormModal (DX-153)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ofrece los tipos y países con sus etiquetas en español', () => {
    const { dialog } = setup();
    const type = within(dialog).getByLabelText('Tipo');
    expect(
      within(type)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Elige un tipo',
      'Mutua (España)',
      'Prepagada (Colombia)',
      'EPS (Colombia)',
      'Empresa',
      'Otro / interno (cortesía, empleados)',
    ]);
    const country = within(dialog).getByLabelText('País');
    expect(
      within(country)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['—', 'Colombia', 'España']);
  });

  it('SEC-047: en el alta no hay tipo preseleccionado y hay que elegirlo', async () => {
    const user = setupUser();
    const { dialog } = setup();
    const type = within(dialog).getByLabelText('Tipo');
    expect(type).toHaveValue('');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sura EPS');
    await user.click(within(dialog).getByRole('button', { name: 'Crear pagador' }));
    expect(await within(dialog).findByText('Elige el tipo de pagador.')).toBeInTheDocument();
    expect(type).toHaveAttribute('aria-invalid', 'true');
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('SEC-047: OTRO explica que sus convenios solo los asigna un administrador', async () => {
    const user = setupUser();
    const { dialog } = setup();
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'OTRO');
    expect(
      within(dialog).getByText(
        'Para convenios internos (cortesía, empleados): solo un administrador podrá asignarlos. Una aseguradora o empresa va en su tipo.',
      ),
    ).toBeInTheDocument();
  });

  it('valida el nombre antes de enviar', async () => {
    const user = setupUser();
    const { dialog } = setup();
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'EMPRESA');
    await user.type(within(dialog).getByLabelText('Nombre'), ' a ');
    await user.click(within(dialog).getByRole('button', { name: 'Crear pagador' }));
    expect(
      await within(dialog).findByText('El nombre debe tener entre 2 y 120 caracteres.'),
    ).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('valida tipo↔país antes de enviar', async () => {
    const user = setupUser();
    const { dialog } = setup();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Adeslas');
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'MUTUA_ES');
    await user.selectOptions(within(dialog).getByLabelText('País'), 'CO');
    await user.click(within(dialog).getByRole('button', { name: 'Crear pagador' }));
    expect(
      await within(dialog).findByText('El tipo de pagador no corresponde con el país.'),
    ).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('una mutua sin país tampoco es válida', async () => {
    const user = setupUser();
    const { dialog } = setup();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Adeslas');
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'MUTUA_ES');
    await user.click(within(dialog).getByRole('button', { name: 'Crear pagador' }));
    expect(
      await within(dialog).findByText('El tipo de pagador no corresponde con el país.'),
    ).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('crea con nombre normalizado y sin país cuando es una empresa', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({
      ...sanitas,
      name: 'Mi  Empresa',
      type: 'EMPRESA',
      country: null,
    });
    const { dialog, onSaved, onOpenChange } = setup();
    await user.type(within(dialog).getByLabelText('Nombre'), '  Mi   Empresa ');
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'EMPRESA');
    await user.click(within(dialog).getByRole('button', { name: 'Crear pagador' }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', { name: 'Mi Empresa', type: 'EMPRESA' }),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('edita con los valores sembrados y manda country null si se quita', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...sanitas, type: 'EMPRESA', country: null });
    const { dialog, onSaved } = setup(sanitas);
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Sanitas');
    expect(within(dialog).getByLabelText('Tipo')).toHaveValue('EPS_CO');
    expect(within(dialog).getByLabelText('País')).toHaveValue('CO');

    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'EMPRESA');
    await user.selectOptions(within(dialog).getByLabelText('País'), '');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'payer-1', {
        name: 'Sanitas',
        type: 'EMPRESA',
        country: null,
      }),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('muestra el mensaje de la API y deja el modal abierto', async () => {
    const user = setupUser();
    mockedCreate.mockRejectedValue(new ApiError(409, 'Ya existe un pagador con ese nombre.'));
    const { dialog, onSaved, onOpenChange } = setup();
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'EMPRESA');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sanitas');
    await user.click(within(dialog).getByRole('button', { name: 'Crear pagador' }));
    expect(
      await within(dialog).findByText('Ya existe un pagador con ese nombre.'),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
