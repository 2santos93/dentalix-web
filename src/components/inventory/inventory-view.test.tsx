import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryView } from './inventory-view';
import {
  listInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  recordInventoryMovement,
  listInventoryMovements,
} from '@/lib/inventory/inventory-api';

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
const mockedUpdate = updateInventoryItem as jest.MockedFunction<typeof updateInventoryItem>;
const mockedDelete = deleteInventoryItem as jest.MockedFunction<typeof deleteInventoryItem>;
const mockedRecord = recordInventoryMovement as jest.MockedFunction<typeof recordInventoryMovement>;
const mockedListMovements = listInventoryMovements as jest.MockedFunction<typeof listInventoryMovements>;

const guantes = {
  id: 'i1', name: 'Guantes de nitrilo', sku: 'GUA-N', unit: 'caja', minStock: 5,
  notes: null, createdById: null, createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z', stock: 2, lowStock: true,
};
const gasa = { ...guantes, id: 'i2', name: 'Gasa estéril', sku: null, unit: 'unidad', minStock: 10, stock: 40, lowStock: false };
const algodon = {
  id: 'i3', name: 'Algodón', sku: null, unit: 'unidad', minStock: 3,
  notes: null, createdById: null, createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z',
  // stock/lowStock intentionally absent: item with no movements yet.
};

beforeEach(() => {
  mockedList.mockReset();
  mockedCreate.mockReset();
  mockedUpdate.mockReset();
  mockedDelete.mockReset();
  mockedRecord.mockReset();
  mockedListMovements.mockReset();
});

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

