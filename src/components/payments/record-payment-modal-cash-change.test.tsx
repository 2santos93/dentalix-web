import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordPaymentModal } from './record-payment-modal';
import { ApiError } from '@/lib/api/client';
import { recordPayment } from '@/lib/payments/payments-api';
import { listBillablePlans, type BillablePlan } from '@/lib/payments/billable-plans-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';

// DX-570: «Recibido» y el vuelto en «Registrar abono»: 45 USD cobrados con 50
// y 5 USD devueltos en bolívares por un medio digital que pide referencia.

jest.mock('../../lib/payments/payments-api', () => ({
  ...jest.requireActual('../../lib/payments/payments-api'),
  recordPayment: jest.fn(),
  recordOpeningBalancePayment: jest.fn(),
  recordSplitPayment: jest.fn(),
}));
jest.mock('../../lib/payments/billable-plans-api', () => ({
  ...jest.requireActual('../../lib/payments/billable-plans-api'),
  listBillablePlans: jest.fn(),
}));
jest.mock('../../lib/exchange/exchange-api', () => ({
  getExchangeRates: jest.fn().mockResolvedValue({
    base: 'USD',
    source: 'MANUAL',
    rates: { VES: 36.5 },
    rateDate: '2026-10-01',
  }),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$', roundingDigits: 2 },
    { code: 'VES', name: 'Bolívar', symbol: 'Bs.', roundingDigits: 2 },
  ]),
}));
const method = (id: string, name: string, kind: 'CASH' | 'DIGITAL', requiresReference = false) => ({
  id,
  name,
  kind,
  active: true,
  requiresReference,
  proofPolicy: 'NONE' as const,
  legacyMethod: kind === 'CASH' ? ('CASH' as const) : null,
  adjustments: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});
jest.mock('../../lib/payments/payment-methods-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-methods-api'),
  listPaymentMethods: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const methodsApi = require('../../lib/payments/payment-methods-api') as { listPaymentMethods: jest.Mock };

const mockedRecord = recordPayment as jest.MockedFunction<typeof recordPayment>;
const mockedList = listBillablePlans as jest.MockedFunction<typeof listBillablePlans>;

const plan: BillablePlan = {
  id: 'plan-usd',
  status: 'ACCEPTED',
  currency: 'USD',
  createdAt: '2026-08-01T15:00:00.000Z',
  total: 500,
  paid: 0,
  paidOtherCurrencies: [],
  balance: 500,
  hasActivePaymentPlan: false,
  paymentsWithoutRate: [],
  rateProviderTimedOut: false,
};

function saved(cashChange: unknown) {
  return {
    id: 'pay-1',
    tenantId: 't-1',
    treatmentPlanId: 'plan-usd',
    openingBalanceId: null,
    patientId: 'pat-1',
    amount: 45,
    currency: 'USD',
    paidAt: '2026-10-01T16:00:00.000Z',
    paidOn: '2026-10-01',
    method: 'CASH' as const,
    paymentMethodId: 'pm-cash',
    paymentMethodName: 'Efectivo',
    reference: null,
    duplicateReferenceReason: null,
    externalInvoiceNumber: null,
    notes: null,
    splitId: null,
    splitLine: null,
    createdById: 'u-1',
    createdAt: '2026-10-01T16:00:00.000Z',
    updatedAt: '2026-10-01T16:00:00.000Z',
    receiptNumber: 'PRI-000001',
    exchangeRateCurrency: 'USD',
    frozenRate: null,
    rateUsed: null,
    exchangeRateStatus: 'NOT_NEEDED' as const,
    adjustments: [],
    collectedAmount: 45,
    hasProof: false,
    cashChange,
  } as Awaited<ReturnType<typeof recordPayment>>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (listLocations as jest.Mock).mockResolvedValue([clinicLocation()]);
  mockedList.mockResolvedValue([plan]);
  methodsApi.listPaymentMethods.mockResolvedValue([
    method('pm-cash', 'Efectivo', 'CASH'),
    method('pm-mobile', 'Pago móvil', 'DIGITAL', true),
  ]);
});

async function openCash() {
  const user = userEvent.setup();
  const onRecorded = jest.fn();
  const view = render(
    <RecordPaymentModal open onOpenChange={jest.fn()} token="tok" patientId="pat-1" onRecorded={onRecorded} />,
  );
  const dialog = screen.getByRole('dialog', { name: 'Registrar abono' });
  await user.type(await within(dialog).findByLabelText('Importe'), '45');
  await within(dialog).findByRole('option', { name: 'Efectivo' });
  await user.selectOptions(within(dialog).getByLabelText('Método'), 'Efectivo');
  return { user, dialog, onRecorded, view };
}

it('sin medio de efectivo no hay «Recibido»; con efectivo vacío, el cobro es el de siempre', async () => {
  const { user, dialog } = await openCash();
  expect(within(dialog).getByLabelText('Recibido')).toBeInTheDocument();
  mockedRecord.mockResolvedValue(saved(null));
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  await waitFor(() => expect(mockedRecord).toHaveBeenCalled());
  const body = mockedRecord.mock.calls[0][2];
  expect(body).not.toHaveProperty('tendered');
  expect(body).not.toHaveProperty('change');
  await user.selectOptions(within(dialog).getByLabelText('Método'), 'Pago móvil');
  expect(within(dialog).queryByLabelText('Recibido')).not.toBeInTheDocument();
});

