import { render, screen, waitFor, within } from '@testing-library/react';
import { PriceListsManager } from './price-lists-manager';
import {
  createPriceList,
  deletePriceList,
  listPriceLists,
  updatePriceList,
  type PriceList,
} from '@/lib/price-lists/price-lists-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { notifyError } from '../errors/notify';

jest.mock('../../lib/price-lists/price-lists-api', () => ({
  ...jest.requireActual('../../lib/price-lists/price-lists-api'),
  listPriceLists: jest.fn(),
  createPriceList: jest.fn(),
  updatePriceList: jest.fn(),
  deletePriceList: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = listPriceLists as jest.MockedFunction<typeof listPriceLists>;
const mockedCreate = createPriceList as jest.MockedFunction<typeof createPriceList>;
const mockedUpdate = updatePriceList as jest.MockedFunction<typeof updatePriceList>;
const mockedDelete = deletePriceList as jest.MockedFunction<typeof deletePriceList>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedCurrencies = listCurrencies as jest.MockedFunction<typeof listCurrencies>;
const mockedNotify = notifyError as jest.MockedFunction<typeof notifyError>;

function location(id: string, name: string, country: 'CO' | 'ES'): ClinicLocation {
  return {
    id,
    name,
    address: null,
    country,
    isActive: true,
    timeZone: 'America/Bogota',
    createdAt: '2026-01-01T00:00:00Z',
  };
}
const norte = location('loc-1', 'Sede Norte', 'CO');
const madrid = location('loc-2', 'Sede Madrid', 'ES');

const base: PriceList = {
  id: 'pl-1',
  name: 'Tarifas Norte',
  currency: 'COP',
  locationId: 'loc-1',
  active: true,
  itemCount: 12,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const sura: PriceList = { ...base, id: 'pl-2', name: 'Sura 2026', locationId: null, itemCount: 1 };
const vieja: PriceList = { ...base, id: 'pl-3', name: 'Antigua', itemCount: 0, active: false };

describe('PriceListsManager (DX-105)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([base, sura, vieja]);
    mockedLocations.mockResolvedValue([norte, madrid]);
    mockedCurrencies.mockResolvedValue([
      { code: 'COP', name: 'Peso colombiano', symbol: '$' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
    ] as never);
  });

  it('solo ADMIN: otro rol ve el aviso y no se pide nada', () => {
    render(<PriceListsManager token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración gestiona las listas de precios.')).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('lista con moneda, sede, número de precios y estado, y enlaza a los precios', async () => {
    render(<PriceListsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Listas de precios' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Tarifas Norte');
    expect(rows[1]).toHaveTextContent('COP');
    expect(rows[1]).toHaveTextContent('Sede Norte');
    expect(rows[1]).toHaveTextContent('12');
    expect(rows[1]).toHaveTextContent('Activa');
    expect(rows[2]).toHaveTextContent('Toda la clínica');
    expect(rows[3]).toHaveTextContent('Inactiva');
    expect(screen.getByText('3 listas')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { includeInactive: true });
    expect(within(table).getByRole('link', { name: 'Precios «Tarifas Norte»' })).toHaveAttribute(
      'href',
      '/settings/listas-de-precios/pl-1',
    );
  });

  it('vacío: enseña qué hacer', async () => {
    mockedList.mockResolvedValue([]);
    render(<PriceListsManager token="tok" allowed />);
    expect(await screen.findByText('Todavía no hay listas de precios.')).toBeInTheDocument();
  });

  it('error de carga con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    render(<PriceListsManager token="tok" allowed />);
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('table', { name: 'Listas de precios' })).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('crea una lista: la moneda sigue a la sede elegida y se envía tal cual', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({ ...base, id: 'pl-9', name: 'Madrid 2026', currency: 'EUR', locationId: 'loc-2', itemCount: 0 });
    render(<PriceListsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Listas de precios' });

    await user.click(screen.getByRole('button', { name: 'Nueva lista' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), ' a ');
    await user.click(within(dialog).getByRole('button', { name: 'Crear lista' }));
    expect(
      await within(dialog).findByText('El nombre debe tener entre 2 y 120 caracteres.'),
    ).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText('Nombre'));
    await user.type(within(dialog).getByLabelText('Nombre'), 'Madrid 2026');
    await user.selectOptions(within(dialog).getByLabelText('Sede'), 'loc-2');
    await waitFor(() => expect(within(dialog).getByLabelText('Moneda')).toHaveValue('EUR'));
    await user.click(within(dialog).getByRole('button', { name: 'Crear lista' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        name: 'Madrid 2026',
        currency: 'EUR',
        locationId: 'loc-2',
      }),
    );
    const table = await screen.findByRole('table', { name: 'Listas de precios' });
    expect(await within(table).findByText('Madrid 2026')).toBeInTheDocument();
  });

  it('una lista con precios no deja cambiar de moneda y puede pasar a toda la clínica', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...base, locationId: null });
    render(<PriceListsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Listas de precios' });
    await user.click(within(table).getByRole('button', { name: 'Editar «Tarifas Norte»' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Moneda')).toBeDisabled();
    expect(within(dialog).getByText(/La lista ya tiene precios/)).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText('Sede'), '');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'pl-1', {
        name: 'Tarifas Norte',
        locationId: null,
      }),
    );
  });

  it('una lista sin precios sí deja cambiar de moneda', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...vieja, currency: 'EUR' });
    render(<PriceListsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Listas de precios' });
    await user.click(within(table).getByRole('button', { name: 'Editar «Antigua»' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByLabelText('Moneda')).toBeEnabled());
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'EUR');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'pl-3', {
        name: 'Antigua',
        currency: 'EUR',
        locationId: 'loc-1',
      }),
    );
  });

  it('el error de la API al guardar se muestra en el modal', async () => {
    const user = setupUser();
    const message = 'Ya existe una lista de precios activa en esa sede.';
    mockedUpdate.mockRejectedValue(new ApiError(409, message));
    render(<PriceListsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Listas de precios' });
    await user.click(within(table).getByRole('button', { name: 'Editar «Antigua»' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });

  it('desactiva; si falla avisa con el mensaje de la API y con reintento', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValueOnce({ ...base, active: false });
    render(<PriceListsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Listas de precios' });

    await user.click(within(table).getByRole('button', { name: 'Desactivar «Tarifas Norte»' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'pl-1', { active: false }));
    expect(await within(table).findByRole('button', { name: 'Activar «Tarifas Norte»' })).toBeInTheDocument();

    mockedUpdate.mockRejectedValueOnce(new ApiError(409, 'Ya hay una lista activa en esa sede.'));
    await user.click(within(table).getByRole('button', { name: 'Activar «Antigua»' }));
    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    expect(mockedNotify.mock.calls[0][0]).toBe('Ya hay una lista activa en esa sede.');
    expect(mockedNotify.mock.calls[0][1]).toEqual({ onRetry: expect.any(Function) });
    expect(within(table).getByRole('button', { name: 'Activar «Antigua»' })).toBeInTheDocument();
  });

  it('retira con confirmación y el foco pasa a «Nueva lista»', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([vieja]);
    mockedDelete.mockResolvedValue(undefined);
    render(<PriceListsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Listas de precios' });

    await user.click(within(table).getByRole('button', { name: 'Retirar «Antigua»' }));
    await user.click(await screen.findByRole('button', { name: 'Retirar lista' }));
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('tok', 'pl-3'));
    await waitFor(() =>
      expect(screen.queryByRole('table', { name: 'Listas de precios' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nueva lista' })).toHaveFocus());
  });

  it('el 409 por un convenio que la usa se muestra en el diálogo y la lista sigue', async () => {
    const user = setupUser();
    const message = 'Esta lista la usa un convenio; desactívala en lugar de retirarla.';
    mockedDelete.mockRejectedValue(new ApiError(409, message));
    render(<PriceListsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Listas de precios' });

    await user.click(within(table).getByRole('button', { name: 'Retirar «Sura 2026»' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Retirar lista' }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(within(table).getByText('Sura 2026')).toBeInTheDocument();
  });
});
