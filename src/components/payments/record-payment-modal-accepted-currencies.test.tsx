import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordPaymentModal } from './record-payment-modal';
import { splitPaymentCopy } from './split-payment-lines';
import { listBillablePlans, type BillablePlan } from '@/lib/payments/billable-plans-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import type { ExchangeHeader } from '@/lib/exchange/exchange-header-api';
import { ExchangeHeaderTestProvider } from '@/components/exchange/exchange-header-context';

// DX-584: con monedas aceptadas, el selector de moneda del cobro (abono
// suelto, cobro dividido y vuelto) solo ofrece esas, en el orden de la clínica.

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
    source: 'AUTOMATIC',
    rates: { VES: 36.5, EUR: 0.92 },
    rateDate: '2026-10-01',
  }),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$' },
    { code: 'VES', name: 'Bolívar', symbol: 'Bs.' },
  ]),
}));
const method = (id: string, name: string, kind: 'CASH' | 'DIGITAL') => ({
  id,
  name,
  kind,
  active: true,
  requiresReference: false,
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

function header(acceptedCurrencies: string[]): ExchangeHeader {
  return {
    visible: false,
    reference: 'VES',
    referenceLabel: null,
    rates: [],
    acceptedCurrencies,
    updatedAt: '2026-10-01T12:00:00.000Z',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (listLocations as jest.Mock).mockResolvedValue([clinicLocation()]);
  (listBillablePlans as jest.Mock).mockResolvedValue([plan]);
  methodsApi.listPaymentMethods.mockResolvedValue([method('pm-cash', 'Efectivo', 'CASH')]);
});

function renderModal(accepted: string[] | null) {
  const modal = (
    <RecordPaymentModal open onOpenChange={jest.fn()} token="tok" patientId="pat-1" onRecorded={jest.fn()} />
  );
  render(
    accepted === null ? (
      modal
    ) : (
      <ExchangeHeaderTestProvider value={{ status: 'ready', header: header(accepted) }}>
        {modal}
      </ExchangeHeaderTestProvider>
    ),
  );
  return screen.getByRole('dialog', { name: 'Registrar abono' });
}

const codes = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value);

async function waitForCurrencies(select: HTMLElement, expected: string[]) {
  await waitFor(() => expect(codes(select)).toEqual(expected));
}

it('abono suelto, vuelto y cobro dividido: solo las monedas aceptadas, en el orden de la clínica', async () => {
  const user = userEvent.setup();
  const dialog = renderModal(['VES', 'USD']);
  await user.type(await within(dialog).findByLabelText('Importe'), '45');
  const currency = document.getElementById('rp-currency') as HTMLSelectElement;
  await waitForCurrencies(currency, ['VES', 'USD']);
  // El plan es en USD, que se acepta: no cambia.
  expect(currency).toHaveValue('USD');

  // El vuelto en efectivo.
  await within(dialog).findByRole('option', { name: 'Efectivo' });
  await user.selectOptions(within(dialog).getByLabelText('Método'), 'Efectivo');
  await user.type(within(dialog).getByLabelText('Recibido'), '50');
  const block = await within(dialog).findByRole('group', { name: 'Vuelto 1' });
  await waitForCurrencies(within(block).getByLabelText('Moneda'), ['VES', 'USD']);

  // Otra forma de pago.
  await user.clear(within(dialog).getByLabelText('Recibido'));
  await user.click(within(dialog).getByRole('button', { name: splitPaymentCopy.addLine }));
  const second = within(dialog).getByTestId('split-line-2');
  await waitForCurrencies(within(second).getByLabelText('Moneda'), ['VES', 'USD']);
});

it('si la moneda del plan no se acepta, el abono pasa a la primera aceptada', async () => {
  const dialog = renderModal(['VES']);
  await within(dialog).findByLabelText('Importe');
  const currency = document.getElementById('rp-currency') as HTMLSelectElement;
  await waitFor(() => expect(currency).toHaveValue('VES'));
  await waitForCurrencies(currency, ['VES']);
});

it('sin monedas aceptadas (o sin saberlas) se ofrece cualquier moneda, como antes', async () => {
  const dialog = renderModal([]);
  await within(dialog).findByLabelText('Importe');
  await waitForCurrencies(document.getElementById('rp-currency') as HTMLSelectElement, ['EUR', 'USD', 'VES']);
});

it('fuera del proveedor (pantallas sueltas) no filtra', async () => {
  const dialog = renderModal(null);
  await within(dialog).findByLabelText('Importe');
  await waitForCurrencies(document.getElementById('rp-currency') as HTMLSelectElement, ['EUR', 'USD', 'VES']);
});
