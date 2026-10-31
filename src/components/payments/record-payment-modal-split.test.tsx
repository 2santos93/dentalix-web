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
    creditMovements: 0,
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

// Revisión DX-390 (tech lead).
it('cada forma de pago añadida es un grupo con nombre; añadir lleva el foco a su importe y quitar, a «Añadir otra forma de pago»', async () => {
  const user = userEvent.setup();
  const { dialog } = renderModal();
  await within(dialog).findByLabelText('Plan');
  await user.click(within(dialog).getByRole('button', { name: splitPaymentCopy.addLine }));
  const group = within(dialog).getByRole('group', { name: splitPaymentCopy.lineTitle(2) });
  await waitFor(() => expect(within(group).getByLabelText('Importe')).toHaveFocus());

  await user.click(within(dialog).getByRole('button', { name: splitPaymentCopy.removeLine(2) }));
  await waitFor(() =>
    expect(within(dialog).getByRole('button', { name: splitPaymentCopy.addLine })).toHaveFocus(),
  );
});

it('el 409 de «lo pendiente cambió» (otro abono a la vez) sale en el resumen y vuelve a leer el saldo del plan', async () => {
  mockedSplit.mockRejectedValueOnce(
    new ApiError(
      409,
      'Lo pendiente del plan cambió mientras se registraba el cobro (entró otro abono). No se registró nada: revisa el total y vuelve a intentarlo.',
      { code: 'SPLIT_PAYMENT_BALANCE_CHANGED' },
    ),
  );
  const { dialog, onRecorded } = renderModal();
  const { user, second } = await fillTwoLines(dialog);
  await user.selectOptions(within(second).getByLabelText('Método'), 'pm-cash');
  await waitFor(() => expect(getPlanBalance).toHaveBeenCalledTimes(1));

  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  const alert = await within(dialog).findByRole('alert');
  expect(alert).toHaveTextContent('Lo pendiente del plan cambió');
  await waitFor(() => expect(getPlanBalance).toHaveBeenCalledTimes(2));
  expect(onRecorded).not.toHaveBeenCalled();
});

