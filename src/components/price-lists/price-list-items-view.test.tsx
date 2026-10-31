import { render, screen, waitFor, within } from '@testing-library/react';
import { PriceListItemsView } from './price-list-items-view';
import {
  listPriceListItems,
  listPriceLists,
  replacePriceListItems,
  type PriceList,
  type PriceListItemRow,
} from '@/lib/price-lists/price-lists-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/price-lists/price-lists-api', () => ({
  ...jest.requireActual('../../lib/price-lists/price-lists-api'),
  listPriceLists: jest.fn(),
  listPriceListItems: jest.fn(),
  replacePriceListItems: jest.fn(),
}));

const mockedLists = listPriceLists as jest.MockedFunction<typeof listPriceLists>;
const mockedItems = listPriceListItems as jest.MockedFunction<typeof listPriceListItems>;
const mockedReplace = replacePriceListItems as jest.MockedFunction<typeof replacePriceListItems>;

const list: PriceList = {
  id: 'pl-1',
  name: 'Sura 2026',
  currency: 'COP',
  locationId: null,
  active: true,
  itemCount: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const profilaxis: PriceListItemRow = {
  catalogItemId: 'c-1',
  code: 'PROF',
  labelEs: 'Profilaxis',
  category: 'Preventiva',
  defaultPrice: 80000,
  price: 60000,
};
const resina: PriceListItemRow = {
  catalogItemId: 'c-2',
  code: 'RES',
  labelEs: 'Resina',
  category: null,
  defaultPrice: null,
  price: null,
};

function page(items: PriceListItemRow[], total = items.length, pageNum = 1) {
  return { items, total, page: pageNum, pageSize: 20 };
}

function render_() {
  return render(<PriceListItemsView token="tok" priceListId="pl-1" />);
}

/** Abre el «⋯» de la fila y devuelve los nombres de sus acciones. */
async function menuOf(user: ReturnType<typeof setupUser>, row: string): Promise<string[]> {
  await user.click(screen.getByRole('button', { name: `Acciones de ${row}` }));
  const items = await screen.findAllByRole('menuitem');
  return items.map((i) => i.textContent ?? '');
}

describe('PriceListItemsView (DX-105)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLists.mockResolvedValue([list]);
    mockedItems.mockResolvedValue(page([profilaxis, resina]));
    mockedReplace.mockResolvedValue({ upserted: 1, removed: 0 });
  });

  it('muestra el nombre, la moneda y cada fila con su precio de lista y de catálogo', async () => {
    const user = setupUser();
    render_();
    expect(await screen.findByRole('heading', { name: 'Sura 2026' })).toBeInTheDocument();
    expect(screen.getByText(/Precios en COP/)).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Precios de la lista' });
    expect(
      within(table).getAllByRole('columnheader').map((h) => h.textContent),
    ).toEqual([
      'Código',
      'Procedimiento',
      'Categoría',
      'Precio de catálogo',
      'Precio de lista',
      'Acciones',
    ]);
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('PROF');
    expect(rows[1]).toHaveTextContent('Preventiva');
    expect(rows[1]).toHaveTextContent(/80\.000/);
    expect(rows[1]).toHaveTextContent(/60\.000/);
    expect(rows[2]).toHaveTextContent('Sin precio');
    expect(mockedItems).toHaveBeenCalledWith('tok', 'pl-1', { page: 1, pageSize: 20 });
    expect(screen.getByRole('link', { name: 'Listas de precios' })).toHaveAttribute(
      'href',
      '/settings/listas-de-precios',
    );
    // Sin precio de lista no hay nada que quitar: el «⋯» solo ofrece editarlo.
    expect(await menuOf(user, 'Resina')).toEqual(['Editar precio']);
  });

  it('una lista que no existe lo dice y ofrece volver', async () => {
    mockedLists.mockResolvedValue([]);
    render_();
    expect(await screen.findByText('Esa lista de precios no existe.')).toBeInTheDocument();
    expect(mockedItems).not.toHaveBeenCalled();
  });

  it('error al cargar la lista, con reintento', async () => {
    const user = setupUser();
    mockedLists.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    render_();
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: 'Precios de la lista' })).toBeInTheDocument();
  });

  it('error al cargar los precios, con reintento', async () => {
    const user = setupUser();
    mockedItems.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    render_();
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: 'Precios de la lista' })).toBeInTheDocument();
    expect(mockedItems).toHaveBeenCalledTimes(2);
  });

  it('catálogo vacío: lo dice', async () => {
    mockedItems.mockResolvedValue(page([]));
    render_();
    expect(await screen.findByText('El catálogo todavía no tiene procedimientos.')).toBeInTheDocument();
  });

  it('«Editar precio» manda el PUT con UNA fila y actualiza la celda', async () => {
    const user = setupUser();
    render_();
    const table = await screen.findByRole('table', { name: 'Precios de la lista' });
    await user.click(within(table).getByRole('button', { name: 'Resina' }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText('Precio de lista');
    expect(field).toHaveValue('');
    await user.type(field, '45000,50');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedReplace).toHaveBeenCalledWith('tok', 'pl-1', [{ catalogItemId: 'c-2', price: 45000.5 }]),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const rows = within(table).getAllByRole('row');
    expect(rows[2]).toHaveTextContent(/45\.000,50/);
    expect(await menuOf(user, 'Resina')).toEqual(['Editar precio', 'Quitar precio']);
  });

  it('el modal se rellena con el precio actual', async () => {
    const user = setupUser();
    render_();
    const table = await screen.findByRole('table', { name: 'Precios de la lista' });
    await user.click(within(table).getByRole('button', { name: 'Profilaxis' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Precio de lista')).toHaveValue('60000');
  });

  it('un importe ilegible o vacío no se envía y dice por qué', async () => {
    const user = setupUser();
    render_();
    const table = await screen.findByRole('table', { name: 'Precios de la lista' });
    await user.click(within(table).getByRole('button', { name: 'Resina' }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('Indica el precio de lista.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Precio de lista'), 'abc');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('el error de la API al guardar el precio se muestra en el modal y no cambia la fila', async () => {
    const user = setupUser();
    mockedReplace.mockRejectedValueOnce(new ApiError(400, 'El precio no puede ser negativo.'));
    render_();
    const table = await screen.findByRole('table', { name: 'Precios de la lista' });
    await user.click(within(table).getByRole('button', { name: 'Resina' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Precio de lista'), '100');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('El precio no puede ser negativo.')).toBeInTheDocument();
    // Con el modal abierto la tabla queda oculta para los lectores de pantalla.
    expect(
      within(within(table).getAllByRole('row', { hidden: true })[2]).getByText('Sin precio'),
    ).toBeInTheDocument();
  });

  it('«Quitar precio» pide confirmación y manda price null', async () => {
    const user = setupUser();
    render_();
    const table = await screen.findByRole('table', { name: 'Precios de la lista' });
    await user.click(screen.getByRole('button', { name: 'Acciones de Profilaxis' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Quitar precio' }));
    expect(mockedReplace).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Quitar precio' }));
    await waitFor(() =>
      expect(mockedReplace).toHaveBeenCalledWith('tok', 'pl-1', [{ catalogItemId: 'c-1', price: null }]),
    );
    await waitFor(() =>
      expect(within(within(table).getAllByRole('row')[1]).getByText('Sin precio')).toBeInTheDocument(),
    );
  });

  it('si quitar el precio falla, el diálogo lo dice y el precio sigue', async () => {
    const user = setupUser();
    mockedReplace.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    render_();
    const table = await screen.findByRole('table', { name: 'Precios de la lista' });
    await user.click(screen.getByRole('button', { name: 'Acciones de Profilaxis' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Quitar precio' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Quitar precio' }));
    expect(await within(dialog).findByText('No pudimos quitar el precio.')).toBeInTheDocument();
    expect(within(table).getAllByRole('row', { hidden: true })[1]).toHaveTextContent(/60\.000/);
  });

  it('busca con debounce desde la página 1 y pagina', async () => {
    const user = setupUser();
    mockedItems.mockResolvedValue(page([profilaxis], 45));
    render_();
    await screen.findByRole('table', { name: 'Precios de la lista' });

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(mockedItems).toHaveBeenLastCalledWith('tok', 'pl-1', { page: 2, pageSize: 20 }),
    );

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por código, nombre o categoría' }), 'resina');
    await waitFor(() =>
      expect(mockedItems).toHaveBeenLastCalledWith('tok', 'pl-1', {
        query: 'resina',
        page: 1,
        pageSize: 20,
      }),
    );
  });

  it('una búsqueda sin resultados ofrece limpiarla', async () => {
    const user = setupUser();
    render_();
    await screen.findByRole('table', { name: 'Precios de la lista' });
    mockedItems.mockResolvedValue(page([], 0));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar por código, nombre o categoría' }), 'zzz');
    expect(await screen.findByText('Ningún procedimiento coincide con la búsqueda.')).toBeInTheDocument();
    mockedItems.mockResolvedValue(page([profilaxis, resina]));
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(await screen.findByRole('table', { name: 'Precios de la lista' })).toBeInTheDocument();
  });
});
