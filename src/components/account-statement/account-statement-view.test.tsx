import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountStatementView } from './account-statement-view';
import { AccountStatementPrintView } from './account-statement-print-view';
import { ApiError } from '@/lib/api/client';
import { getAccountStatement } from '@/lib/account-statement/account-statement-api';
import { getPlanBalance, recordPayment, voidPayment } from '@/lib/payments/payments-api';
import { listBillablePlans, type BillablePlan } from '@/lib/payments/billable-plans-api';
import { createPaymentPlan } from '@/lib/payment-plans/payment-plan-api';
import { getPaymentReceipt } from '@/lib/payments/payment-receipts-api';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';
import {
  accountStatementFixture,
  emptyAccountStatementFixture,
  openingBalanceStatementFixture,
} from '@/lib/test/account-statement';
import { tokenForRole } from '@/lib/test/data-consents';

jest.mock('../../lib/payments/payments-api', () => ({
  voidPayment: jest.fn(),
  recordPayment: jest.fn(),
  getPlanBalance: jest.fn(),
}));
jest.mock('../../lib/payments/billable-plans-api', () => ({
  ...jest.requireActual('../../lib/payments/billable-plans-api'),
  listBillablePlans: jest.fn(),
}));
jest.mock('../../lib/payment-plans/payment-plan-api', () => ({
  createPaymentPlan: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([
    jest.requireActual('../../lib/test/locations').clinicLocation(),
  ]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../lib/payments/payment-receipts-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-receipts-api'),
  getPaymentReceipt: jest.fn(),
}));
jest.mock('../../lib/account-statement/account-statement-api', () => ({
  ...jest.requireActual('../../lib/account-statement/account-statement-api'),
  getAccountStatement: jest.fn(),
}));

const mockedGet = getAccountStatement as jest.MockedFunction<typeof getAccountStatement>;
const mockedVoid = voidPayment as jest.MockedFunction<typeof voidPayment>;
const mockedRecord = recordPayment as jest.MockedFunction<typeof recordPayment>;
const mockedBillable = listBillablePlans as jest.MockedFunction<typeof listBillablePlans>;
const mockedCreatePlan = createPaymentPlan as jest.MockedFunction<typeof createPaymentPlan>;
const mockedPlanBalance = getPlanBalance as jest.MockedFunction<typeof getPlanBalance>;

// Normaliza los espacios duros de Intl (es: "1.800.000,00 COP" lleva U+00A0).
function money(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedVoid.mockReset();
  mockedRecord.mockReset();
  mockedBillable.mockReset();
  mockedCreatePlan.mockReset();
  mockedPlanBalance.mockReset();
});

it('pide el estado de cuenta del paciente y pinta el resumen por moneda', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();

  const cop = await screen.findByRole('region', { name: /resumen en COP/i });
  expect(mockedGet).toHaveBeenCalledWith('tok', 'pat-1');
  expect(money(within(cop).getByTestId('budgeted').textContent)).toContain('3.000.000');
  expect(money(within(cop).getByTestId('paid').textContent)).toContain('1.200.000');
  expect(money(within(cop).getByTestId('balance').textContent)).toContain('1.800.000');

  // Vencido destacado: importe y número de cuotas, en tono de peligro.
  const overdue = within(cop).getByTestId('overdue');
  expect(money(overdue.textContent)).toContain('250.000');
  expect(overdue).toHaveTextContent(/1 cuota vencida/i);
  expect(overdue.className).toMatch(/danger/);
  expect(within(cop).getByText(/próxima cuota/i).parentElement).toHaveTextContent('10/11/2026');

  // Saldo negativo = a favor del paciente; sin vencidas, sin tono de alerta.
  const usd = screen.getByRole('region', { name: /resumen en USD/i });
  expect(within(usd).getByTestId('balance')).toHaveTextContent(/a favor/i);
  expect(within(usd).getByTestId('overdue')).toHaveTextContent(/sin cuotas vencidas/i);
  expect(within(usd).getByTestId('overdue').className).not.toMatch(/danger/);
});

it('lista movimientos con método y sede, marcando los anulados', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const table = await screen.findByRole('table', { name: /movimientos/i });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent('20/09/2026');
  expect(rows[0]).toHaveTextContent(/anulado/i);
  expect(rows[0]).toHaveTextContent('Anulado por Rita Recepción: Cobro duplicado');
  expect(rows[0]).toHaveTextContent('Sede Norte');
  expect(rows[0]).toHaveTextContent('Tarjeta');
  expect(rows[1]).toHaveTextContent('Transferencia');
  expect(rows[1]).not.toHaveTextContent(/anulado/i);
  expect(rows[1]).toHaveTextContent('Plan del');
  expect(rows[2]).toHaveTextContent(/sin método/i);
});