it('muestra un guion cuando stock/lowStock no vienen del API (sin ocultar que faltan)', async () => {
  mockedList.mockResolvedValue([algodon]);
  render(<InventoryView token="tok" />);

  const table = await screen.findByRole('table', { name: /inventario/i });
  const row = within(table).getByRole('row', { name: /algodón/i });
  // One "—" for the missing stock cell, one for the neutral status badge.
  expect(within(row).getAllByText('—')).toHaveLength(2);
  expect(within(row).queryByText(/^ok$/i)).not.toBeInTheDocument();
  expect(within(row).queryByText(/bajo stock/i)).not.toBeInTheDocument();
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

it('registra una salida y refresca el stock', async () => {
  mockedList.mockResolvedValueOnce([guantes]);
  mockedRecord.mockResolvedValue({
    id: 'm1', itemId: 'i1', type: 'OUT', quantity: 1, reason: 'Uso en consulta',
    occurredAt: '2026-07-31T12:00:00.000Z', createdById: null, createdAt: '2026-07-31T12:00:00.000Z',
  });
  mockedList.mockResolvedValueOnce([{ ...guantes, stock: 1 }]);

  const user = userEvent.setup();
  render(<InventoryView token="tok" />);
  await screen.findByRole('table', { name: /inventario/i });

  await user.click(screen.getByRole('button', { name: /movimiento de guantes de nitrilo/i }));
  await user.selectOptions(screen.getByLabelText(/tipo/i), 'OUT');
  await user.type(screen.getByLabelText(/cantidad/i), '1');
  await user.type(screen.getByLabelText(/motivo/i), 'Uso en consulta');
  await user.click(screen.getByRole('button', { name: /^registrar$/i }));

  await waitFor(() =>
    expect(mockedRecord).toHaveBeenCalledWith('tok', 'i1', {
      type: 'OUT', quantity: 1, reason: 'Uso en consulta',
    }),
  );
  await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
});

it('rechaza una entrada con cantidad 0 sin llamar al API', async () => {
  mockedList.mockResolvedValueOnce([guantes]);

  const user = userEvent.setup();
  render(<InventoryView token="tok" />);
  await screen.findByRole('table', { name: /inventario/i });

  await user.click(screen.getByRole('button', { name: /movimiento de guantes de nitrilo/i }));
  await user.type(screen.getByLabelText(/cantidad/i), '0');
  await user.click(screen.getByRole('button', { name: /^registrar$/i }));

  expect(await screen.findByText(/la cantidad debe ser mayor a 0/i)).toBeInTheDocument();
  expect(mockedRecord).not.toHaveBeenCalled();
});

it('muestra el historial de movimientos de un insumo', async () => {
  mockedList.mockResolvedValue([guantes]);
  mockedListMovements.mockResolvedValue([
    { id: 'm1', itemId: 'i1', type: 'IN', quantity: 10, reason: 'Compra',
      occurredAt: '2026-07-30T10:00:00.000Z', createdById: null, createdAt: '2026-07-30T10:00:00.000Z' },
    { id: 'm2', itemId: 'i1', type: 'OUT', quantity: 8, reason: null,
      occurredAt: '2026-07-31T10:00:00.000Z', createdById: null, createdAt: '2026-07-31T10:00:00.000Z' },
  ]);

  const user = userEvent.setup();
  render(<InventoryView token="tok" />);
  await screen.findByRole('table', { name: /inventario/i });

  await user.click(screen.getByRole('button', { name: /historial de guantes de nitrilo/i }));

  expect(await screen.findByText(/compra/i)).toBeInTheDocument();
  expect(screen.getByText('Entrada')).toBeInTheDocument();
  expect(screen.getByText('Salida')).toBeInTheDocument();
});

it('editar abre el modal prellenado y hace PATCH', async () => {
  mockedList.mockResolvedValueOnce([guantes]);
  mockedUpdate.mockResolvedValue({ ...guantes, minStock: 8 });
  mockedList.mockResolvedValueOnce([{ ...guantes, minStock: 8 }]);

  const user = userEvent.setup();
  render(<InventoryView token="tok" />);
  await screen.findByRole('table', { name: /inventario/i });

  await user.click(screen.getByRole('button', { name: /editar guantes de nitrilo/i }));
  const min = screen.getByLabelText(/stock mínimo/i);
  expect(min).toHaveValue(5);
  await user.clear(min);
  await user.type(min, '8');
  await user.click(screen.getByRole('button', { name: /^guardar$/i }));

  await waitFor(() =>
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'i1', expect.objectContaining({ minStock: 8 })),
  );
  await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
});

it('editar limpia sku y notas enviando null explícito', async () => {
  const conNotas = { ...guantes, notes: 'Guardar en frío' };
  mockedList.mockResolvedValueOnce([conNotas]);
  mockedUpdate.mockResolvedValue({ ...conNotas, sku: null, notes: null });
  mockedList.mockResolvedValueOnce([{ ...conNotas, sku: null, notes: null }]);

  const user = userEvent.setup();
  render(<InventoryView token="tok" />);
  await screen.findByRole('table', { name: /inventario/i });

  await user.click(screen.getByRole('button', { name: /editar guantes de nitrilo/i }));
  await user.clear(screen.getByLabelText(/^sku$/i));
  await user.clear(screen.getByLabelText(/^notas$/i));
  await user.click(screen.getByRole('button', { name: /^guardar$/i }));

  await waitFor(() =>
    expect(mockedUpdate).toHaveBeenCalledWith(
      'tok',
      'i1',
      expect.objectContaining({ sku: null, notes: null }),
    ),
  );
});

it('eliminar pide confirmación y luego llama al API', async () => {
  mockedList.mockResolvedValueOnce([guantes]);
  mockedDelete.mockResolvedValue(undefined);
  mockedList.mockResolvedValueOnce([]);

  const user = userEvent.setup();
  render(<InventoryView token="tok" />);
  await screen.findByRole('table', { name: /inventario/i });

  await user.click(screen.getByRole('button', { name: /eliminar guantes de nitrilo/i }));
  await user.click(screen.getByRole('button', { name: /sí, eliminar/i }));

  await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('tok', 'i1'));
  await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  expect(await screen.findByText(/todavía no hay insumos/i)).toBeInTheDocument();
});
