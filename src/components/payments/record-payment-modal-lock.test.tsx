import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordPaymentModal, recordPaymentCopy } from './record-payment-modal';
import { ApiError } from '@/lib/api/client';
import {
  getPlanBalance,
  recordOpeningBalancePayment,
  recordPayment,
  type PlanBalance,
} from '@/lib/payments/payments-api';
import { listBillablePlans, type BillablePlan } from '@/lib/payments/billable-plans-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { getExchangeRates } from '@/lib/exchange/exchange-api';
import { getPeriodLock } from '@/lib/financial-lock/financial-lock-api';
import { periodLockCopy } from './period-lock-field';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { addDaysIso } from '@/lib/locations/provider-schedule';

/** Escribe un día en el `DatePicker` por segmentos (dd/mm/aaaa, locale de la sede). */
async function typePaymentDate(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, iso: string) {
  const [y, m, d] = iso.split('-');
  const [day] = within(within(dialog).getByRole('group', { name: 'Fecha de pago' })).getAllByRole('spinbutton');
  await user.click(day);
  await user.keyboard(`${d}${m}${y}`);
}

jest.mock('../../lib/payments/payments-api', () => ({
  recordPayment: jest.fn(),
  recordOpeningBalancePayment: jest.fn(),
  getPlanBalance: jest.fn(),
}));
jest.mock('../../lib/payments/billable-plans-api', () => ({
  ...jest.requireActual('../../lib/payments/billable-plans-api'),
  listBillablePlans: jest.fn(),
}));
// DX-091: el cierre contable vigente en la sede.
jest.mock('../../lib/financial-lock/financial-lock-api', () => ({
  ...jest.requireActual('../../lib/financial-lock/financial-lock-api'),
  getPeriodLock: jest.fn(),
}));
jest.mock('../../lib/exchange/exchange-api', () => ({
  getExchangeRates: jest.fn(),
}));
// DX-377: medios de pago activos de la clínica.
jest.mock('../../lib/payments/payment-methods-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-methods-api'),
  listPaymentMethods: jest.fn().mockResolvedValue([
    {
      id: 'pm-transfer',
      name: 'Transferencia',
      kind: 'TRANSFER',
      active: true,
      requiresReference: false,
      proofPolicy: 'NONE' as const,
      legacyMethod: 'TRANSFER',
      adjustments: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'pm-mobile',
      name: 'Pago móvil',
      kind: 'DIGITAL',
      active: true,
      requiresReference: true,
      proofPolicy: 'NONE' as const,
      legacyMethod: null,
      adjustments: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    // DX-516: un medio con un impuesto del 3 % y un descuento fijo en USD.
    {
      id: 'pm-cash-usd',
      name: 'Efectivo divisas',
      kind: 'CASH',
      active: true,
      requiresReference: false,
      proofPolicy: 'NONE' as const,
      legacyMethod: null,
      adjustments: [
        {
          id: 'adj-tax',
          paymentMethodId: 'pm-cash-usd',
          type: 'TAX',
          label: 'Impuesto 3 %',
          calculation: 'PERCENT',
          percent: 3,
          fixedAmount: null,
          fixedCurrency: null,
          active: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'adj-off',
          paymentMethodId: 'pm-cash-usd',
          type: 'SURCHARGE',
          label: 'Apagado',
          calculation: 'PERCENT',
          percent: 50,
          fixedAmount: null,
          fixedCurrency: null,
          active: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'EUR', name: 'Euro', symbol: '€', roundingDigits: 2 },
    { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$', roundingDigits: 2 },
    { code: 'VES', name: 'Bolívar', symbol: 'Bs' },
  ]),
}));

const mockedRecord = recordPayment as jest.MockedFunction<typeof recordPayment>;
const mockedRecordOpening = recordOpeningBalancePayment as jest.MockedFunction<
  typeof recordOpeningBalancePayment
>;
const mockedList = listBillablePlans as jest.MockedFunction<typeof listBillablePlans>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedRates = getExchangeRates as jest.MockedFunction<typeof getExchangeRates>;
const mockedBalance = getPlanBalance as jest.MockedFunction<typeof getPlanBalance>;

/** El saldo del plan USD como lo da `GET /treatment-plans/:id/balance` (abonos convertidos). */
function usdBalance(overrides: Partial<PlanBalance> = {}): PlanBalance {
  return {
    planCurrency: 'USD',
    billable: 500,
    paid: 0,
    balance: 500,
    creditMovements: 0,
    paymentsCount: 0,
    paymentsWithoutRate: [],
    allocated: 0,
    unallocated: 0,
    unconvertedPaymentsCount: 0,
    rateProviderTimedOut: false,
    manualPaymentIds: [],
    items: [],
    ...overrides,
  };
}

const eurPlan: BillablePlan = {
  id: 'plan-eur',
  status: 'ACCEPTED',
  currency: 'EUR',
  createdAt: '2026-08-01T15:00:00.000Z',
  total: 3000000,
  paid: 1200000,
  paidOtherCurrencies: [],
  balance: 1800000,
  hasActivePaymentPlan: false,
  paymentsWithoutRate: [],
  rateProviderTimedOut: false,
};

function savedPayment(
  overrides: Partial<Awaited<ReturnType<typeof recordPayment>>> = {},
): Awaited<ReturnType<typeof recordPayment>> {
  return {
    id: 'pay-1',
    tenantId: 't-1',
    treatmentPlanId: 'plan-eur',
    openingBalanceId: null,
    patientId: 'pat-1',
    amount: 150000,
    currency: 'EUR',
    paidAt: '2026-10-01T00:00:00.000Z',
    paidOn: '2026-10-01',
    method: 'TRANSFER',
    paymentMethodId: null,
    paymentMethodName: null,
    reference: null,
    duplicateReferenceReason: null,
    externalInvoiceNumber: null,
    notes: null,
    splitId: null,
    splitLine: null,
    createdById: 'u-1',
    createdAt: '2026-10-16T12:00:00.000Z',
    updatedAt: '2026-10-16T12:00:00.000Z',
    receiptNumber: 'PRI-000001',
    exchangeRateCurrency: 'EUR',
    frozenRate: null,
    rateUsed: null,
    exchangeRateStatus: 'NOT_NEEDED',
    adjustments: [],
    collectedAmount: 150000,
    hasProof: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockedRecord.mockReset();
  mockedRecordOpening.mockReset();
  mockedList.mockReset();
  mockedLocations.mockReset();
  mockedLocations.mockResolvedValue([clinicLocation()]);
  mockedRates.mockReset();
  mockedRates.mockImplementation((_token, date) =>
    Promise.resolve({
      base: 'USD',
      source: 'AUTOMATIC',
      rates: { EUR: 4000, VES: 36.5 },
      rateDate: date,
    }),
  );
  mockedBalance.mockReset();
  mockedBalance.mockResolvedValue(usdBalance());
});

function renderModal() {
  const onRecorded = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <RecordPaymentModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      patientId="pat-1"
      onRecorded={onRecorded}
    />,
  );
  return { onRecorded, onOpenChange };
}

