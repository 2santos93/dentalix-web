import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryView } from './inventory-view';
import { listItems, createItem, updateItem, deleteItem } from '@/lib/inventory/inventory-api';
import type { InventoryItemWithStock } from '@/lib/inventory/inventory-api';
import { ApiError } from '@/lib/api/client';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, same convention as staff-view.test.tsx / logout-button.test.tsx.
jest.mock('../../lib/inventory/inventory-api', () => ({
  listItems: jest.fn(),
  createItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const mockedListItems = listItems as jest.MockedFunction<typeof listItems>;
const mockedCreateItem = createItem as jest.MockedFunction<typeof createItem>;
const mockedUpdateItem = updateItem as jest.MockedFunction<typeof updateItem>;
const mockedDeleteItem = deleteItem as jest.MockedFunction<typeof deleteItem>;

const lowStockItem: InventoryItemWithStock = {
  id: 'i1',
  name: 'Guantes de nitrilo',
  sku: 'GUA-001',
  unit: 'caja',
  minStock: 5,
  notes: null,
  createdById: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  stock: 2,
  lowStock: true,
};

const okStockItem: InventoryItemWithStock = {
  id: 'i2',
  name: 'Algodón',
  sku: null,
  unit: 'paquete',
  minStock: 3,
  notes: null,
  createdById: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  stock: 10,
  lowStock: false,
};

describe('InventoryView', () => {
  beforeEach(() => {
    mockedListItems.mockReset();
    mockedCreateItem.mockReset();
    mockedUpdateItem.mockReset();
    mockedDeleteItem.mockReset();
  });

  it('renders rows with name, unit and stock; shows a "Stock bajo" badge only on low-stock items', async () => {
    mockedListItems.mockResolvedValue([lowStockItem, okStockItem]);

    render(<InventoryView token="tok" />);

    const table = await screen.findByRole('table', { name: /inventario/i });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 items

    const row1 = rows[1];
    expect(within(row1).getByDisplayValue('Guantes de nitrilo')).toBeInTheDocument();
    expect(within(row1).getByDisplayValue('caja')).toBeInTheDocument();
    expect(within(row1).getByText('2')).toBeInTheDocument();
    expect(within(row1).getByText(/stock bajo/i)).toBeInTheDocument();

    const row2 = rows[2];
    expect(within(row2).getByDisplayValue('Algodón')).toBeInTheDocument();
    expect(within(row2).queryByText(/stock bajo/i)).not.toBeInTheDocument();
  });

  it('shows an EmptyState with a create CTA when there are no items', async () => {
    mockedListItems.mockResolvedValue([]);

    render(<InventoryView token="tok" />);

    expect(await screen.findByText(/no hay insumos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nuevo insumo/i })).toBeInTheDocument();
  });

  it('submitting the create form calls createItem with the entered values and refreshes the list', async () => {
    mockedListItems.mockResolvedValueOnce([okStockItem]);
    mockedCreateItem.mockResolvedValue({
      id: 'i3',
      name: 'Jeringas',
      sku: null,
      unit: 'unidad',
      minStock: 0,
      notes: null,
      createdById: null,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    mockedListItems.mockResolvedValueOnce([
      okStockItem,
      { ...okStockItem, id: 'i3', name: 'Jeringas', sku: null, unit: 'unidad', minStock: 0, stock: 0, lowStock: false },
    ]);

    const user = userEvent.setup();
    render(<InventoryView token="tok" />);

    await screen.findByRole('table', { name: /inventario/i });

    await user.click(screen.getByRole('button', { name: /nuevo insumo/i }));
    await user.type(screen.getByLabelText(/^nombre$/i), 'Jeringas');
    await user.type(screen.getByLabelText(/^unidad$/i), 'unidad');
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() =>
      expect(mockedCreateItem).toHaveBeenCalledWith('tok', { name: 'Jeringas', unit: 'unidad' }),
    );
    await waitFor(() => expect(mockedListItems).toHaveBeenCalledTimes(2));
    expect(await screen.findByDisplayValue('Jeringas')).toBeInTheDocument();
  });

  it('shows role="alert" and a retry button on a load error, and retry reloads', async () => {
    mockedListItems.mockRejectedValueOnce(new ApiError(500, 'Ups, algo salió mal.'));
    mockedListItems.mockResolvedValueOnce([lowStockItem]);

    const user = userEvent.setup();
    render(<InventoryView token="tok" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/ups, algo salió mal/i);
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    await screen.findByRole('table', { name: /inventario/i });
    expect(mockedListItems).toHaveBeenCalledTimes(2);
  });

  it('shows a friendly forbidden message on a 403, without the retry button', async () => {
    mockedListItems.mockRejectedValue(new ApiError(403, 'Forbidden'));

    render(<InventoryView token="tok" />);

    expect(await screen.findByText(/no tienes permiso/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('editing a row field (blur) calls updateItem and refreshes the list', async () => {
    mockedListItems.mockResolvedValueOnce([lowStockItem]);
    mockedUpdateItem.mockResolvedValue({ ...lowStockItem, name: 'Guantes de nitrilo M' });
    mockedListItems.mockResolvedValueOnce([{ ...lowStockItem, name: 'Guantes de nitrilo M' }]);

    const user = userEvent.setup();
    render(<InventoryView token="tok" />);

    await screen.findByRole('table', { name: /inventario/i });
    const nameInput = screen.getByLabelText<HTMLInputElement>(/nombre de guantes de nitrilo/i);

    await user.clear(nameInput);
    await user.type(nameInput, 'Guantes de nitrilo M');
    await user.tab();

    await waitFor(() =>
      expect(mockedUpdateItem).toHaveBeenCalledWith('tok', 'i1', { name: 'Guantes de nitrilo M' }),
    );
    await waitFor(() => expect(mockedListItems).toHaveBeenCalledTimes(2));
  });

  it('deleting a row asks for inline confirmation, then calls deleteItem', async () => {
    mockedListItems.mockResolvedValueOnce([lowStockItem]);
    mockedDeleteItem.mockResolvedValue(undefined);
    mockedListItems.mockResolvedValueOnce([]);

    const user = userEvent.setup();
    render(<InventoryView token="tok" />);

    await screen.findByRole('table', { name: /inventario/i });

    await user.click(screen.getByRole('button', { name: /eliminar/i }));
    expect(mockedDeleteItem).not.toHaveBeenCalled();
    expect(screen.getByText(/¿eliminar este insumo\?/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /sí, eliminar/i }));

    await waitFor(() => expect(mockedDeleteItem).toHaveBeenCalledWith('tok', 'i1'));
    await waitFor(() => expect(mockedListItems).toHaveBeenCalledTimes(2));
  });
});
