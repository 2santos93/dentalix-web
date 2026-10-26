import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanItemsBalance } from './plan-items-balance';
import { getPlanBalance, type PlanBalance } from '@/lib/payments/payments-api';
import { ApiError } from '@/lib/api/client';
import { formatCurrency } from '@/lib/format/currency';

jest.mock('../../lib/payments/payments-api', () => ({
  getPlanBalance: jest.fn(),
}));

const mockedBalance = getPlanBalance as jest.MockedFunction<typeof getPlanBalance>;

function money(amount: number, currency: string): string {
  return formatCurrency(amount, currency).replace(/ /g, ' ');
}

function balanceFixture(overrides: Partial<PlanBalance> = {}): PlanBalance {
  return {
    planCurrency: 'EUR',
    billable: 150,
    paid: 120,
    balance: 30,
    paymentsCount: 1,
    allocated: 120,
    unallocated: 0,
    unconvertedPaymentsCount: 0,
    manualPaymentIds: [],
    items: [
      {
        itemId: 'item-1',
        toothNumber: '11',
        procedureName: 'Resina',
        status: 'DONE',
        billable: 100,
        paid: 100,
        balance: 0,
      },
      {
        itemId: 'item-2',
        toothNumber: '26',
        procedureName: 'Corona',
        status: 'ACCEPTED',
        billable: 50,
        paid: 20,
        balance: 30,
      },
      {
        itemId: 'item-3',
        toothNumber: '',
        procedureName: 'Limpieza',
        status: 'PROPOSED',
        billable: 0,
        paid: 0,
        balance: 0,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mockedBalance.mockReset();
});

it('loads on open and shows procedure, tooth, status, A pagar, Cobrado, Pendiente', async () => {
  mockedBalance.mockResolvedValue(balanceFixture());
  render(<PlanItemsBalance token="tok" planId="plan-1" currency="EUR" />);

  expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
  const table = await screen.findByRole('table', { name: /por ítem/i });
  expect(mockedBalance).toHaveBeenCalledWith('tok', 'plan-1');

  const headers = within(table)
    .getAllByRole('columnheader')
    .map((h) => h.textContent);
  expect(headers).toEqual(['Procedimiento', 'Diente', 'Estado', 'A pagar', 'Cobrado', 'Pendiente']);

  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(3);
  const first = within(rows[0])
    .getAllByRole('cell')
    .map((c) => (c.textContent ?? '').replace(/\u00A0/g, ' '));
  expect(first).toEqual(['Resina', '11', 'Realizado', money(100, 'EUR'), money(100, 'EUR'), money(0, 'EUR')]);
  expect(within(rows[1]).getAllByRole('cell')[5]).toHaveTextContent(money(30, 'EUR'));
  // Un cargo sin diente (DX-291) no deja la celda vacía.
  expect(within(rows[2]).getAllByRole('cell')[1]).toHaveTextContent('Sin diente');
  expect(within(rows[2]).getAllByRole('cell')[2]).toHaveTextContent('Propuesto');

  // Todo imputado: no hay «Sin imputar».
  expect(screen.queryByText('Sin imputar')).not.toBeInTheDocument();
});

it('cancelled plan shows zeros and unallocated', async () => {
  mockedBalance.mockResolvedValue(
    balanceFixture({
      billable: 0,
      paid: 50,
      balance: -50,
      allocated: 0,
      unallocated: 50,
      items: balanceFixture().items.map((item) => ({ ...item, billable: 0, paid: 0, balance: 0 })),
    }),
  );
  render(<PlanItemsBalance token="tok" planId="plan-2" currency="EUR" />);

  const table = await screen.findByRole('table', { name: /por ítem/i });
  for (const row of within(table).getAllByRole('row').slice(1)) {
    const cells = within(row).getAllByRole('cell');
    for (const cell of cells.slice(3)) expect(cell).toHaveTextContent(money(0, 'EUR'));
  }
  const unallocated = screen.getByText('Sin imputar').closest('div') as HTMLElement;
  expect(unallocated).toHaveTextContent(money(50, 'EUR'));
  expect(unallocated).toHaveTextContent('Abonos que todavía no cubren ningún ítem.');
});

it('error shows No pudimos cargar el detalle por ítem. with retry', async () => {
  mockedBalance.mockRejectedValueOnce(new ApiError(500, 'boom'));
  mockedBalance.mockResolvedValueOnce(balanceFixture());
  const user = userEvent.setup();
  render(<PlanItemsBalance token="tok" planId="plan-1" currency="EUR" />);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('No pudimos cargar el detalle por ítem.');
  await user.click(within(alert).getByRole('button', { name: /reintentar/i }));

  expect(await screen.findByRole('table', { name: /por ítem/i })).toBeInTheDocument();
  expect(mockedBalance).toHaveBeenCalledTimes(2);
});

it('a plan without items says so instead of an empty table', async () => {
  mockedBalance.mockResolvedValue(balanceFixture({ items: [], billable: 0, paid: 0, balance: 0, allocated: 0 }));
  render(<PlanItemsBalance token="tok" planId="plan-1" currency="EUR" />);

  expect(await screen.findByText('Este plan todavía no tiene ítems.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