const mockedLock = getPeriodLock as jest.MockedFunction<typeof getPeriodLock>;
// La sede del fixture: Caracas. Cerrado hasta ayer en la sede.
const TODAY = sedeToday('America/Caracas');
const YESTERDAY = addDaysIso(TODAY, -1);
const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/');

beforeEach(() => {
  mockedLock.mockReset();
  mockedLock.mockResolvedValue({ lockedThrough: YESTERDAY, canOverride: false });
});

describe('DX-091 · cierre contable en «Registrar abono»', () => {
  it('el selector de fecha no ofrece días cerrados y explica por qué', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue([eurPlan]);
    renderModal();
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByLabelText('Plan');
    await within(dialog).findByText(periodLockCopy.hint(ddmmyyyy(YESTERDAY)));
    await user.click(within(within(dialog).getByRole('group', { name: 'Fecha de pago' })).getByRole('button'));

    // Con el cierre hasta ayer, hoy es el primer día que se puede elegir
    // (react-aria lo marca desde `minValue`; sin `min` no sale).
    const first = await screen.findByRole('button', { name: /Primera fecha disponible/ });
    const cells = Array.from(document.querySelectorAll('[role="grid"] [role="gridcell"]'));
    const todayCell = first.closest('[role="gridcell"]') as Element;
    expect(todayCell).not.toHaveAttribute('aria-disabled', 'true');
    expect(cells[cells.indexOf(todayCell) - 1]).toHaveAttribute('aria-disabled', 'true');
  });

  it('un día cerrado tecleado se dice junto al campo, sin llamar a la API', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue([eurPlan]);
    renderModal();
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByLabelText('Plan');
    await within(dialog).findByText(periodLockCopy.hint(ddmmyyyy(YESTERDAY)));
    await user.type(within(dialog).getByLabelText('Importe'), '100');
    await typePaymentDate(user, dialog, YESTERDAY);
    await user.click(within(dialog).getByRole('button', { name: recordPaymentCopy.submit }));

    expect(await within(dialog).findByText(periodLockCopy.lockedDate(ddmmyyyy(YESTERDAY)))).toBeInTheDocument();
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it('el 409 PERIOD_LOCKED de la API se enseña en español', async () => {
    const user = userEvent.setup();
    // Sin cierre leído (p. ej. cambió entre abrir y enviar): decide la API.
    mockedLock.mockResolvedValue({ lockedThrough: null, canOverride: false });
    mockedList.mockResolvedValue([eurPlan]);
    const message =
      'La fecha del abono cae en un período contable cerrado. Elige una fecha posterior al cierre o pide a administración que lo revise.';
    mockedRecord.mockRejectedValue(new ApiError(409, message, { code: 'PERIOD_LOCKED', lockedThrough: YESTERDAY }));
    renderModal();
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByLabelText('Plan');
    await user.type(within(dialog).getByLabelText('Importe'), '100');
    await user.click(within(dialog).getByRole('button', { name: recordPaymentCopy.submit }));
    // El mensaje de la API y el día del cierre con el formato de la sede.
    expect(
      await within(dialog).findByText(`${message} Cerrado hasta el ${ddmmyyyy(YESTERDAY)}, inclusive.`),
    ).toBeInTheDocument();
  });

  it('el ADMIN con la exención elige un día cerrado e indica el motivo, que viaja a la API', async () => {
    const user = userEvent.setup();
    mockedLock.mockResolvedValue({ lockedThrough: YESTERDAY, canOverride: true });
    mockedList.mockResolvedValue([eurPlan]);
    mockedRecord.mockResolvedValue(savedPayment());
    renderModal();
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByLabelText('Plan');
    await user.type(within(dialog).getByLabelText('Importe'), '100');
    await typePaymentDate(user, dialog, YESTERDAY);
    const reason = await within(dialog).findByLabelText(periodLockCopy.reasonLabel);

    await user.click(within(dialog).getByRole('button', { name: recordPaymentCopy.submit }));
    expect(await within(dialog).findByText(periodLockCopy.reasonMissing)).toBeInTheDocument();
    expect(mockedRecord).not.toHaveBeenCalled();

    await user.type(reason, 'Abono de ayer que faltaba');
    await user.click(within(dialog).getByRole('button', { name: recordPaymentCopy.submit }));
    await waitFor(() => expect(mockedRecord).toHaveBeenCalled());
    expect(mockedRecord.mock.calls[0][2]).toMatchObject({
      paidAt: YESTERDAY,
      lockOverrideReason: 'Abono de ayer que faltaba',
    });
  });
});
