import { render, screen, waitFor, within } from '@testing-library/react';
import { AgreementFormModal } from './agreement-form-modal';
import { createAgreement, updateAgreement, type Agreement } from '@/lib/agreements/agreements-api';
import type { Payer } from '@/lib/payers/payers-api';
import type { PriceList } from '@/lib/price-lists/price-lists-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/agreements/agreements-api', () => ({
  ...jest.requireActual('../../lib/agreements/agreements-api'),
  createAgreement: jest.fn(),
  updateAgreement: jest.fn(),
}));

const mockedCreate = createAgreement as jest.MockedFunction<typeof createAgreement>;
const mockedUpdate = updateAgreement as jest.MockedFunction<typeof updateAgreement>;

const payer = (id: string, name: string): Payer => ({
  id,
  name,
  type: 'PUBLIC_SYSTEM',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});
const payers = [payer('payer-1', 'Sanitas'), payer('payer-2', 'Sura EPS')];
const priceList: PriceList = {
  id: 'pl-1',
  name: 'Lista Sura 2026',
  currency: 'COP',
  locationId: null,
  active: true,
  itemCount: 4,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const location: ClinicLocation = clinicLocation({
  id: 'loc-1',
  name: 'Sede Norte',
  address: null,
  country: 'CO',
  isActive: true,
  timeZone: 'America/Bogota',
  createdAt: '2026-01-01T00:00:00Z',
});
const categories = ['Endodoncia', 'Preventiva', 'Restauradora'];

const existing: Agreement = {
  id: 'ag-1',
  name: 'Convenio Sanitas',
  payer: { id: 'payer-1', name: 'Sanitas', type: 'PREPAID_PLAN' },
  kind: 'PERCENT_DISCOUNT',
  percent: 15,
  percentByCategory: { Preventiva: 20 },
  priceList: null,
  locationId: null,
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  active: true,
  assignedCount: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function setup(agreement: Agreement | null = null, overrides: { payers?: Payer[]; priceLists?: PriceList[] } = {}) {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <AgreementFormModal
      open
      onOpenChange={onOpenChange}
      agreement={agreement}
      token="tok"
      payers={overrides.payers ?? payers}
      priceLists={overrides.priceLists ?? [priceList]}
      categories={categories}
      locations={[location]}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange, dialog: screen.getByRole('dialog') };
}

describe('AgreementFormModal (DX-105)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreate.mockResolvedValue(existing);
    mockedUpdate.mockResolvedValue(existing);
  });

  it('ofrece los tipos en español y el porcentaje por defecto', () => {
    const { dialog } = setup();
    expect(
      within(within(dialog).getByLabelText('Tipo')).getAllByRole('option').map((o) => o.textContent),
    ).toEqual(['Descuento porcentual', 'Lista de precios']);
    expect(within(dialog).getByLabelText('Descuento general (%)')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Lista de precios')).not.toBeInTheDocument();
  });

  it('valida con los mensajes de la API antes de enviar', async () => {
    const user = setupUser();
    const { dialog } = setup();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Convenio Sura');
    await user.click(within(dialog).getByRole('button', { name: 'Crear convenio' }));
    expect(await within(dialog).findByText('Elige el pagador del convenio.')).toBeInTheDocument();
    expect(within(dialog).getByText('Indica el porcentaje del convenio.')).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText('Pagador'), 'payer-2');
    await user.type(within(dialog).getByLabelText('Descuento general (%)'), '150');
    await user.click(within(dialog).getByRole('button', { name: 'Crear convenio' }));
    expect(await within(dialog).findByText('El porcentaje debe estar entre 0 y 100.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('cambiar a lista de precios pide la lista', async () => {
    const user = setupUser();
    const { dialog } = setup();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Convenio Sura');
    await user.selectOptions(within(dialog).getByLabelText('Pagador'), 'payer-2');
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'PRICE_LIST');
    expect(within(dialog).queryByLabelText('Descuento general (%)')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Crear convenio' }));
    expect(await within(dialog).findByText('Indica la lista de precios del convenio.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();

    await user.selectOptions(within(dialog).getByLabelText('Lista de precios'), 'pl-1');
    await user.click(within(dialog).getByRole('button', { name: 'Crear convenio' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        name: 'Convenio Sura',
        payerId: 'payer-2',
        kind: 'PRICE_LIST',
        priceListId: 'pl-1',
      }),
    );
  });

  it('crea un descuento con porcentajes por categoría, sede y vigencia', async () => {
    const user = setupUser();
    const { dialog, onSaved, onOpenChange } = setup();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Convenio Sanitas');
    await user.selectOptions(within(dialog).getByLabelText('Pagador'), 'payer-1');
    await user.type(within(dialog).getByLabelText('Descuento general (%)'), '12,5');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir categoría' }));
    await user.selectOptions(within(dialog).getByLabelText('Categoría 1'), 'Preventiva');
    await user.type(within(dialog).getByLabelText('Porcentaje 1'), '20');
    await user.selectOptions(within(dialog).getByLabelText('Sede'), 'loc-1');
    await user.type(within(dialog).getByLabelText('Vigente desde'), '2026-01-01');
    await user.type(within(dialog).getByLabelText('Vigente hasta'), '2026-12-31');
    await user.click(within(dialog).getByRole('button', { name: 'Crear convenio' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        name: 'Convenio Sanitas',
        payerId: 'payer-1',
        kind: 'PERCENT_DISCOUNT',
        percent: 12.5,
        percentByCategory: { Preventiva: 20 },
        locationId: 'loc-1',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
      }),
    );
    expect(onSaved).toHaveBeenCalledWith(existing);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('las filas de categoría: no repiten categoría, exigen porcentaje y se quitan', async () => {
    const user = setupUser();
    const { dialog } = setup();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Convenio Sanitas');
    await user.selectOptions(within(dialog).getByLabelText('Pagador'), 'payer-1');
    await user.type(within(dialog).getByLabelText('Descuento general (%)'), '10');

    await user.click(within(dialog).getByRole('button', { name: 'Añadir categoría' }));
    await user.click(within(dialog).getByRole('button', { name: 'Añadir categoría' }));
    // La categoría ya elegida en una fila no se ofrece en la otra.
    await user.selectOptions(within(dialog).getByLabelText('Categoría 1'), 'Preventiva');
    expect(
      within(within(dialog).getByLabelText('Categoría 2')).queryByRole('option', { name: 'Preventiva' }),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Crear convenio' }));
    expect(await within(dialog).findByText('Preventiva: Indica el porcentaje del convenio.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Porcentaje 1'), '120');
    await user.click(within(dialog).getByRole('button', { name: 'Crear convenio' }));
    expect(
      await within(dialog).findByText('Preventiva: El porcentaje debe estar entre 0 y 100.'),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Quitar la categoría 2' }));
    expect(within(dialog).queryByLabelText('Categoría 2')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Quitar la categoría 1' }));
    await user.click(within(dialog).getByRole('button', { name: 'Crear convenio' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        name: 'Convenio Sanitas',
        payerId: 'payer-1',
        kind: 'PERCENT_DISCOUNT',
        percent: 10,
      }),
    );
  });

  it('una fecha de fin anterior al inicio no se envía', async () => {
    const user = setupUser();
    const { dialog } = setup();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Convenio Sanitas');
    await user.selectOptions(within(dialog).getByLabelText('Pagador'), 'payer-1');
    await user.type(within(dialog).getByLabelText('Descuento general (%)'), '10');
    await user.type(within(dialog).getByLabelText('Vigente desde'), '2026-06-01');
    await user.type(within(dialog).getByLabelText('Vigente hasta'), '2026-01-01');
    await user.click(within(dialog).getByRole('button', { name: 'Crear convenio' }));
    expect(
      await within(dialog).findByText('La fecha de fin no puede ser anterior a la de inicio.'),
    ).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('edita: precarga todo y manda el PATCH completo, con activo', async () => {
    const user = setupUser();
    const { dialog } = setup(existing);
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Convenio Sanitas');
    expect(within(dialog).getByLabelText('Pagador')).toHaveValue('payer-1');
    expect(within(dialog).getByLabelText('Descuento general (%)')).toHaveValue('15');
    expect(within(dialog).getByLabelText('Categoría 1')).toHaveValue('Preventiva');
    expect(within(dialog).getByLabelText('Porcentaje 1')).toHaveValue('20');
    expect(within(dialog).getByLabelText('Vigente desde')).toHaveValue('2026-01-01');
    const active = within(dialog).getByRole('checkbox', { name: 'Convenio activo' });
    expect(active).toBeChecked();

    await user.click(active);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'ag-1', {
        name: 'Convenio Sanitas',
        payerId: 'payer-1',
        kind: 'PERCENT_DISCOUNT',
        percent: 15,
        percentByCategory: { Preventiva: 20 },
        priceListId: null,
        locationId: null,
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        active: false,
      }),
    );
  });

  it('editar y pasar a lista de precios vacía los campos del otro tipo', async () => {
    const user = setupUser();
    const { dialog } = setup(existing);
    await user.selectOptions(within(dialog).getByLabelText('Tipo'), 'PRICE_LIST');
    await user.selectOptions(within(dialog).getByLabelText('Lista de precios'), 'pl-1');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(
        'tok',
        'ag-1',
        expect.objectContaining({
          kind: 'PRICE_LIST',
          percent: null,
          percentByCategory: null,
          priceListId: 'pl-1',
        }),
      ),
    );
  });

  it('el pagador y la lista ya elegidos siguen apareciendo aunque estén desactivados', () => {
    const withList: Agreement = {
      ...existing,
      kind: 'PRICE_LIST',
      percent: null,
      percentByCategory: null,
      priceList: { id: 'pl-9', name: 'Lista antigua', currency: 'COP' },
    };
    const { dialog } = setup(withList, { payers: [payers[1]], priceLists: [] });
    expect(within(dialog).getByLabelText('Pagador')).toHaveValue('payer-1');
    expect(within(dialog).getByRole('option', { name: 'Sanitas' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Lista de precios')).toHaveValue('pl-9');
  });

  it('el error de la API se muestra en el modal y no lo cierra', async () => {
    const user = setupUser();
    mockedCreate.mockRejectedValue(new ApiError(409, 'Ya existe un convenio con ese nombre.'));
    const { dialog, onOpenChange } = setup();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Convenio Sanitas');
    await user.selectOptions(within(dialog).getByLabelText('Pagador'), 'payer-1');
    await user.type(within(dialog).getByLabelText('Descuento general (%)'), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Crear convenio' }));
    expect(await within(dialog).findByText('Ya existe un convenio con ese nombre.')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