it('lista las cuotas con su estado: pagada, vencida, pendiente', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const table = await screen.findByRole('table', { name: /cuotas/i });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows.map((r) => within(r).getByTestId('installment-status').textContent)).toEqual([
    'Pagada',
    'Vencida',
    'Pendiente',
  ]);
  expect(rows[0]).toHaveTextContent(/inicial/i);
  expect(rows[1]).toHaveTextContent('2');
});

it('muestra los planes con su saldo y señala el cancelado como fuera del saldo', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const table = await screen.findByRole('table', { name: /planes/i });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows[0]).toHaveTextContent('Aceptado');
  expect(money(rows[0].textContent)).toContain('1.800.000');
  expect(rows[1]).toHaveTextContent('Cancelado');
  expect(rows[1]).toHaveTextContent(/no suma al saldo/i);
});

it('cada plan enlaza a su presupuesto imprimible (DX-012: recepción lo imprime desde aquí)', async () => {
  const statement = accountStatementFixture();
  mockedGet.mockResolvedValue(statement);
  render(<AccountStatementView token={tokenForRole('RECEPTION')} patientId="pat-1" />);

  const table = await screen.findByRole('table', { name: /planes/i });
  const links = within(table).getAllByRole('link', {
    name: /^Presupuesto · Plan del/,
  });
  expect(links).toHaveLength(statement.plans.length);
  expect(links[0]).toHaveAttribute(
    'href',
    `/print/patients/pat-1/treatment-plans/${statement.plans[0].id}`,
  );
  expect(links[0]).toHaveAttribute('target', '_blank');
});

it('ofrece imprimir en una vista aparte, en otra pestaña', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const print = await screen.findByRole('link', { name: /imprimir/i });
  expect(print).toHaveAttribute('href', '/print/patients/pat-1/account-statement');
  expect(print).toHaveAttribute('target', '_blank');
});

