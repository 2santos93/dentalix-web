import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanItemsBalance } from './plan-items-balance';
import { getPlanBalance, type PlanBalance } from '@/lib/payments/payments-api';
import { ApiError } from '@/lib/api/client';
import { formatCurrency } from '@/lib/format/currency';
import { tokenForRole } from '@/lib/test/data-consents';
import { withoutRateCopy } from '@/components/payments/without-rate-notice';

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
    paymentsWithoutRate: [],
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
  render(<PlanItemsBalance token="tok" planId="plan-1" />);

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
  // Mismas reglas que el plan: pendiente 0 es «Cubierto», no «0,00».
  expect(first).toEqual(['Resina', '11', 'Realizado', money(100, 'EUR'), money(100, 'EUR'), 'Cubierto']);
  expect(within(rows[1]).getAllByRole('cell')[5]).toHaveTextContent(money(30, 'EUR'));
  // Un cargo sin diente (DX-291) no deja la celda vacía.
  expect(within(rows[2]).getAllByRole('cell')[1]).toHaveTextContent('Sin diente');
  expect(within(rows[2]).getAllByRole('cell')[2]).toHaveTextContent('Propuesto');
  // Un propuesto no tiene importe a cobrar: «—» con nombre, no una fila de ceros.
  expect(within(rows[2]).getAllByLabelText('Sin importe a cobrar')).toHaveLength(3);

  // Todo imputado: no hay «Sin imputar»; todos con tasa: no hay aviso.
  expect(screen.queryByText('Sin imputar')).not.toBeInTheDocument();
  expect(screen.queryByText(/todavía sin convertir/)).not.toBeInTheDocument();
});

it('formats with the currency of the balance itself', async () => {
  mockedBalance.mockResolvedValue({ ...balanceFixture(), planCurrency: 'MXN', unallocated: 7.5 });
  render(<PlanItemsBalance token="tok" planId="plan-1" />);

  const table = await screen.findByRole('table', { name: /por ítem/i });
  const firstRow = within(table).getAllByRole('row')[1];
  expect(within(firstRow).getAllByRole('cell')[3]).toHaveTextContent(money(100, 'MXN'));
  expect(screen.getByText('Sin imputar').closest('div')).toHaveTextContent(money(7.5, 'MXN'));
});

it('unconverted notice explains abonos without a rate, in singular or plural', async () => {
  mockedBalance.mockResolvedValue(balanceFixture({ unconvertedPaymentsCount: 2 }));
  const { unmount } = render(<PlanItemsBalance token="tok" planId="plan-1" />);
  expect(
    await screen.findByText('2 abonos todavía sin convertir a la moneda del plan: no se imputan a ítems.'),
  ).toBeInTheDocument();
  unmount();

  mockedBalance.mockResolvedValue(balanceFixture({ unconvertedPaymentsCount: 1 }));
  render(<PlanItemsBalance token="tok" planId="plan-1" />);
  expect(
    await screen.findByText('1 abono todavía sin convertir a la moneda del plan: no se imputa a ítems.'),
  ).toBeInTheDocument();
});

// DX-375: los abonos «sin tasa» no cuentan en el saldo; el aviso lo dice,
// con la lista y el camino a Ajustes › Tasa de cambio según el rol, y sustituye
// a la nota de «sin convertir» (son los mismos abonos).
it('abonos sin tasa: aviso con la lista y, para recepción, a quién pedir la tasa', async () => {
  mockedBalance.mockResolvedValue(
    balanceFixture({
      unconvertedPaymentsCount: 1,
      paymentsWithoutRate: [{ paymentId: 'p9', amount: 50, currency: 'USD', paidOn: '2026-10-30' }],
    }),
  );
  render(<PlanItemsBalance token={tokenForRole('RECEPTION')} planId="plan-1" />);
  const notice = (await screen.findByText(withoutRateCopy.title(1))).closest('[role="status"]');
  expect(notice).toHaveTextContent('30/10/2026');
  expect(notice).toHaveTextContent(withoutRateCopy.otherRoles);
  expect(screen.queryByText(/todavía sin convertir/)).not.toBeInTheDocument();
});

it('abonos sin tasa: al ADMIN le enlaza a Ajustes › Tasa de cambio', async () => {
  mockedBalance.mockResolvedValue(
    balanceFixture({
      paymentsWithoutRate: [{ paymentId: 'p9', amount: 50, currency: 'USD', paidOn: '2026-10-30' }],
    }),
  );
  render(<PlanItemsBalance token={tokenForRole('ADMIN')} planId="plan-1" />);
  expect(await screen.findByRole('link', { name: withoutRateCopy.adminLink })).toHaveAttribute(
    'href',
    '/settings/tasa-de-cambio',
  );
});

it('cancelled plan shows no amounts to charge and the unallocated figure', async () => {
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
  render(<PlanItemsBalance token="tok" planId="plan-2" />);

  const table = await screen.findByRole('table', { name: /por ítem/i });
  for (const row of within(table).getAllByRole('row').slice(1)) {
    const cells = within(row).getAllByRole('cell');
    for (const cell of cells.slice(3)) expect(within(cell).getByLabelText('Sin importe a cobrar')).toBeInTheDocument();
  }
  const unallocated = screen.getByText('Sin imputar').closest('div') as HTMLElement;
  expect(unallocated).toHaveTextContent(money(50, 'EUR'));
  expect(unallocated).toHaveTextContent('Abonos que todavía no cubren ningún ítem.');
});

it('error shows No pudimos cargar el detalle por ítem. with retry', async () => {
  mockedBalance.mockRejectedValueOnce(new ApiError(500, 'boom'));
  mockedBalance.mockResolvedValueOnce(balanceFixture());
  const user = userEvent.setup();
  render(<PlanItemsBalance token="tok" planId="plan-1" />);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('No pudimos cargar el detalle por ítem.');
  await user.click(within(alert).getByRole('button', { name: /reintentar/i }));

  expect(await screen.findByRole('table', { name: /por ítem/i })).toBeInTheDocument();
  expect(mockedBalance).toHaveBeenCalledTimes(2);
});

it('a plan without items says so instead of an empty table', async () => {
  mockedBalance.mockResolvedValue(balanceFixture({ items: [], billable: 0, paid: 0, balance: 0, allocated: 0 }));
  render(<PlanItemsBalance token="tok" planId="plan-1" />);

  expect(await screen.findByText('Este plan todavía no tiene ítems.')).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