it('50 recibidos: propone 5 USD de vuelto; en VES por pago móvil calcula 182,50 y su equivalente, y lo manda en un solo paso', async () => {
  const { user, dialog, onRecorded } = await openCash();
  await user.type(within(dialog).getByLabelText('Recibido'), '50');
  const block = await within(dialog).findByRole('group', { name: 'Vuelto 1' });
  expect(within(dialog).getByText('Por devolver').nextSibling).toHaveTextContent('5,00');
  await waitFor(() => expect(within(block).getByLabelText('Importe')).toHaveValue('5.00'));

  await user.selectOptions(within(block).getByLabelText('Entregado por'), 'Pago móvil');
  await user.selectOptions(within(block).getByLabelText('Moneda'), 'VES');
  await waitFor(() => expect(within(block).getByLabelText('Importe')).toHaveValue('182.50'));
  expect(await within(block).findByText(/Equivale a .*5,00.*1 USD = .*36,50/)).toBeInTheDocument();

  // La referencia que pide el medio, junto a su campo.
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  expect(await within(block).findByText('Este medio pide la referencia de la entrega.')).toBeInTheDocument();
  expect(mockedRecord).not.toHaveBeenCalled();

  await user.type(within(block).getByLabelText('Referencia (obligatoria)'), '0412-5551234');
  mockedRecord.mockResolvedValue(
    saved({
      tendered: 50,
      remainderToCredit: 0,
      lines: [
        {
          line: 1,
          paymentMethodId: 'pm-mobile',
          paymentMethodName: 'Pago móvil',
          method: 'TRANSFER',
          currency: 'VES',
          amount: 182.5,
          reference: '0412-5551234',
          equivalentAmount: 5,
          rate: { fromPerBase: 36.5, toPerBase: 1, source: 'MANUAL', date: '2026-10-01' },
        },
      ],
    }),
  );
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  await waitFor(() => expect(mockedRecord).toHaveBeenCalled());
  expect(mockedRecord.mock.calls[0][2]).toMatchObject({
    amount: 45,
    currency: 'USD',
    tendered: 50,
    change: [{ paymentMethodId: 'pm-mobile', currency: 'VES', amount: 182.5, reference: '0412-5551234' }],
  });
  expect(mockedRecord.mock.calls[0][2]).not.toHaveProperty('changeRemainderToCredit');
  expect(onRecorded.mock.calls[0][0]).toMatch(/Recibido .*50,00.*vuelto .*182,50.*Pago móvil/);
});

it('diferencia sin devolver: aviso con confirmación; sin ella no se envía', async () => {
  const { user, dialog } = await openCash();
  await user.type(within(dialog).getByLabelText('Recibido'), '50');
  const block = await within(dialog).findByRole('group', { name: 'Vuelto 1' });
  const amount = within(block).getByLabelText('Importe');
  await user.clear(amount);
  await user.type(amount, '3');
  expect(await within(dialog).findByText(/Quedan .*2,00.* sin devolver/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  expect(
    await within(dialog).findByText('Confirma que la diferencia se suma al abono, o completa el vuelto.'),
  ).toBeInTheDocument();
  expect(mockedRecord).not.toHaveBeenCalled();

  await user.click(within(dialog).getByRole('checkbox', { name: /Sumar .*2,00.* al abono/ }));
  mockedRecord.mockResolvedValue(saved({ tendered: 50, remainderToCredit: 2, lines: [] }));
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  await waitFor(() => expect(mockedRecord).toHaveBeenCalled());
  expect(mockedRecord.mock.calls[0][2]).toMatchObject({ tendered: 50, changeRemainderToCredit: true });
});

it('vuelto mayor que lo que hay que devolver: error en el modal y no se envía', async () => {
  const { user, dialog } = await openCash();
  await user.type(within(dialog).getByLabelText('Recibido'), '50');
  const block = await within(dialog).findByRole('group', { name: 'Vuelto 1' });
  const amount = within(block).getByLabelText('Importe');
  await user.clear(amount);
  await user.type(amount, '6');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  expect(await within(dialog).findByText(/El vuelto .*6,00.* supera lo que hay que devolver/)).toBeInTheDocument();
  expect(mockedRecord).not.toHaveBeenCalled();
});

it('recibido menor que lo cobrado: error junto a «Recibido»', async () => {
  const { user, dialog } = await openCash();
  await user.type(within(dialog).getByLabelText('Recibido'), '40');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  expect(await within(dialog).findByText(/Lo recibido no cubre lo cobrado/)).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Recibido')).toHaveAttribute('aria-invalid', 'true');
  expect(mockedRecord).not.toHaveBeenCalled();
});

it('si la API ve una diferencia sin devolver, el aviso queda en el propio modal', async () => {
  const { user, dialog } = await openCash();
  await user.type(within(dialog).getByLabelText('Recibido'), '50');
  await within(dialog).findByRole('group', { name: 'Vuelto 1' });
  mockedRecord.mockRejectedValue(
    new ApiError(422, 'Quedan 0.01 USD sin devolver. Completa el vuelto o confirma que se suman al abono.', {
      code: 'CASH_CHANGE_REMAINDER',
    }),
  );
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  expect(await within(dialog).findByText(/Quedan 0.01 USD sin devolver/)).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Registrar abono' })).toBeInTheDocument();
});
