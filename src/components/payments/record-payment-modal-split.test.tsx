import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordPaymentModal } from './record-payment-modal';
import { splitPaymentCopy } from './split-payment-lines';
import { paymentMethodFieldsCopy } from './payment-method-fields';
import { ApiError } from '@/lib/api/client';
import {
  getPlanBalance,
  recordPayment,
  recordSplitPayment,
  type PlanBalance,
  type SplitPayment,
} from '@/lib/payments/payments-api';
import { listBillablePlans, type BillablePlan } from '@/lib/payments/billable-plans-api';
import { listPaymentMethods } from '@/lib/payments/payment-methods-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { getExchangeRates } from '@/lib/exchange/exchange-api';

// DX-390: «Registrar abono» con «Añadir otra forma de pago».
jest.mock('../../lib/payments/payments-api', () => ({
  ...jest.requireActual('../../lib/payments/payments-api'),
  recordPayment: jest.fn(),
  recordOpeningBalancePayment: jest.fn(),
  recordSplitPayment: jest.fn(),
  getPlanBalance: jest.fn(),
}));
jest.mock('../../lib/payments/billable-plans-api', () => ({
  ...jest.requireActual('../../lib/payments/billable-plans-api'),
  listBillablePlans: jest.fn(),
}));
jest.mock('../../lib/exchange/exchange-api', () => ({
  getExchangeRates: jest.fn(),
}));
jest.mock('../../lib/payments/payment-methods-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-methods-api'),
  listPaymentMethods: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$' },
  ]),
}));

const mockedRecord = recordPayment as jest.MockedFunction<typeof recordPayment>;
const mockedSplit = recordSplitPayment as jest.MockedFunction<typeof recordSplitPayment>;
const mockedMethods = listPaymentMethods as jest.MockedFunction<typeof listPaymentMethods>;

