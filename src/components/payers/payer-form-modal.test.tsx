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

const sanavida: Payer = {
  id: 'payer-1',
  name: 'Sanavida',
  type: 'PUBLIC_SYSTEM',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const OTHER_HINT =
  'Para convenios internos (cortesía, empleados): solo un administrador podrá asignarlos. Una aseguradora o empresa va en su tipo.';

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

  it('offers the five generic types in order, with no default and no country field', () => {
    const { dialog } = setup();
    const type = within(dialog).getByLabelText('Tipo');
    expect(type).toHaveValue('');
    expect(
      within(type)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Elige un tipo',
      'Aseguradora',
      'Plan prepago',
      'Sistema público de salud',
      'Empresa',
      'Otro / interno (cortesía, empleados)',
    ]);
    expect(
      within(type)
        .getAllByRole('option')
        .map((o) => o.getAttribute('value')),
    ).toEqual(['', 'INSURER', 'PREPAID_PLAN', 'PUBLIC_SYSTEM', 'EMPLOYER', 'OTHER']);
    expect(within(dialog).queryByLabelText('País')).toBeNull();
  });

  it('the description says which types ask for a member number', () => {
    const { dialog } = setup();
    expect(
      within(dialog).getByText(
        'El tipo decide si la cobertura pide el nº de afiliado: todos lo piden salvo «Otro / interno».',
      ),
    ).toBeInTheDocument();
  });

  it('SEC-047: type is required — no default, and it must be chosen', async () => {
    const user = setupUser();
    const { dialog } = setup();
    const type = within(dialog).getByLabelText('Tipo');
    expect(type).toHaveValue('');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Surco Salud');
    await user.click(within(dialog).getByRole('button', { name: 'Crear pagador' }));
    expect(await within(dialog).findByText('Elige el tipo de pagador.')).toBeInTheDocument();
    expect(type).toHaveAttribute('aria-invalid', 'true');
    // QA D3: el foco va al campo que hay que corregir.
    expect(type).toHaveFocus();
    expect(type).toHaveAccessibleDescription('Elige el tipo de pagador.');
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('SEC-047: OTHER shows the internal hint, and the type field announces it', async () => {
    const user = setupUser();
    const { dialog } = setup();
    const type = within(dialog).getByLabelText('Tipo');
    expect(type).not.toHaveAttribute('aria-describedby');
    await user.selectOptions(type, 'OTHER');
    expect(within(dialog).getByText(OTHER_HINT)).toHaveAttribute('id', 'payer-type-hint');
    expect(type).toHaveAttribute('aria-describedby', 'payer-type-hint');
    expect(type).toHaveAccessibleDescription(OTHER_HINT);
    await user.selectOptions(type, 'INSURER');
    expect(within(dialog).queryByText(/Para convenios internos/)).toBeNull();
    expect(type).not.toHaveAttribute('aria-describedby');
  });

  it('valida el nombre antes de enviar', async () => {
    const user = setupUser();
    const { dialog } = setup();
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'EMPLOYER');
    await user.type(within(dialog).getByLabelText('Nombre'), ' a ');
    await user.click(within(dialog).getByRole('button', { name: 'Crear pagador' }));
    expect(
      await within(dialog).findByText('El nombre debe tener entre 2 y 120 caracteres.'),
    ).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('creates with the normalized name and the type, never a country', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({ ...sanavida, name: 'Aseguradora Norte', type: 'INSURER' });
    const { dialog, onSaved, onOpenChange } = setup();
    await user.type(within(dialog).getByLabelText('Nombre'), '  Aseguradora   Norte ');
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'INSURER');
    await user.click(within(dialog).getByRole('button', { name: 'Crear pagador' }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', { name: 'Aseguradora Norte', type: 'INSURER' }),
    );
    expect(mockedCreate.mock.calls[0][1]).not.toHaveProperty('country');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('edits with the seeded type and sends name and type only', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...sanavida, type: 'EMPLOYER' });
    const { dialog, onSaved } = setup(sanavida);
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Sanavida');
    expect(within(dialog).getByLabelText('Tipo')).toHaveValue('PUBLIC_SYSTEM');

    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'EMPLOYER');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'payer-1', {
        name: 'Sanavida',
        type: 'EMPLOYER',
      }),
    );
    expect(mockedUpdate.mock.calls[0][2]).not.toHaveProperty('country');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('an unknown type seeds no type, so it has to be chosen', () => {
    const { dialog } = setup({ ...sanavida, type: 'XX' as Payer['type'] });
    expect(within(dialog).getByLabelText('Tipo')).toHaveValue('');
  });

  it('muestra el mensaje de la API y deja el modal abierto', async () => {
    const user = setupUser();
    mockedCreate.mockRejectedValue(new ApiError(409, 'Ya existe un pagador con ese nombre.'));
    const { dialog, onSaved, onOpenChange } = setup();
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'EMPLOYER');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sanavida');
    await user.click(within(dialog).getByRole('button', { name: 'Crear pagador' }));
    expect(
      await within(dialog).findByText('Ya existe un pagador con ese nombre.'),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