// Correcciones de la QA en navegador (DX-390).
describe('correcciones de QA (DX-390)', () => {
  it('B2: con saldo a favor previo, el excedente es solo lo que este cobro supera lo pendiente', async () => {
    (getPlanBalance as jest.Mock).mockResolvedValue(copBalance(-15000));
    const { dialog } = renderModal();
    const { user, second } = await fillTwoLines(dialog);
    await user.selectOptions(within(second).getByLabelText('Método'), 'pm-cash');

    const summary = within(dialog).getByTestId('split-summary');
    await waitFor(() => expect(text(summary.textContent)).toContain('Total del cobroCOP 300.000,00'));
    expect(text(summary.textContent)).toContain('Pendiente del planCOP 0,00');
    // El saldo a favor tras el cobro sí suma el previo; el excedente, no.
    expect(text(summary.textContent)).toContain('Saldo a favor tras el cobroCOP 315.000,00');
    expect(text(summary.textContent)).toContain('supera lo pendiente en COP 300.000,00');
  });

  it('B4: mientras se envía, también la primera forma de pago queda bloqueada', async () => {
    let fail: (err: unknown) => void = () => undefined;
    mockedSplit.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    const { dialog } = renderModal();
    const { user, second } = await fillTwoLines(dialog);
    await user.selectOptions(document.getElementById('rp-method') as HTMLElement, 'pm-transfer');
    await user.type(document.getElementById('rp-reference') as HTMLElement, 'TR-1');
    await user.selectOptions(within(second).getByLabelText('Método'), 'pm-transfer');
    await user.type(within(second).getByLabelText('Referencia (obligatoria)'), 'TR-2');

    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(mockedSplit).toHaveBeenCalledTimes(1));
    for (const id of ['rp-amount', 'rp-currency', 'rp-method', 'rp-reference', 'rp-line-2-reference']) {
      expect(document.getElementById(id)).toBeDisabled();
    }
    // La fecha es un `DatePicker` por segmentos: sus segmentos quedan inertes.
    for (const segment of within(within(dialog).getByRole('group', { name: 'Fecha de pago' })).getAllByRole('spinbutton')) {
      expect(segment).toHaveAttribute('aria-disabled', 'true');
    }
    fail(new ApiError(500, 'boom'));
    await within(dialog).findByRole('alert');
    expect(document.getElementById('rp-amount')).not.toBeDisabled();
  });

  it('B4: tras un fallo, el reintento sin cambios reusa la clave y con datos cambiados estrena otra', async () => {
    mockedSplit.mockRejectedValueOnce(new ApiError(500, 'boom')).mockRejectedValueOnce(new ApiError(500, 'boom'));
    const { dialog } = renderModal();
    const { user, second } = await fillTwoLines(dialog);
    await user.selectOptions(within(second).getByLabelText('Método'), 'pm-cash');
    const submit = () => user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

    await submit();
    await within(dialog).findByRole('alert');
    await submit();
    await waitFor(() => expect(mockedSplit).toHaveBeenCalledTimes(2));
    expect(mockedSplit.mock.calls[1][3]).toBe(mockedSplit.mock.calls[0][3]);

    const amount = document.getElementById('rp-amount') as HTMLElement;
    await user.clear(amount);
    await user.type(amount, '90000');
    await submit();
    await waitFor(() => expect(mockedSplit).toHaveBeenCalledTimes(3));
    expect(mockedSplit.mock.calls[2][2].lines[0].amount).toBe(90000);
    expect(mockedSplit.mock.calls[2][3]).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockedSplit.mock.calls[2][3]).not.toBe(mockedSplit.mock.calls[0][3]);
  });

  it('B3: el importe vacío o 0 lleva el foco a su campo (la primera o la añadida)', async () => {
    const { dialog } = renderModal();
    const { user, second } = await fillTwoLines(dialog);
    await user.selectOptions(within(second).getByLabelText('Método'), 'pm-cash');
    const secondAmount = within(second).getByLabelText('Importe');
    await user.clear(secondAmount);
    await user.type(secondAmount, '0');

    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(secondAmount).toHaveAttribute('aria-invalid', 'true'));
    expect(secondAmount).toHaveFocus();

    const first = document.getElementById('rp-amount') as HTMLElement;
    await user.clear(first);
    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(first).toHaveAttribute('aria-invalid', 'true'));
    expect(first).toHaveFocus();
    expect(mockedSplit).not.toHaveBeenCalled();
  });

  it('B3: el mismo medio y la misma referencia en dos formas de pago se marca en la segunda, con el foco', async () => {
    const { dialog } = renderModal();
    const { user, second } = await fillTwoLines(dialog);
    await user.selectOptions(document.getElementById('rp-method') as HTMLElement, 'pm-transfer');
    await user.type(document.getElementById('rp-reference') as HTMLElement, 'TR-9');
    await user.selectOptions(within(second).getByLabelText('Método'), 'pm-transfer');
    const reference = within(second).getByLabelText('Referencia (obligatoria)');
    await user.type(reference, 'tr 9');

    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(reference).toHaveAttribute('aria-invalid', 'true'));
    expect(reference).toHaveFocus();
    expect(within(second).getByText(splitPaymentCopy.sameReference)).toBeInTheDocument();
    expect(mockedSplit).not.toHaveBeenCalled();
  });

  it('B3: «Confirma el saldo a favor» lleva el foco a la casilla', async () => {
    (getPlanBalance as jest.Mock).mockResolvedValue(copBalance(250000));
    const { dialog } = renderModal();
    const { user, second } = await fillTwoLines(dialog);
    await user.selectOptions(within(second).getByLabelText('Método'), 'pm-cash');
    const summary = within(dialog).getByTestId('split-summary');
    await waitFor(() => expect(text(summary.textContent)).toContain('supera lo pendiente'));

    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    const confirm = within(summary).getByLabelText(splitPaymentCopy.confirmCredit);
    await waitFor(() => expect(confirm).toHaveAttribute('aria-invalid', 'true'));
    expect(confirm).toHaveFocus();
  });

  it('B3: el 409 de saldo a favor de la API también lleva el foco a la casilla', async () => {
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
    await waitFor(() => expect(confirm).toHaveFocus());
  });

  it('B9: el lector de pantalla no dice «Calculando el total…» del pendiente cuando ya hay total', async () => {
    (getPlanBalance as jest.Mock).mockReturnValue(new Promise(() => undefined));
    const { dialog } = renderModal();
    const { user, second } = await fillTwoLines(dialog);
    await user.selectOptions(within(second).getByLabelText('Método'), 'pm-cash');
    const summary = within(dialog).getByTestId('split-summary');
    await waitFor(() => expect(text(summary.textContent)).toContain('Total del cobroCOP 300.000,00'));
    expect(within(summary).queryByText(splitPaymentCopy.loading)).toBeNull();
    expect(within(summary).getByText(splitPaymentCopy.loadingPending)).toBeInTheDocument();
  });

  it('B9: con más de una forma de pago, la primera es el grupo «Forma de pago 1»', async () => {
    const user = userEvent.setup();
    const { dialog } = renderModal();
    await within(dialog).findByLabelText('Plan');
    expect(within(dialog).queryByRole('group', { name: splitPaymentCopy.lineTitle(1) })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: splitPaymentCopy.addLine }));
    const first = within(dialog).getByRole('group', { name: splitPaymentCopy.lineTitle(1) });
    expect(within(first).getByLabelText('Importe')).toHaveAttribute('id', 'rp-amount');
    expect(within(first).getByLabelText('Método')).toHaveAttribute('id', 'rp-method');
  });

  // B9: el aviso usa el mismo helper que el resto del modal (`sedeMoney`, DX-386:
  // formato de la sede y SIEMPRE el código ISO, nunca «US$»), también sin total.
  it('B9: el aviso de éxito formatea cada importe con el formato de la sede y su código ISO', async () => {
    mockedSplit.mockResolvedValue({ ...savedSplit(), total: null });
    const { dialog, onRecorded } = renderModal();
    const { user, second } = await fillTwoLines(dialog);
    await user.selectOptions(within(second).getByLabelText('Método'), 'pm-cash');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
    expect(text(onRecorded.mock.calls[0][0])).toBe(
      'Cobro registrado: COP 100.000,00 + USD 50,00 en 2 formas de pago · 30/10/2026 · Plan del 01/08/2026 · recibo PRI-000007.',
    );
  });
});
