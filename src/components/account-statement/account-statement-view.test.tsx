import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountStatementView } from './account-statement-view';
import { AccountStatementPrintView } from './account-statement-print-view';
import { ApiError } from '@/lib/api/client';
import { Toaster } from '@/components/errors/toaster';
import { getAccountStatement } from '@/lib/account-statement/account-statement-api';
import { getPlanBalance, recordPayment, voidPayment } from '@/lib/payments/payments-api';
import { listBillablePlans, type BillablePlan } from '@/lib/payments/billable-plans-api';
import { createPaymentPlan } from '@/lib/payment-plans/payment-plan-api';
import { getPaymentAllocations } from '@/lib/payments/payment-allocations-api';
import { getPaymentReceipt } from '@/lib/payments/payment-receipts-api';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';
import {
  accountStatementFixture,
  emptyAccountStatementFixture,
  openingBalanceStatementFixture,
} from '@/lib/test/account-statement';
import { tokenForRole } from '@/lib/test/data-consents';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { regionalFormat } from '@/lib/format/regional-format';
import {
  getCreditMovements,
  getCreditPolicy,
  transferCredit,
  refundCredit,
} from '@/lib/patient-credit/patient-credit-api';
import { refundFixture } from '@/lib/test/credit-refund';

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
jest.mock('../../lib/payments/payment-allocations-api', () => ({
  getPaymentAllocations: jest.fn(),
  replacePaymentAllocations: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  // El fixture trae abonos de dos sedes (loc-1, loc-2): cada fila usa la suya (DX-354b, E1).
  listLocations: jest.fn().mockResolvedValue([
    jest.requireActual('../../lib/test/locations').clinicLocation(),
    jest.requireActual('../../lib/test/locations').clinicLocation({ id: 'loc-2', name: 'Sede Principal' }),
  ]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../lib/patient-credit/patient-credit-api', () => ({
  ...jest.requireActual('../../lib/patient-credit/patient-credit-api'),
  getCreditMovements: jest.fn(),
  getCreditPolicy: jest.fn(),
  transferCredit: jest.fn(),
  refundCredit: jest.fn(),
  getCreditRefund: jest.fn(),
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

// Normaliza los espacios duros de Intl (es: "1.800.000,00 VES" lleva U+00A0).
function money(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

beforeEach(() => {
  (getCreditMovements as jest.Mock).mockReset().mockResolvedValue({ transfers: [], refunds: [] });
  (getCreditPolicy as jest.Mock).mockReset().mockResolvedValue({ receptionMaxAmount: 100000 });
  (transferCredit as jest.Mock).mockReset();
  (refundCredit as jest.Mock).mockReset();
  mockedGet.mockReset();
  mockedVoid.mockReset();
  mockedRecord.mockReset();
  mockedBillable.mockReset();
  mockedCreatePlan.mockReset();
  mockedPlanBalance.mockReset();
  (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([
    clinicLocation(),
    clinicLocation({ id: 'loc-2', name: 'Sede Principal' }),
  ]);
});


/** UX v2: Recibo y Anular viven en el «⋯» de cada movimiento («Acciones de abono de …»). */
async function rowMenu(user: ReturnType<typeof userEvent.setup>, row: HTMLElement): Promise<string[]> {
  await user.click(within(row).getByRole('button', { name: /^acciones de abono de/i }));
  return (await screen.findAllByRole('menuitem')).map((i) => i.textContent ?? '');
}

it('pide el estado de cuenta del paciente y pinta el resumen por moneda', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();

  const ves = await screen.findByRole('region', { name: /resumen en VES/i });
  expect(mockedGet).toHaveBeenCalledWith('tok', 'pat-1');
  expect(money(within(ves).getByTestId('budgeted').textContent)).toContain('VES 3.000.000,00');
  expect(money(within(ves).getByTestId('paid').textContent)).toContain('1.200.000');
  expect(money(within(ves).getByTestId('balance').textContent)).toContain('VES 1.800.000,00');

  // Vencido destacado: importe y número de cuotas, en tono de peligro.
  const overdue = within(ves).getByTestId('overdue');
  expect(money(overdue.textContent)).toContain('250.000');
  expect(overdue).toHaveTextContent(/1 cuota vencida/i);
  expect(overdue.className).toMatch(/danger/);
  expect(within(ves).getByText(/próxima cuota/i).parentElement).toHaveTextContent('10/11/2026');

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
  // DX-395: el medio de la clínica y la referencia, no el método antiguo.
  expect(rows[1]).toHaveTextContent('Pago móvil · Ref. ABC 123');
  expect(rows[1]).not.toHaveTextContent('Transferencia');
  expect(rows[1]).not.toHaveTextContent(/anulado/i);
  expect(rows[1]).toHaveTextContent('Plan del');
  expect(rows[2]).toHaveTextContent(/sin método/i);
});

it('DX-354b: el día de cada abono sale con el formato de SU sede y el de las cuotas, con el de la pantalla', async () => {
  const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
  const screenSede = clinicLocation({ id: 'loc-1', name: 'Sede Norte', locale: 'de-DE', hourCycle: 'h23' });
  const otherSede = clinicLocation({ id: 'loc-2', name: 'Sede Principal', locale: 'en-US', hourCycle: 'h12' });
  mockedLocations.mockResolvedValue([screenSede, otherSede]);
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const de = regionalFormat({ locale: 'de-DE', hourCycle: 'h23' });
  const us = regionalFormat({ locale: 'en-US', hourCycle: 'h12' });
  const table = await screen.findByRole('table', { name: /movimientos/i });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows[0]).toHaveTextContent(de.civilDate('2026-09-20'));
  expect(rows[1]).toHaveTextContent(us.civilDate('2026-09-10'));
  expect(rows[1]).not.toHaveTextContent(de.civilDate('2026-09-10'));
  const ves = screen.getByRole('region', { name: /resumen en VES/i });
  expect(within(ves).getByText(/próxima cuota/i).parentElement).toHaveTextContent(de.civilDate('2026-11-10'));
});

it('DX-354b (M1): sin formato de la sede las filas de abonos se anuncian sin «—»', async () => {
  (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([
    clinicLocation({ locale: null, hourCycle: null }),
    clinicLocation({ id: 'loc-2', locale: null, hourCycle: null }),
  ]);
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);
  const table = await screen.findByRole('table', { name: /movimientos/i });
  await screen.findAllByText(/No se pudo saber el formato regional/);
  const buttons = within(table).getAllByRole('button', { name: /^acciones de abono/i });
  for (const b of buttons) expect(b.getAttribute('aria-label')).not.toContain('—');
});

it('DX-395: la vista imprimible también lleva «Pago móvil · Ref. ABC 123»', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementPrintView token="tok" patientId="pat-1" />);
  const table = await screen.findByRole('table', { name: /movimientos/i });
  expect(within(table).getByRole('row', { name: /Pago móvil/ })).toHaveTextContent('Pago móvil · Ref. ABC 123');
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
  expect(await screen.findByRole('region', { name: /resumen en VES/i })).toBeInTheDocument();
  expect(mockedGet).toHaveBeenCalledTimes(2);
});

it('un 403 explica que el rol no tiene acceso, sin reintento', async () => {
  mockedGet.mockRejectedValue(new ApiError(403, 'Forbidden'));
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  expect(await screen.findByText(/tu rol no tiene acceso al estado de cuenta/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));
});

it('«Ver imputación» (DX-399): los abonos a un plan vivo la ofrecen, el anulado no, y abre el detalle de solo lectura', async () => {
  const user = userEvent.setup();
  mockedGet.mockResolvedValue(accountStatementFixture());
  (getPaymentAllocations as jest.Mock).mockResolvedValue({
    paymentId: 'pay-2',
    receiptNumber: null,
    locationId: 'loc-2',
    treatmentPlanId: 'plan-1',
    paymentAmount: 200000,
    paymentCurrency: 'VES',
    paidOn: '2026-09-18',
    planCurrency: 'VES',
    planStatus: 'ACCEPTED',
    planAmount: 200000,
    manual: true,
    allocated: 150000,
    unallocated: 50000,
    creditOut: 0,
    onAccount: 50000,
    version: 'a'.repeat(64),
    allocations: [{ treatmentPlanItemId: 'item-1', amount: 150000, source: 'MANUAL' }],
    items: [
      {
        itemId: 'item-1',
        toothNumber: '11',
        procedureName: 'Corona',
        status: 'ACCEPTED',
        billable: 300000,
        paidByOthers: 0,
        free: 300000,
      },
    ],
  });
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const table = await screen.findByRole('table', { name: /movimientos/i });
  const [, voidedRow, liveRow] = within(table).getAllByRole('row');
  expect(await rowMenu(user, voidedRow)).not.toContain('Ver imputación');
  await user.keyboard('{Escape}');
  expect(await rowMenu(user, liveRow)).toContain('Ver imputación');
  await user.click(screen.getByRole('menuitem', { name: 'Ver imputación' }));

  const dialog = await screen.findByRole('dialog', { name: 'Imputación del abono' });
  expect(getPaymentAllocations).toHaveBeenCalledWith('tok', 'pay-2');
  expect(await within(dialog).findByText('Manual')).toBeInTheDocument();
  expect(within(dialog).getByRole('row', { name: /Corona/ })).toBeInTheDocument();
  expect(within(dialog).getByRole('row', { name: /A cuenta/ })).toBeInTheDocument();
  // Recepción no cambia la imputación desde aquí.
  expect(within(dialog).queryByRole('button', { name: 'Cambiar imputación' })).not.toBeInTheDocument();
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
  expect(within(table).getAllByRole('button', { name: /^acciones de abono de/i })).toHaveLength(3);
  const voidedRow = within(table).getAllByRole('row')[1];
  expect(await rowMenu(user, voidedRow)).toEqual(['Recibo']);
  await user.click(screen.getByRole('menuitem', { name: 'Recibo' }));

  const dialog = await screen.findByRole('dialog', { name: /recibo de caja/i });
  expect(await within(dialog).findByTestId('receipt-voided')).toHaveTextContent('ANULADO');
  expect(mockedReceipt).toHaveBeenCalledWith('tok', 'pay-3');
});

describe('anular desde el estado de cuenta (DX-057)', () => {
  it('enseña «Anular» solo en movimientos con canVoid (nunca en uno ya anulado)', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(accountStatementFixture());
    render(<AccountStatementView token="tok" patientId="pat-1" />);

    const table = await screen.findByRole('table', { name: /movimientos/i });
    const rows = within(table).getAllByRole('row').slice(1);
    const withVoid: string[] = [];
    for (const row of rows) {
      if ((await rowMenu(user, row)).includes('Anular')) withVoid.push(row.textContent ?? '');
      await user.keyboard('{Escape}');
    }
    expect(withVoid).toHaveLength(1);
    expect(withVoid[0]).toContain('10/09/2026');
  });

  it('anula con motivo y recarga el estado de cuenta', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(accountStatementFixture());
    mockedVoid.mockResolvedValue(undefined);
    render(<AccountStatementView token="tok" patientId="pat-1" />);

    const table = await screen.findByRole('table', { name: /movimientos/i });
    const row = within(table).getByRole('row', { name: /10\/09\/2026/ });
    await rowMenu(user, row);
    await user.click(screen.getByRole('menuitem', { name: 'Anular' }));
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

describe('anular una forma de pago de un cobro dividido (revisión DX-390)', () => {
  it('avisa antes de anular que se anula el cobro entero y su recibo', async () => {
    const user = userEvent.setup();
    const fixture = accountStatementFixture();
    mockedGet.mockResolvedValue({
      ...fixture,
      movements: fixture.movements.map((m) =>
        m.id === 'pay-2' ? { ...m, splitId: 'pay-2', splitLines: 3 } : m,
      ),
    });
    render(<AccountStatementView token="tok" patientId="pat-1" />);
    const table = await screen.findByRole('table', { name: /movimientos/i });
    const row = within(table).getByRole('row', { name: /10\/09\/2026/ });
    await rowMenu(user, row);
    await user.click(screen.getByRole('menuitem', { name: 'Anular' }));
    const dialog = await screen.findByRole('dialog', { name: /anular este abono/i });
    expect(dialog).toHaveTextContent(
      'Es una de las 3 formas de pago de un mismo cobro: se anulan todas y su recibo.',
    );

    // QA DX-390 (B5): la confirmación dice que se anuló el cobro entero.
    mockedVoid.mockResolvedValue(undefined);
    await user.type(within(dialog).getByLabelText(/motivo/i), 'Cobro duplicado');
    await user.click(within(dialog).getByRole('button', { name: /anular abono/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/^Cobro anulado: 3 formas de pago y su recibo · /)).toBeInTheDocument();
  });
});

describe('cobrar desde el estado de cuenta (DX-067)', () => {
  const RECEPTION = tokenForRole('RECEPTION');
  const billablePlan: BillablePlan = {
    id: 'plan-1',
    status: 'ACCEPTED',
    currency: 'VES',
    createdAt: '2026-08-01T15:00:00.000Z',
    total: 3000000,
    paid: 1200000,
    paidOtherCurrencies: [],
    balance: 1800000,
    hasActivePaymentPlan: false,
    paymentsWithoutRate: [],
    rateProviderTimedOut: false,
  };

  it.each(['RECEPTION', 'ADMIN'])('%s ve «Registrar abono» y «Plan de cuotas»', async (role) => {
    mockedGet.mockResolvedValue(accountStatementFixture());
    render(<AccountStatementView token={tokenForRole(role)} patientId="pat-1" />);
    await screen.findByRole('region', { name: /resumen en VES/i });
    expect(screen.getByRole('button', { name: 'Registrar abono' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plan de cuotas' })).toBeInTheDocument();
  });

  it.each(['DENTIST', 'ASSISTANT'])('%s (sin permiso de pagos) no ve los botones de cobro', async (role) => {
    mockedGet.mockResolvedValue(accountStatementFixture());
    render(<AccountStatementView token={tokenForRole(role)} patientId="pat-1" />);
    await screen.findByRole('region', { name: /resumen en VES/i });
    expect(screen.queryByRole('button', { name: 'Registrar abono' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plan de cuotas' })).not.toBeInTheDocument();
  });

  it('sin rol legible tampoco, ni con un 403 del estado de cuenta', async () => {
    mockedGet.mockResolvedValue(accountStatementFixture());
    const { unmount } = render(<AccountStatementView token="tok" patientId="pat-1" />);
    await screen.findByRole('region', { name: /resumen en VES/i });
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
      splitId: null,
      splitLine: null,
      treatmentPlanId: 'plan-1',
      openingBalanceId: null,
      patientId: 'pat-1',
      amount: 50000,
      currency: 'VES',
      paidAt: '2026-10-16T00:00:00.000Z',
      paidOn: '2026-10-16',
      method: null,
      paymentMethodId: null,
      paymentMethodName: null,
      reference: null,
      duplicateReferenceReason: null,
      externalInvoiceNumber: null,
      notes: null,
      createdById: 'u-recep',
      createdAt: '2026-10-16T12:00:00.000Z',
      updatedAt: '2026-10-16T12:00:00.000Z',
      receiptNumber: 'PRI-000007',
      exchangeRateCurrency: 'VES',
      frozenRate: null,
      exchangeRateStatus: 'NOT_NEEDED',
      adjustments: [],
      collectedAmount: 50000,
    });
    const user = userEvent.setup();
    const onChanged = jest.fn();
    render(<><AccountStatementView token={RECEPTION} patientId="pat-1" onChanged={onChanged} /><Toaster /></>);
    await screen.findByRole('region', { name: /resumen en VES/i });

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
      expect.objectContaining({ amount: 50000, currency: 'VES' }),
      expect.any(String),
    );
    expect(money((await screen.findByText(/abono registrado/i)).textContent)).toMatch(
      /VES 50\.000,00/,
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
    render(<><AccountStatementView token={RECEPTION} patientId="pat-1" /><Toaster /></>);
    await screen.findByRole('region', { name: /resumen en VES/i });

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

  const ves = screen.getByRole('region', { name: /resumen en VES/i });
  // QA D5: lo que queda del migrado tras el abono, no el importe original.
  expect(within(ves).getByTestId('opening')).toHaveTextContent(/^Incluye saldo migrado pendiente:/);
  expect(money(within(ves).getByTestId('opening').textContent)).toContain('150.000,50');
  expect(money(within(ves).getByTestId('opening').textContent)).not.toContain('200.000,50');
  expect(money(within(ves).getByTestId('balance').textContent)).toContain('150.000,50');
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
  const ves = screen.getByRole('region', { name: /resumen en VES/i });
  expect(within(ves).queryByTestId('opening')).not.toBeInTheDocument();
});

describe('cobrado por ítem de cada plan (DX-051)', () => {
  const planBalance = {
    planCurrency: 'VES',
    billable: 3000000,
    paid: 1200000,
    balance: 1800000,
    creditMovements: 0,
    paymentsCount: 2,
    paymentsWithoutRate: [],
    allocated: 1200000,
    unallocated: 0,
    creditOut: 0,
    onAccount: 0,
    unconvertedPaymentsCount: 0,
    rateProviderTimedOut: false,
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

describe('AccountStatementView: proveedor de tasas (DX-472)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it('avisa con «Reintentar» y vuelve a pedir el estado de cuenta', async () => {
    const plans = accountStatementFixture().plans;
    const timedOut = accountStatementFixture({
      rateProviderTimedOut: true,
      plans: [
        {
          ...plans[0],
          rateProviderTimedOut: true,
          paymentsWithoutRate: [{ paymentId: 'p', amount: 3600, currency: 'VES', paidOn: '2026-10-30' }],
        },
      ],
    });
    mockedGet.mockResolvedValueOnce(timedOut).mockResolvedValueOnce(accountStatementFixture());
    render(<AccountStatementView token="t" patientId="p-1" />);

    expect(await screen.findByText('El proveedor de tasas no respondió, vuelve a intentarlo')).toBeInTheDocument();
    expect(screen.getByText(/todavía no cuenta 1 abono/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText('El proveedor de tasas no respondió, vuelve a intentarlo')).not.toBeInTheDocument(),
    );
  });

  it('lo entregado en otra moneda no se presenta como una suma', async () => {
    const plans = accountStatementFixture().plans;
    mockedGet.mockResolvedValue(
      accountStatementFixture({
        plans: [{ ...plans[0], paidOtherCurrencies: [{ currency: 'VES', amount: 3600 }] }],
      }),
    );
    render(<AccountStatementView token="t" patientId="p-1" />);
    expect((await screen.findAllByText(/Entregado:/)).length).toBeGreaterThan(0);
  });

  it('el resumen cuadra con los planes: lo convertido, sin fila de lo entregado en otra moneda', async () => {
    const [cop] = accountStatementFixture().summary;
    mockedGet.mockResolvedValue(
      accountStatementFixture({
        summary: [
          { ...cop, currency: 'USD', paid: 0, balance: 300, convertedPaid: 100, convertedBalance: 200 },
          {
            ...cop,
            currency: 'VES',
            budgeted: 0,
            paid: 3600,
            balance: -3600,
            convertedPaid: 0,
            convertedBalance: 0,
            overdueCount: 0,
            overdueAmount: 0,
            nextInstallment: null,
          },
        ],
      }),
    );
    render(<AccountStatementView token="t" patientId="p-1" />);

    const usd = await screen.findByRole('region', { name: /resumen en USD/i });
    expect(within(usd).getByTestId('balance')).toHaveTextContent('200');
    expect(screen.queryByRole('region', { name: /resumen en VES/i })).not.toBeInTheDocument();
  });

  it('un abono sin tasa se avisa arriba del resumen, sin «Reintentar»', async () => {
    const plans = accountStatementFixture().plans;
    mockedGet.mockResolvedValue(
      accountStatementFixture({
        plans: [
          {
            ...plans[0],
            paymentsWithoutRate: [{ paymentId: 'p', amount: 3600, currency: 'VES', paidOn: '2026-10-30' }],
          },
        ],
      }),
    );
    render(<AccountStatementView token="t" patientId="p-1" />);

    expect(await screen.findByText('1 abono sin tasa')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('una fila sin importes pero con cuota pendiente se sigue viendo', async () => {
    const [row] = accountStatementFixture().summary;
    mockedGet.mockResolvedValue(
      accountStatementFixture({
        summary: [
          { ...row, currency: 'USD', budgeted: 0, paid: 0, balance: 0, convertedPaid: 0, convertedBalance: 0 },
        ],
      }),
    );
    render(<AccountStatementView token="t" patientId="p-1" />);

    expect(await screen.findByRole('region', { name: /resumen en USD/i })).toBeInTheDocument();
  });
});

describe('las líneas de un cobro dividido, juntas por su recibo (DX-414)', () => {
  it('cada línea lleva «Cobro dividido · 3 formas · PRI-000007»; un abono suelto, ninguna', async () => {
    const fixture = accountStatementFixture();
    mockedGet.mockResolvedValue({
      ...fixture,
      movements: fixture.movements.map((m) =>
        m.id === 'pay-2'
          ? { ...m, splitId: 'pay-2', splitLines: 3, receiptNumber: 'PRI-000007' }
          : m.id === 'pay-1'
            ? { ...m, splitId: 'pay-2', splitLines: 3, receiptNumber: 'PRI-000007' }
            : m,
      ),
    });
    render(<AccountStatementView token="tok" patientId="pat-1" />);
    const table = await screen.findByRole('table', { name: /movimientos/i });
    expect(within(table).getAllByText('Cobro dividido · 3 formas · PRI-000007').length).toBeGreaterThanOrEqual(2);
    const single = within(table).getByRole('row', { name: /20\/09\/2026/ });
    expect(within(single).queryByText(/Cobro dividido/)).not.toBeInTheDocument();
  });
});

describe('botones táctiles del estado de cuenta (DX-414)', () => {
  it('«Registrar abono» y «Plan de cuotas» miden 44 px a 390 px', async () => {
    mockedGet.mockResolvedValue(accountStatementFixture());
    render(<AccountStatementView token={tokenForRole('RECEPTION')} patientId="pat-1" />);
    await screen.findByRole('table', { name: /movimientos/i });
    expect(screen.getByRole('button', { name: 'Registrar abono' }).className).toContain('max-sm:min-h-11');
    expect(screen.getByRole('button', { name: 'Plan de cuotas' }).className).toContain('max-sm:min-h-11');
  });
});

/** Un plan cancelado con 300.000 abonados (queda a favor) y uno vivo que debe 400.000. */
function creditStatement() {
  const base = accountStatementFixture();
  const [live] = base.plans;
  return {
    ...base,
    plans: [
      { ...live, id: 'live', budgeted: 400000, paid: 0, balance: 400000 },
      { ...live, id: 'cancelled', status: 'CANCELLED' as const, countsTowardsBalance: false, paid: 300000, balance: -300000 },
    ],
    movements: [{ ...base.movements[1], id: 'pay-c', amount: 300000, treatmentPlanId: 'cancelled' }],
  };
}

describe('saldo a favor en el estado de cuenta (DX-432)', () => {
  it('«Traspasos y devoluciones» se ve aunque el saldo a favor sea 0 (ADMIN y recepción); DENTIST no la pide', async () => {
    const base = accountStatementFixture();
    mockedGet.mockResolvedValue({ ...base, plans: base.plans.map((p) => ({ ...p, balance: Math.max(p.balance, 0) })) });
    const { unmount } = render(<AccountStatementView token={tokenForRole('ADMIN')} patientId="pat-1" />);
    expect(await screen.findByRole('heading', { name: 'Traspasos y devoluciones' })).toBeInTheDocument();
    expect(await screen.findByText('Aún no hay traspasos ni devoluciones')).toBeInTheDocument();
    expect(screen.queryByTestId('credit-balance')).not.toBeInTheDocument();
    expect(getCreditMovements).toHaveBeenCalledWith(expect.any(String), 'pat-1');
    unmount();
    (getCreditMovements as jest.Mock).mockClear();
    render(<AccountStatementView token={tokenForRole('DENTIST')} patientId="pat-1" />);
    await screen.findByRole('region', { name: /resumen en VES/i });
    expect(screen.queryByRole('heading', { name: 'Traspasos y devoluciones' })).not.toBeInTheDocument();
    expect(getCreditMovements).not.toHaveBeenCalled();
  });

  it('recepción con el tope en 0: «Aplicar a otro plan» y «Devolver» deshabilitadas y con el porqué', async () => {
    const user = userEvent.setup();
    (getCreditPolicy as jest.Mock).mockResolvedValue({ receptionMaxAmount: 0 });
    mockedGet.mockResolvedValue(creditStatement());
    render(<AccountStatementView token={tokenForRole('RECEPTION')} patientId="pat-1" />);
    await screen.findByTestId('credit-balance');
    await waitFor(() => expect(getCreditPolicy).toHaveBeenCalled());
    const trigger = within(screen.getByTestId('credit-balance')).getByRole('button', { name: /^Acciones de/ });
    // Un solo clic; el menú abierto se repinta cuando llega el tope (solo aserciones en waitFor).
    await user.click(trigger);
    const items = await screen.findAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveAttribute('aria-disabled', 'true'));
    expect(screen.getAllByText(/Recepción no puede traspasar ni devolver saldo a favor/).length).toBeGreaterThanOrEqual(2);
  });

  it('el administrador no consulta el tope y sus acciones siguen activas', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(creditStatement());
    render(<AccountStatementView token={tokenForRole('ADMIN')} patientId="pat-1" />);
    const credit = await screen.findByTestId('credit-balance');
    await user.click(within(credit).getByRole('button', { name: /^Acciones de/ }));
    expect(await screen.findByRole('menuitem', { name: /Devolver/ })).not.toHaveAttribute('aria-disabled');
    expect(getCreditPolicy).not.toHaveBeenCalled();
  });

  it('un abono que es referencia de una devolución: «Anular» deshabilitado con la explicación de la API', async () => {
    const user = userEvent.setup();
    const reason =
      'No se puede anular: el abono es referencia de la devolución DEV-NOR-000007: una devolución no se deshace y el abono queda como su traza contable.';
    const base = accountStatementFixture();
    mockedGet.mockResolvedValue({
      ...base,
      movements: base.movements.map((m) => (m.id === 'pay-2' ? { ...m, voidBlockedReason: reason } : m)),
    });
    render(<AccountStatementView token={tokenForRole('ADMIN')} patientId="pat-1" />);
    const table = await screen.findByRole('table', { name: /movimientos/i });
    const row = within(table).getByRole('row', { name: /10\/09\/2026/ });
    await user.click(within(row).getByRole('button', { name: /^acciones de abono de/i }));
    const anular = await screen.findByRole('menuitem', { name: /Anular/ });
    expect(anular).toHaveAttribute('aria-disabled', 'true');
    expect(anular).toHaveAccessibleDescription(reason);
    await user.click(anular);
    expect(screen.queryByRole('dialog', { name: /anular este abono/i })).not.toBeInTheDocument();
  });

  it('reimprimir una devolución del historial abre su comprobante y, al cerrarlo, el foco vuelve a la fila de donde salió', async () => {
    const user = userEvent.setup();
    const refund = refundFixture({ id: 'r-1', number: 'DEV-NOR-000007', currency: 'VES', treatmentPlanId: 'cancelled' });
    (getCreditMovements as jest.Mock).mockResolvedValue({ transfers: [], refunds: [refund] });
    mockedGet.mockResolvedValue(creditStatement());
    render(<AccountStatementView token={tokenForRole('ADMIN')} patientId="pat-1" />);
    const history = await screen.findByTestId('credit-movements');
    const table = await within(history).findByRole('table');
    const trigger = within(table).getByRole('button', { name: /^Acciones de/ });
    await user.click(trigger);
    await user.click(await screen.findByRole('menuitem', { name: 'Reimprimir comprobante' }));
    const dialog = await screen.findByRole('dialog', { name: 'Comprobante de devolución' });
    expect(within(dialog).getByRole('link', { name: /Imprimir A4/ })).toHaveAttribute('href', '/print/credit-refunds/r-1');
    await user.click(within(dialog).getAllByRole('button', { name: 'Cerrar' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('una devolución recién hecha abre su comprobante y, al cerrarlo, el foco queda en «Traspasos y devoluciones»', async () => {
    const user = userEvent.setup();
    (refundCredit as jest.Mock).mockResolvedValue(
      refundFixture({ id: 'r-9', number: 'DEV-NOR-000009', currency: 'VES', treatmentPlanId: 'cancelled' }),
    );
    mockedGet.mockResolvedValue(creditStatement());
    render(<AccountStatementView token={tokenForRole('ADMIN')} patientId="pat-1" />);
    const credit = await screen.findByTestId('credit-balance');
    await user.click(within(credit).getByRole('button', { name: /^Acciones de/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Devolver/ }));
    const form = await screen.findByRole('dialog');
    await user.type(within(form).getByLabelText('Importe a devolver'), '50000');
    fireEvent.change(within(form).getByLabelText('Motivo'), { target: { value: 'El paciente se muda' } });
    fireEvent.change(within(form).getByLabelText('Cómo se devuelve'), { target: { value: 'TRANSFER' } });
    await user.click(within(form).getByRole('button', { name: 'Devolver' }));
    const receipt = await screen.findByRole('dialog', { name: 'Devolución registrada' });
    await user.click(within(receipt).getAllByRole('button', { name: 'Cerrar' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Traspasos y devoluciones' })).toHaveFocus());
  });

  it('un traspaso correcto avisa (toast), recarga y deja el foco en «Traspasos y devoluciones»', async () => {
    const user = userEvent.setup();
    (transferCredit as jest.Mock).mockResolvedValue({});
    mockedGet.mockResolvedValue(creditStatement());
    render(
      <>
        <Toaster />
        <AccountStatementView token={tokenForRole('ADMIN')} patientId="pat-1" />
      </>,
    );
    const credit = await screen.findByTestId('credit-balance');
    await user.click(within(credit).getByRole('button', { name: /^Acciones de/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Aplicar a otro plan/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Importe a aplicar'), '200000');
    await user.click(within(dialog).getByRole('button', { name: 'Aplicar al plan' }));
    await waitFor(() => expect(transferCredit).toHaveBeenCalled());
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Saldo a favor aplicado/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Traspasos y devoluciones' })).toHaveFocus());
    // El historial se pidió de nuevo.
    expect((getCreditMovements as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
