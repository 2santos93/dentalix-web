import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryItemDetail } from './inventory-item-detail';
// Relative path: SWC no reescribe el alias '@/' dentro de jest.mock, así que el
// mock debe resolver al mismo módulo absoluto que importa el componente.
import {
  getItem,
  recordMovement,
  type InventoryItemDetail as ItemDetail,
} from '../../lib/inventory/inventory-api';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));
jest.mock('../../lib/inventory/inventory-api', () => ({
  getItem: jest.fn(),
  recordMovement: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
}));

const mockedGetItem = getItem as jest.MockedFunction<typeof getItem>;
const mockedRecord = recordMovement as jest.MockedFunction<typeof recordMovement>;

function detail(overrides: Partial<ItemDetail> = {}): ItemDetail {
  return {
    id: 'item1',
    name: 'Jeringas',
    sku: 'JER-01',
    unit: 'unidad',
    minStock: 10,
    notes: null,
    createdById: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    stock: 7,
    lowStock: true,
    movements: [
      { id: 'm1', itemId: 'item1', type: 'IN', quantity: 5, reason: 'Compra', occurredAt: '2026-07-02T10:00:00.000Z', createdById: null, createdAt: '2026-07-02T10:00:00.000Z' },
      { id: 'm2', itemId: 'item1', type: 'OUT', quantity: 3, reason: null, occurredAt: '2026-07-03T10:00:00.000Z', createdById: null, createdAt: '2026-07-03T10:00:00.000Z' },
    ],
    ...overrides,
  };
}

describe('InventoryItemDetail', () => {
  beforeEach(() => {
    push.mockClear();
    mockedGetItem.mockReset();
    mockedRecord.mockReset();
  });

  it('loads the item and renders its ledger with signed quantities', async () => {
    mockedGetItem.mockResolvedValue(detail());
    render(<InventoryItemDetail token="tok" id="item1" />);

    expect(await screen.findByText('Jeringas')).toBeInTheDocument();
    // Stock actual + badge de stock bajo.
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/stock bajo/i)).toBeInTheDocument();
    // Ledger: IN suma, OUT resta.
    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText('-3')).toBeInTheDocument();
  });

  it('records a valid movement and refreshes', async () => {
    mockedGetItem.mockResolvedValue(detail());
    mockedRecord.mockResolvedValue({
      id: 'm3', itemId: 'item1', type: 'IN', quantity: 5, reason: null,
      occurredAt: '2026-07-04T10:00:00.000Z', createdById: null, createdAt: '2026-07-04T10:00:00.000Z',
    });
    const user = userEvent.setup();
    render(<InventoryItemDetail token="tok" id="item1" />);
    await screen.findByText('Jeringas');

    const form = screen.getByRole('form', { name: /registrar movimiento/i });
    await user.type(within(form).getByLabelText(/cantidad/i), '5');
    await user.click(within(form).getByRole('button', { name: /^registrar$/i }));

    await waitFor(() =>
      expect(mockedRecord).toHaveBeenCalledWith(
        'tok',
        'item1',
        expect.objectContaining({ type: 'IN', quantity: 5 }),
      ),
    );
    // Refresco: getItem se llama de nuevo (inicial + refresh).
    await waitFor(() => expect(mockedGetItem).toHaveBeenCalledTimes(2));
  });

  it('blocks an invalid quantity (IN with 0) with an inline error and does not call recordMovement', async () => {
    mockedGetItem.mockResolvedValue(detail());
    const user = userEvent.setup();
    render(<InventoryItemDetail token="tok" id="item1" />);
    await screen.findByText('Jeringas');

    const form = screen.getByRole('form', { name: /registrar movimiento/i });
    await user.type(within(form).getByLabelText(/cantidad/i), '0');
    await user.click(within(form).getByRole('button', { name: /^registrar$/i }));

    expect(await within(form).findByRole('alert')).toBeInTheDocument();
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it('shows an empty-ledger message when there are no movements', async () => {
    mockedGetItem.mockResolvedValue(detail({ movements: [] }));
    render(<InventoryItemDetail token="tok" id="item1" />);
    await screen.findByText('Jeringas');

    expect(screen.getByText(/sin movimientos aún/i)).toBeInTheDocument();
  });
});
