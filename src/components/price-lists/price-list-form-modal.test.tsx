import { render, screen, waitFor, within } from '@testing-library/react';
import { PriceListFormModal } from './price-list-form-modal';
import { createPriceList, updatePriceList, type PriceList } from '@/lib/price-lists/price-lists-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { setupUser } from '@/lib/test/user';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/price-lists/price-lists-api', () => ({
  ...jest.requireActual('../../lib/price-lists/price-lists-api'),
  createPriceList: jest.fn(),
  updatePriceList: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));

const mockedCreate = createPriceList as jest.MockedFunction<typeof createPriceList>;
const mockedUpdate = updatePriceList as jest.MockedFunction<typeof updatePriceList>;
const mockedCurrencies = listCurrencies as jest.MockedFunction<typeof listCurrencies>;

const inactiveLocation: ClinicLocation = clinicLocation({
  id: 'loc-old',
  name: 'Sede cerrada',
  address: null,
  country: 'CO',
  isActive: false,
  timeZone: 'America/Bogota',
  createdAt: '2026-01-01T00:00:00Z',
});
const activeLocation: ClinicLocation = { ...inactiveLocation, id: 'loc-1', name: 'Sede Norte', isActive: true };

const saved: PriceList = {
  id: 'pl-1',
  name: 'Tarifas',
  currency: 'COP',
  locationId: null,
  active: true,
  itemCount: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function setup(priceList: PriceList | null = null) {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <PriceListFormModal
      open
      onOpenChange={onOpenChange}
      priceList={priceList}
      locations={[activeLocation, inactiveLocation]}
      token="tok"
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange, dialog: screen.getByRole('dialog') };
}

describe('PriceListFormModal (DX-105)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCurrencies.mockResolvedValue([{ code: 'COP', name: 'Peso colombiano', symbol: '$' }] as never);
    mockedCreate.mockResolvedValue(saved);
    mockedUpdate.mockResolvedValue(saved);
  });

  it('al crear ofrece solo sedes activas y arranca en toda la clínica con la moneda de la clínica', async () => {
    const user = setupUser();
    const { dialog, onSaved } = setup();
    const location = within(dialog).getByLabelText('Sede');
    expect(within(location).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Toda la clínica',
      'Sede Norte',
    ]);
    await user.type(within(dialog).getByLabelText('Nombre'), 'Tarifas');
    await user.click(within(dialog).getByRole('button', { name: 'Crear lista' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith('tok', { name: 'Tarifas', currency: 'COP' }));
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it('al editar una lista de una sede ya desactivada, esa sede sigue seleccionada', () => {
    const { dialog } = setup({ ...saved, locationId: 'loc-old' });
    expect(within(dialog).getByLabelText('Sede')).toHaveValue('loc-old');
    expect(within(dialog).getByRole('option', { name: 'Sede cerrada' })).toBeInTheDocument();
  });
});