it('estado vacío claro para un paciente sin planes ni abonos, sin botón de imprimir', async () => {
  mockedGet.mockResolvedValue(emptyAccountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  expect(await screen.findByText(/sin movimientos financieros/i)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /imprimir/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('error de red: estado de error con reintento que vuelve a pedir', async () => {
  mockedGet.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  mockedGet.mockResolvedValueOnce(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/no pudimos cargar el estado de cuenta/i);

  await userEvent.click(within(alert).getByRole('button', { name: /reintentar/i }));
  expect(await screen.findByRole('region', { name: /resumen en COP/i })).toBeInTheDocument();
  expect(mockedGet).toHaveBeenCalledTimes(2);
});

it('un 403 explica que el rol no tiene acceso, sin reintento', async () => {
  mockedGet.mockRejectedValue(new ApiError(403, 'Forbidden'));
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  expect(await screen.findByText(/tu rol no tiene acceso al estado de cuenta/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));
});

it('cada movimiento, también el anulado, abre su recibo de caja (DX-136)', async () => {
  const user = userEvent.setup();
  mockedGet.mockResolvedValue(accountStatementFixture());
  const mockedReceipt = getPaymentReceipt as jest.MockedFunction<typeof getPaymentReceipt>;
  mockedReceipt.mockResolvedValue(
    paymentReceiptFixture({
      paymentId: 'pay-3',
      voided: true,
      voidedAt: '2026-09-21T10:00:00.000Z',
      voidReason: 'Cobro duplicado',
    }),
  );
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const table = await screen.findByRole('table', { name: /movimientos/i });
  expect(within(table).getAllByRole('button', { name: /recibo del abono/i })).toHaveLength(3);
  const voidedRow = within(table).getAllByRole('row')[1];
  await user.click(within(voidedRow).getByRole('button', { name: /recibo del abono/i }));

  const dialog = await screen.findByRole('dialog', { name: /recibo de caja/i });
  expect(await within(dialog).findByTestId('receipt-voided')).toHaveTextContent('ANULADO');
  expect(mockedReceipt).toHaveBeenCalledWith('tok', 'pay-3');
});

describe('anular desde el estado de cuenta (DX-057)', () => {
  it('enseña «Anular» solo en movimientos con canVoid (nunca en uno ya anulado)', async () => {
    mockedGet.mockResolvedValue(accountStatementFixture());
    render(<AccountStatementView token="tok" patientId="pat-1" />);

    const table = await screen.findByRole('table', { name: /movimientos/i });
    const buttons = within(table).getAllByRole('button', {
      name: /anular abono/i,
    });
    expect(buttons).toHaveLength(1);
    expect(buttons[0].closest('tr')).toHaveTextContent('10/09/2026');
  });

  it('anula con motivo y recarga el estado de cuenta', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(accountStatementFixture());
    mockedVoid.mockResolvedValue(undefined);
    render(<AccountStatementView token="tok" patientId="pat-1" />);

    const table = await screen.findByRole('table', { name: /movimientos/i });
    await user.click(within(table).getByRole('button', { name: /anular abono/i }));
    const dialog = await screen.findByRole('dialog', {
      name: /anular este abono/i,
    });
    await user.click(within(dialog).getByLabelText(/motivo/i));
    await user.paste('Monto equivocado');
    await user.click(within(dialog).getByRole('button', { name: /anular abono/i }));

    await waitFor(() =>
      expect(mockedVoid).toHaveBeenCalledWith('tok', 'pay-2', 'Monto equivocado'),
    );
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/abono anulado/i)).toBeInTheDocument();
  });
});

describe('cobrar desde el estado de cuenta (DX-067)', () => {
  const RECEPTION = tokenForRole('RECEPTION');
  const billablePlan: BillablePlan = {
    id: 'plan-1',
    status: 'ACCEPTED',
    currency: 'COP',
    createdAt: '2026-08-01T15:00:00.000Z',
    total: 3000000,
    paid: 1200000,
    paidOtherCurrencies: [],
    balance: 1800000,
    hasActivePaymentPlan: false,
  };

  it.each(['RECEPTION', 'ADMIN'])('%s ve «Registrar abono» y «Plan de cuotas»', async (role) => {
    mockedGet.mockResolvedValue(accountStatementFixture());
    render(<AccountStatementView token={tokenForRole(role)} patientId="pat-1" />);
    await screen.findByRole('region', { name: /resumen en COP/i });
    expect(screen.getByRole('button', { name: 'Registrar abono' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plan de cuotas' })).toBeInTheDocument();
  });

  it.each(['DENTIST', 'ASSISTANT'])('%s (sin permiso de pagos) no ve los botones de cobro', async (role) => {
    mockedGet.mockResolvedValue(accountStatementFixture());
    render(<AccountStatementView token={tokenForRole(role)} patientId="pat-1" />);
    await screen.findByRole('region', { name: /resumen en COP/i });
    expect(screen.queryByRole('button', { name: 'Registrar abono' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plan de cuotas' })).not.toBeInTheDocument();
  });

  it('sin rol legible tampoco, ni con un 403 del estado de cuenta', async () => {
    mockedGet.mockResolvedValue(accountStatementFixture());
    const { unmount } = render(<AccountStatementView token="tok" patientId="pat-1" />);
    await screen.findByRole('region', { name: /resumen en COP/i });
    expect(screen.queryByRole('button', { name: 'Registrar abono' })).not.toBeInTheDocument();
    unmount();

    mockedGet.mockRejectedValue(new ApiError(403, 'Forbidden'));
    render(<AccountStatementView token={RECEPTION} patientId="pat-1" />);
    await screen.findByText(/tu rol no tiene acceso al estado de cuenta/i);
    expect(screen.queryByRole('button', { name: 'Registrar abono' })).not.toBeInTheDocument();
  });

  it('un paciente sin movimientos también puede cobrar (el modal dice si no hay planes)', async () => {
    mockedGet.mockResolvedValue(emptyAccountStatementFixture());
    mockedBillable.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<AccountStatementView token={RECEPTION} patientId="pat-1" />);
    await screen.findByText(/sin movimientos financieros/i);

    await user.click(screen.getByRole('button', { name: 'Registrar abono' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Registrar abono',
    });
    expect(
      await within(dialog).findByText('Este paciente no tiene planes por cobrar.'),
    ).toBeInTheDocument();
  });

  it('registra un abono: cierra el modal, avisa y recarga el estado de cuenta', async () => {
    mockedGet.mockResolvedValue(accountStatementFixture());
    mockedBillable.mockResolvedValue([billablePlan]);
    mockedRecord.mockResolvedValue({
      id: 'pay-new',
      tenantId: 't-1',
      treatmentPlanId: 'plan-1',
      openingBalanceId: null,
      patientId: 'pat-1',
      amount: 50000,
      currency: 'COP',
      paidAt: '2026-10-16T00:00:00.000Z',
      paidOn: '2026-10-16',
      method: null,
      notes: null,
      createdById: 'u-recep',
      createdAt: '2026-10-16T12:00:00.000Z',
      updatedAt: '2026-10-16T12:00:00.000Z',
      receiptNumber: 'PRI-000007',
      exchangeRateCurrency: 'COP',
      frozenRate: null,
      exchangeRateStatus: 'NOT_NEEDED',
    });
    const user = userEvent.setup();
    const onChanged = jest.fn();
    render(<AccountStatementView token={RECEPTION} patientId="pat-1" onChanged={onChanged} />);
    await screen.findByRole('region', { name: /resumen en COP/i });

    await user.click(screen.getByRole('button', { name: 'Registrar abono' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Registrar abono',
    });
    expect(mockedBillable).toHaveBeenCalledWith(RECEPTION, 'pat-1');
    await within(dialog).findByLabelText('Plan');
    await user.type(within(dialog).getByLabelText('Importe'), '50000');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedRecord).toHaveBeenCalledWith(
      RECEPTION,
      'plan-1',
      expect.objectContaining({ amount: 50000, currency: 'COP' }),
      expect.any(String),
    );
    expect(money((await screen.findByText(/abono registrado/i)).textContent)).toMatch(
      /50\.000,00 COP/,
    );
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    // DX-150: avisa a la ficha para releer la marca de saldo y la cobranza.
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('crea un plan de cuotas eligiendo el plan; el que ya tiene uno no se puede elegir', async () => {
    mockedGet.mockResolvedValue(accountStatementFixture());
    mockedBillable.mockResolvedValue([
      { ...billablePlan, id: 'plan-con-cuotas', hasActivePaymentPlan: true },
      billablePlan,
    ]);
    mockedCreatePlan.mockResolvedValue({} as Awaited<ReturnType<typeof createPaymentPlan>>);
    const user = userEvent.setup();
    render(<AccountStatementView token={RECEPTION} patientId="pat-1" />);
    await screen.findByRole('region', { name: /resumen en COP/i });

    await user.click(screen.getByRole('button', { name: 'Plan de cuotas' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Crear plan de pagos',
    });
    const select = await within(dialog).findByLabelText('Plan');
    expect(select).toHaveValue('plan-1');
    const taken = within(select).getAllByRole('option')[0];
    expect(taken).toBeDisabled();
    expect(taken).toHaveTextContent('(ya tiene plan de cuotas)');
    expect(within(dialog).getByLabelText('Total a financiar')).toHaveValue('3000000');

    await user.click(within(dialog).getByRole('button', { name: 'Crear' }));
    await waitFor(() =>
      expect(mockedCreatePlan).toHaveBeenCalledWith(
        RECEPTION,
        'plan-1',
        expect.objectContaining({
          installmentsCount: 12,
          totalToFinance: 3000000,
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/plan de cuotas creado/i)).toBeInTheDocument();
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
  });
});

it('DX-262: «Saldo migrado» con su fecha de corte («aprox.» si es la de importación) y en el resumen', async () => {
  mockedGet.mockResolvedValue(openingBalanceStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const table = await screen.findByRole('table', { name: 'Saldos migrados' });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent('Ortodoncia 2025');
  expect(rows[0]).toHaveTextContent('09/08/2026');
  expect(rows[0]).not.toHaveTextContent('aprox.');
  // Importe, abonado y pendiente (revisión C1).
  expect(money(within(rows[0]).getByText(/200\.000,50/).textContent)).toContain('200.000,50');
  expect(money(rows[0].textContent)).toContain('50.000,00');
  expect(money(rows[0].textContent)).toContain('150.000,50');
  expect(within(table).getByRole('columnheader', { name: 'Abonado' })).toBeInTheDocument();
  expect(within(table).getByRole('columnheader', { name: 'Pendiente' })).toBeInTheDocument();
  // El abono contra el saldo dice a qué se abonó.
  const movements = screen.getByRole('table', { name: /movimientos/i });
  expect(movements).toHaveTextContent('Saldo migrado · Ortodoncia 2025');
  // QA D2: la columna nombra el destino del abono.
  expect(within(movements).getByRole('columnheader', { name: 'Destino' })).toBeInTheDocument();
  expect(rows[1]).toHaveTextContent('23/10/2026 (aprox.)');

  const cop = screen.getByRole('region', { name: /resumen en COP/i });
  // QA D5: lo que queda del migrado tras el abono, no el importe original.
  expect(within(cop).getByTestId('opening')).toHaveTextContent(/^Incluye saldo migrado pendiente:/);
  expect(money(within(cop).getByTestId('opening').textContent)).toContain('150.000,50');
  expect(money(within(cop).getByTestId('opening').textContent)).not.toContain('200.000,50');
  expect(money(within(cop).getByTestId('balance').textContent)).toContain('150.000,50');
  // QA D3: hay una fila «aprox.», así que la nota lo explica.
  expect(screen.getByText(/«aprox\.»: el archivo no traía la fecha/)).toBeInTheDocument();
});

it('QA D3: sin ninguna fila aproximada, la nota no habla de «aprox.»; QA D5: saldado, no hay «Incluye saldo migrado»', async () => {
  const base = openingBalanceStatementFixture();
  mockedGet.mockResolvedValue({
    ...base,
    summary: [{ ...base.summary[0], openingPending: 0, paid: 200000.5, balance: 0 }],
    openingBalances: [{ ...base.openingBalances[0], paid: 200000.5, pending: 0 }],
  });
  render(<AccountStatementView token="tok" patientId="pat-1" />);
  await screen.findByRole('table', { name: 'Saldos migrados' });
  expect(screen.getByText(/^Deuda traída del programa anterior al importar los pacientes\.$/)).toBeInTheDocument();
  expect(screen.queryByText(/aprox\./)).not.toBeInTheDocument();
  const cop = screen.getByRole('region', { name: /resumen en COP/i });
  expect(within(cop).queryByTestId('opening')).not.toBeInTheDocument();
});

describe('cobrado por ítem de cada plan (DX-051)', () => {
  const planBalance = {
    planCurrency: 'COP',
    billable: 3000000,
    paid: 1200000,
    balance: 1800000,
    paymentsCount: 2,
    paymentsWithoutRate: [],
    allocated: 1200000,
    unallocated: 0,
    unconvertedPaymentsCount: 0,
    manualPaymentIds: [],
    items: [
      {
        itemId: 'item-1',
        toothNumber: '11',
        procedureName: 'Resina',
        status: 'DONE' as const,
        billable: 3000000,
        paid: 1200000,
        balance: 1800000,
      },
    ],
  };

  it('each plan offers Ver por ítem with aria-expanded and a full-width detail row', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(accountStatementFixture());
    mockedPlanBalance.mockResolvedValue(planBalance);
    render(<AccountStatementView token={tokenForRole('RECEPTION')} patientId="pat-1" />);

    const table = await screen.findByRole('table', { name: /planes/i });
    const toggles = within(table).getAllByRole('button', { name: /ver por ítem/i });
    expect(toggles).toHaveLength(2);
    for (const toggle of toggles) expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Carga al abrirse, no al pintar el estado de cuenta.
    expect(mockedPlanBalance).not.toHaveBeenCalled();

    const [first] = toggles;
    const detail = document.getElementById(first.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(detail.tagName).toBe('TR');
    expect(detail).not.toBeVisible();

    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(detail).toBeVisible();
    // La fila siguiente a la del plan, a todo el ancho de la tabla.
    expect(first.closest('tr')?.nextElementSibling).toBe(detail);
    const cell = detail.querySelector('td') as HTMLTableCellElement;
    const planHeaders = within(table.querySelector('thead') as HTMLElement).getAllByRole('columnheader');
    expect(cell.colSpan).toBe(planHeaders.length);
    expect(await within(detail).findByRole('table', { name: /por ítem/i })).toHaveTextContent('Resina');
    expect(mockedPlanBalance).toHaveBeenCalledWith(expect.any(String), 'plan-1');

    // Plegar y volver a abrir no vuelve a pedir el detalle.
    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(detail).not.toBeVisible();
    await user.click(first);
    expect(detail).toBeVisible();
    expect(mockedPlanBalance).toHaveBeenCalledTimes(1);
  });

  it('not rendered in the print view', async () => {
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => undefined);
    mockedGet.mockResolvedValue(accountStatementFixture());
    render(<AccountStatementPrintView token="tok" patientId="pat-1" />);

    expect(await screen.findByRole('heading', { level: 1, name: /estado de cuenta/i })).toBeInTheDocument();
    // Los planes sí salen impresos (si dejaran de salir, esta prueba no
    // probaría nada); su detalle por ítem, no.
    const plans = screen.getByRole('table', { name: /planes del paciente/i });
    expect(within(plans).getAllByRole('row').slice(1)).toHaveLength(accountStatementFixture().plans.length);
    expect(screen.queryByRole('button', { name: /ver por ítem/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/ver por ítem/i)).not.toBeInTheDocument();
    expect(mockedPlanBalance).not.toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
