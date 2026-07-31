import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryView } from './inventory-view';
import { listInventoryItems, createInventoryItem } from '@/lib/inventory/inventory-api';

jest.mock('../../lib/inventory/inventory-api', () => ({
  listInventoryItems: jest.fn(),
  createInventoryItem: jest.fn(),
  updateInventoryItem: jest.fn(),
  deleteInventoryItem: jest.fn(),
  recordInventoryMovement: jest.fn(),
  listInventoryMovements: jest.fn(),
}));

const mockedList = listInventoryItems as jest.MockedFunction<typeof listInventoryItems>;
const mockedCreate = createInventoryItem as jest.MockedFunction<typeof createInventoryItem>;

const guantes = {
  id: 'i1', name: 'Guantes de nitrilo', sku: 'GUA-N', unit: 'caja', minStock: 5,
  notes: null, createdById: null, createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z', stock: 2, lowStock: true,
};
const gasa = { ...guantes, id: 'i2', name: 'Gasa estéril', sku: null, unit: 'unidad', minStock: 10, stock: 40, lowStock: false };

beforeEach(() => { mockedList.mockReset(); mockedCreate.mockReset(); });

it('muestra los insumos con su stock y marca los que están bajo el mínimo', async () => {
  mockedList.mockResolvedValue([guantes, gasa]);
  render(<InventoryView token="tok" />);

  const table = await screen.findByRole('table', { name: /inventario/i });
  const lowRow = within(table).getByRole('row', { name: /guantes de nitrilo/i });
  expect(within(lowRow).getByText('2')).toBeInTheDocument();
  expect(within(lowRow).getByText(/bajo stock/i)).toBeInTheDocument();

  const okRow = within(table).getByRole('row', { name: /gasa estéril/i });
  expect(within(okRow).getByText('40')).toBeInTheDocument();
  expect(within(okRow).queryByText(/bajo stock/i)).not.toBeInTheDocument();
});

it('crea un insumo con el payload correcto y refresca la lista', async () => {
  mockedList.mockResolvedValueOnce([]);
  mockedCreate.mockResolvedValue(guantes);
  mockedList.mockResolvedValueOnce([guantes]);

  const user = userEvent.setup();
  render(<InventoryView token="tok" />);
  await screen.findByText(/todavía no hay insumos/i);

  await user.click(screen.getByRole('button', { name: /agregar insumo/i }));
  await user.type(screen.getByLabelText(/^nombre$/i), 'Guantes de nitrilo');
  await user.type(screen.getByLabelText(/unidad/i), 'caja');
  await user.type(screen.getByLabelText(/stock mínimo/i), '5');
  await user.click(screen.getByRole('button', { name: /^crear$/i }));

  await waitFor(() =>
    expect(mockedCreate).toHaveBeenCalledWith('tok', {
      name: 'Guantes de nitrilo', unit: 'caja', minStock: 5,
    }),
  );
  await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Guantes de nitrilo')).toBeInTheDocument();
});