const METHODS = [
  {
    id: 'pm-cash',
    name: 'Efectivo',
    kind: 'CASH' as const,
    active: true,
    requiresReference: false,
    legacyMethod: 'CASH' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pm-transfer',
    name: 'Transferencia',
    kind: 'TRANSFER' as const,
    active: true,
    requiresReference: true,
    legacyMethod: 'TRANSFER' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const copPlan: BillablePlan = {
  id: 'plan-cop',
  status: 'ACCEPTED',
  currency: 'COP',
  createdAt: '2026-08-01T15:00:00.000Z',
  total: 3000000,
  paid: 2700000,
  paidOtherCurrencies: [],
  balance: 300000,
  hasActivePaymentPlan: false,
};

function copBalance(balance: number): PlanBalance {
  return {
    planCurrency: 'COP',
    billable: 3000000,
    paid: 3000000 - balance,
    balance,
    paymentsCount: 1,
    paymentsWithoutRate: [],
    allocated: 0,
    unallocated: 0,
    unconvertedPaymentsCount: 0,
    manualPaymentIds: [],
    items: [],
  };
}

function savedSplit(): SplitPayment {
  const line = (id: string, n: number, amount: number, currency: string) => ({
    id,
    tenantId: 't-1',
    treatmentPlanId: 'plan-cop',
    openingBalanceId: null,
    patientId: 'pat-1',
    amount,
    currency,
    paidAt: '2026-10-30T17:00:00.000Z',
    paidOn: '2026-10-30',
    method: 'CASH' as const,
    paymentMethodId: 'pm-cash',
    paymentMethodName: 'Efectivo',
    reference: null,
    duplicateReferenceReason: null,
    notes: null,
    splitId: 'pay-1',
    splitLine: n,
    createdById: 'u-1',
    createdAt: '2026-10-30T17:00:00.000Z',
    updatedAt: '2026-10-30T17:00:00.000Z',
    receiptNumber: 'PRI-000007',
    exchangeRateCurrency: 'COP',
    frozenRate: null,
    exchangeRateStatus: 'NOT_NEEDED' as const,
  });
  return {
    id: 'pay-1',
    receiptNumber: 'PRI-000007',
    planCurrency: 'COP',
    total: 300000,
    payments: [line('pay-1', 1, 100000, 'COP'), line('pay-2', 2, 50, 'USD')],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (listLocations as jest.Mock).mockResolvedValue([clinicLocation()]);
  (listBillablePlans as jest.Mock).mockResolvedValue([copPlan]);
  (getExchangeRates as jest.Mock).mockResolvedValue({
    base: 'USD',
    source: 'AUTOMATIC',
    rates: { COP: 4000 },
  });
  (getPlanBalance as jest.Mock).mockResolvedValue(copBalance(1800000));
  mockedMethods.mockResolvedValue(METHODS);
  mockedSplit.mockResolvedValue(savedSplit());
});

function renderModal() {
  const onRecorded = jest.fn();
  render(<RecordPaymentModal open onOpenChange={jest.fn()} token="tok" patientId="pat-1" onRecorded={onRecorded} />);
  return {
    onRecorded,
    dialog: screen.getByRole('dialog', { name: 'Registrar abono' }),
  };
}

const text = (value: string | null | undefined) => (value ?? '').replace(/\s/g, ' ');

/** La primera forma de pago: 100 000 COP en efectivo, y la segunda: 50 USD en efectivo. */
async function fillTwoLines(dialog: HTMLElement) {
  const user = userEvent.setup();
  await within(dialog).findByLabelText('Plan');
  await waitFor(() => expect(within(dialog).getByLabelText('Método')).not.toBeDisabled());
  await user.type(document.getElementById('rp-amount') as HTMLElement, '100000');
  await user.selectOptions(document.getElementById('rp-method') as HTMLElement, 'pm-cash');
  await user.click(within(dialog).getByRole('button', { name: splitPaymentCopy.addLine }));
  const second = within(dialog).getByTestId('split-line-2');
  await user.type(within(second).getByLabelText('Importe'), '50');
  const currency = within(second).getByLabelText('Moneda');
  await waitFor(() => expect(within(currency).getAllByRole('option').length).toBeGreaterThan(1));
  await user.selectOptions(currency, 'USD');
  return { user, second };
}

it('añade otra forma de pago y registra el cobro dividido: total y pendiente en la moneda del plan, una sola clave', async () => {
  const { dialog, onRecorded } = renderModal();
  const { user, second } = await fillTwoLines(dialog);
  await user.selectOptions(within(second).getByLabelText('Método'), 'pm-cash');

  const summary = within(dialog).getByTestId('split-summary');
  // 100 000 + 50 USD × 4000 = 300 000 COP; pendiente 1 800 000.
  await waitFor(() => expect(text(summary.textContent)).toContain('Total del cobroCOP 300.000,00'));
  expect(text(summary.textContent)).toContain('Pendiente del planCOP 1.800.000,00');
  expect(text(summary.textContent)).toContain('Pendiente tras el cobroCOP 1.500.000,00');
  // La previsualización de un abono suelto no se repite en el cobro dividido.
  expect(within(dialog).queryByTestId('rp-rate-preview')).toBeNull();

  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

  await waitFor(() => expect(mockedSplit).toHaveBeenCalledTimes(1));
  expect(mockedRecord).not.toHaveBeenCalled();
  const [token, planId, body, key] = mockedSplit.mock.calls[0];
  expect([token, planId]).toEqual(['tok', 'plan-cop']);
  expect(body).toEqual({
    paidAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    lines: [
      { amount: 100000, currency: 'COP', paymentMethodId: 'pm-cash' },
      { amount: 50, currency: 'USD', paymentMethodId: 'pm-cash' },
    ],
  });
  expect(key).toMatch(/^[0-9a-f-]{36}$/);
  expect(text(onRecorded.mock.calls[0][0])).toBe(
    'Cobro registrado: COP 300.000,00 en 2 formas de pago · 30/10/2026 · Plan del 01/08/2026 · recibo PRI-000007.',
  );
});

it('cada forma de pago pide su medio y su referencia: error en el campo, foco y sin llamar a la API', async () => {
  const { dialog } = renderModal();
  const { user, second } = await fillTwoLines(dialog);

  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  const method = within(second).getByLabelText('Método');
  await waitFor(() => expect(method).toHaveAttribute('aria-invalid', 'true'));
  expect(method).toHaveFocus();
  expect(within(second).getByText(paymentMethodFieldsCopy.methodMissing)).toBeInTheDocument();

  await user.selectOptions(method, 'pm-transfer');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  const reference = within(second).getByLabelText('Referencia (obligatoria)');
  await waitFor(() => expect(reference).toHaveAttribute('aria-invalid', 'true'));
  expect(reference).toHaveFocus();
  expect(mockedSplit).not.toHaveBeenCalled();
});

it('hasta 5 formas de pago; quitar las añadidas vuelve al abono de siempre', async () => {
  const user = userEvent.setup();
  const { dialog } = renderModal();
  await within(dialog).findByLabelText('Plan');
  const add = () => user.click(within(dialog).getByRole('button', { name: splitPaymentCopy.addLine }));
  for (let i = 0; i < 4; i += 1) await add();
  expect(within(dialog).queryByRole('button', { name: splitPaymentCopy.addLine })).toBeNull();
  expect(within(dialog).getByText(splitPaymentCopy.maxLines(5))).toBeInTheDocument();
  for (let n = 5; n >= 2; n -= 1) {
    await user.click(
      within(dialog).getByRole('button', {
        name: splitPaymentCopy.removeLine(n),
      }),
    );
  }
  expect(within(dialog).queryByTestId('split-summary')).toBeNull();

  await waitFor(() => expect(within(dialog).getByLabelText('Método')).not.toBeDisabled());
  await user.type(document.getElementById('rp-amount') as HTMLElement, '1000');
  mockedRecord.mockResolvedValue({
    ...savedSplit().payments[0],
    splitId: null,
    splitLine: null,
  });
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  await waitFor(() => expect(mockedRecord).toHaveBeenCalledTimes(1));
  expect(mockedSplit).not.toHaveBeenCalled();
});

it('si el total supera lo pendiente, pide confirmar el saldo a favor antes de enviarlo', async () => {
  (getPlanBalance as jest.Mock).mockResolvedValue(copBalance(250000));
  const { dialog } = renderModal();
  const { user, second } = await fillTwoLines(dialog);
  await user.selectOptions(within(second).getByLabelText('Método'), 'pm-cash');

  const summary = within(dialog).getByTestId('split-summary');
  await waitFor(() => expect(text(summary.textContent)).toContain('Saldo a favor tras el cobroCOP 50.000,00'));
  expect(text(summary.textContent)).toContain('supera lo pendiente en COP 50.000,00');

  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  const confirm = within(summary).getByLabelText(splitPaymentCopy.confirmCredit);
  await waitFor(() => expect(confirm).toHaveAttribute('aria-invalid', 'true'));
  expect(mockedSplit).not.toHaveBeenCalled();

  await user.click(confirm);
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  await waitFor(() => expect(mockedSplit).toHaveBeenCalledTimes(1));
  expect(mockedSplit.mock.calls[0][2]).toMatchObject({
    confirmCreditBalance: true,
  });
});

it('el 409 de la API por el saldo a favor también pide la confirmación, y el reintento usa la misma clave', async () => {
  (getPlanBalance as jest.Mock).mockRejectedValue(new Error('boom'));
  mockedSplit.mockRejectedValueOnce(
    new ApiError(409, 'El total del cobro supera lo pendiente del plan.', {
      code: 'SPLIT_PAYMENT_EXCEEDS_BALANCE',
    }),
  );
  const { dialog } = renderModal();
  const { user, second } = await fillTwoLines(dialog);
  await user.selectOptions(within(second).getByLabelText('Método'), 'pm-cash');

  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  const confirm = await within(dialog).findByLabelText(splitPaymentCopy.confirmCredit);
  expect(within(dialog).getByText(splitPaymentCopy.confirmCreditMissing)).toBeInTheDocument();
  await user.click(confirm);
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  await waitFor(() => expect(mockedSplit).toHaveBeenCalledTimes(2));
  expect(mockedSplit.mock.calls[1][3]).toBe(mockedSplit.mock.calls[0][3]);
});

it('la referencia repetida de la 2.ª forma de pago pide el motivo en ESA línea, con el foco', async () => {
  mockedSplit.mockRejectedValueOnce(
    new ApiError(409, 'Esta referencia ya se usó con este medio de pago…', {
      code: 'PAYMENT_REFERENCE_DUPLICATE',
      line: 1,
    }),
  );
  const { dialog } = renderModal();
  const { user, second } = await fillTwoLines(dialog);
  await user.selectOptions(within(second).getByLabelText('Método'), 'pm-transfer');
  await user.type(within(second).getByLabelText('Referencia (obligatoria)'), 'TR-9');

  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  const reason = await within(second).findByLabelText(paymentMethodFieldsCopy.duplicateReason);
  await waitFor(() => expect(reason).toHaveFocus());
  // La primera forma de pago no pide motivo.
  expect(document.getElementById('rp-duplicate-reason')).toBeNull();

  await user.type(reason, 'Otro pago del mismo día');
  await user.click(
    within(dialog).getByRole('button', {
      name: paymentMethodFieldsCopy.duplicateSubmit,
    }),
  );
  await waitFor(() => expect(mockedSplit).toHaveBeenCalledTimes(2));
  expect(mockedSplit.mock.calls[1][2].lines[1]).toEqual({
    amount: 50,
    currency: 'USD',
    paymentMethodId: 'pm-transfer',
    reference: 'TR-9',
    duplicateReferenceReason: 'Otro pago del mismo día',
  });
  expect(mockedSplit.mock.calls[1][3]).toBe(mockedSplit.mock.calls[0][3]);
});

it('un error de la API sale en el resumen del formulario (escalón 4) y no cierra', async () => {
  mockedSplit.mockRejectedValueOnce(new ApiError(400, 'bad'));
  const { dialog, onRecorded } = renderModal();
  const { user, second } = await fillTwoLines(dialog);
  await user.selectOptions(within(second).getByLabelText('Método'), 'pm-cash');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
  expect(onRecorded).not.toHaveBeenCalled();
});

it('FE-082: si los medios no cargan, el selector se sustituye por FieldError (escalón 2) con reintento en su sitio', async () => {
  mockedMethods.mockRejectedValueOnce(new Error('down'));
  const user = userEvent.setup();
  const { dialog } = renderModal();
  await within(dialog).findByLabelText('Plan');
  const status = await within(dialog).findByText(paymentMethodFieldsCopy.methodsError);
  expect(status.closest('[role="status"]')).not.toBeNull();
  // La etiqueta «Método» sigue teniendo destino: el reintento.
  const retry = within(dialog).getByLabelText('Método');
  expect(retry.tagName).toBe('BUTTON');
  expect(retry).toHaveAttribute('id', 'rp-method');
  expect(within(dialog).queryByRole('alert')).toBeNull();

  await user.click(retry);
  await waitFor(() => expect(within(dialog).getByLabelText('Método').tagName).toBe('SELECT'));
  expect(mockedMethods).toHaveBeenCalledTimes(2);
});
