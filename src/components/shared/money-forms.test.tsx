import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentPromiseDialog } from '@/components/collections/payment-promise-dialog';
import { RecordPaymentModal } from '@/components/payments/record-payment-modal';
import { CloseCashSessionModal } from '@/components/cash-sessions/close-cash-session-modal';
import { CashAdjustmentModal } from '@/components/cash-sessions/cash-adjustment-modal';
import { OpenCashSessionModal } from '@/components/cash-sessions/open-cash-session-modal';
import { createPaymentPromise } from '@/lib/collections/collections-api';
import { recordPayment } from '@/lib/payments/payments-api';
import { listBillablePlans, type BillablePlan } from '@/lib/payments/billable-plans-api';
import { addCashAdjustment, closeCashSession, openCashSession } from '@/lib/cash-sessions/cash-sessions-api';
import { cashSessionFixture } from '@/lib/test/cash-session';
import { moneyInputCopy } from '@/lib/format/money';

/*
 * DX-241: el mismo texto da el mismo importe en los cinco formularios de
 * dinero del día a día — compromiso, abono, arqueo, ajuste y fondo de caja —
 * y lo ambiguo no llega a la API en ninguno.
 */

jest.mock('../../lib/collections/collections-api', () => ({ createPaymentPromise: jest.fn() }));
jest.mock('../../lib/payments/payments-api', () => ({ recordPayment: jest.fn() }));
jest.mock('../../lib/payments/billable-plans-api', () => ({
  ...jest.requireActual('../../lib/payments/billable-plans-api'),
  listBillablePlans: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/locations').clinicLocation()]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$' },
  ]),
}));
jest.mock('../../lib/cash-sessions/cash-sessions-api', () => ({
  ...jest.requireActual('../../lib/cash-sessions/cash-sessions-api'),
  closeCashSession: jest.fn(),
  addCashAdjustment: jest.fn(),
  openCashSession: jest.fn(),
}));

const mocked = {
  promise: createPaymentPromise as jest.MockedFunction<typeof createPaymentPromise>,
  payment: recordPayment as jest.MockedFunction<typeof recordPayment>,
  plans: listBillablePlans as jest.MockedFunction<typeof listBillablePlans>,
  close: closeCashSession as jest.MockedFunction<typeof closeCashSession>,
  adjust: addCashAdjustment as jest.MockedFunction<typeof addCashAdjustment>,
  open: openCashSession as jest.MockedFunction<typeof openCashSession>,
};

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function billablePlan(currency: string): BillablePlan {
  return {
    id: 'plan-1',
    status: 'ACCEPTED',
    currency,
    createdAt: '2026-08-01T15:00:00.000Z',
    total: 5_000_000,
    paid: 0,
    paidOtherCurrencies: [],
    balance: 5_000_000,
    hasActivePaymentPlan: false,
  };
}

interface FormDriver {
  /** Pinta el formulario con la moneda dada; devuelve el campo de importe. */
  render: (currency: string, expected: number) => Promise<HTMLElement>;
  /** Rellena lo demás que el formulario pide para poder enviar. */
  fillRest?: (user: ReturnType<typeof userEvent.setup>) => Promise<void>;
  submit: string;
  /** El importe que llegó a la API (o `undefined` si no se llamó). */
  sent: () => number | undefined;
}

const forms: Record<string, FormDriver> = {
  compromiso: {
    async render(currency) {
      render(
        <PaymentPromiseDialog
          open
          onOpenChange={() => undefined}
          token="tok"
          patient={{ id: 'pat-1', fullName: 'Ana Pérez' }}
          currencies={[currency]}
          onSaved={() => undefined}
        />,
      );
      return screen.getByLabelText('Importe');
    },
    fillRest: (user) => user.type(screen.getByLabelText('Pagará hasta el'), inDays(2)),
    submit: 'Guardar compromiso',
    sent: () => mocked.promise.mock.calls[0]?.[2].amount,
  },
  abono: {
    async render(currency) {
      mocked.plans.mockResolvedValue([billablePlan(currency)]);
      render(
        <RecordPaymentModal open onOpenChange={() => undefined} token="tok" patientId="pat-1" onRecorded={() => undefined} />,
      );
      await screen.findByLabelText('Plan');
      return screen.getByLabelText('Importe');
    },
    submit: 'Registrar abono',
    sent: () => mocked.payment.mock.calls[0]?.[2].amount,
  },
  arqueo: {
    async render(currency, expected) {
      const session = cashSessionFixture({
        floats: [{ currency, amount: 0 }],
        expected: [
          { currency, method: 'CASH', opening: 0, payments: expected, paymentsCount: 1, adjustments: 0, outflows: 0, outflowsCount: 0, expected },
        ],
      });
      render(
        <CloseCashSessionModal
          open
          onOpenChange={() => undefined}
          token="tok"
          session={session}
          defaultCurrency={currency}
          onClosed={() => undefined}
        />,
      );
      return screen.getByLabelText(`Contado en efectivo (${currency})`);
    },
    submit: 'Cerrar caja',
    sent: () => mocked.close.mock.calls[0]?.[2].counts[0]?.counted,
  },
  ajuste: {
    async render(currency) {
      render(
        <CashAdjustmentModal
          open
          onOpenChange={() => undefined}
          token="tok"
          sessionId="cs-1"
          defaultCurrency={currency}
          onCreated={() => undefined}
        />,
      );
      return screen.getByLabelText('Importe');
    },
    fillRest: (user) => user.type(screen.getByLabelText('Motivo'), 'Faltó registrar un abono'),
    submit: 'Registrar ajuste',
    sent: () => {
      const amount = mocked.adjust.mock.calls[0]?.[2].amount;
      return amount === undefined ? undefined : Math.abs(amount);
    },
  },
  fondo: {
    async render(currency) {
      render(
        <OpenCashSessionModal
          open
          onOpenChange={() => undefined}
          token="tok"
          sedeName="Sede principal"
          defaultCurrency={currency}
          onOpened={() => undefined}
        />,
      );
      return screen.getByLabelText('Importe del fondo 1');
    },
    submit: 'Abrir caja',
    sent: () => mocked.open.mock.calls[0]?.[1].floats[0]?.amount,
  },
};

const formNames = Object.keys(forms);

beforeEach(() => {
  mocked.promise.mockReset().mockResolvedValue({ id: 'pp-1' } as never);
  mocked.payment.mockReset().mockResolvedValue({
    treatmentPlanId: 'plan-1',
    amount: 1,
    currency: 'USD',
    paidOn: '2026-10-01',
  } as never);
  mocked.plans.mockReset();
  mocked.close.mockReset().mockResolvedValue({} as never);
  mocked.adjust.mockReset().mockResolvedValue({} as never);
  mocked.open.mockReset().mockResolvedValue({} as never);
});

const cases: [text: string, currency: string, expected: number][] = [
  ['150.50', 'USD', 150.5],
  ['150,50', 'USD', 150.5],
  ['1,500.25', 'USD', 1500.25],
  ['1.500.000,25', 'USD', 1_500_000.25],
  ['150.000', 'COP', 150_000],
  ['150,000', 'COP', 150_000],
];

describe.each(formNames)('%s (DX-241)', (name) => {
  const form = forms[name];

  it.each(cases)('«%s» %s → %d', async (text, currency, expected) => {
    const user = userEvent.setup();
    const input = await form.render(currency, expected);
    await user.type(input, text);
    await form.fillRest?.(user);
    await user.click(screen.getByRole('button', { name: form.submit }));
    await waitFor(() => expect(form.sent()).toBe(expected));
  });

  it('un importe ambiguo no llega a la API y el motivo queda junto al campo', async () => {
    const user = userEvent.setup();
    const input = await form.render('USD', 150);
    await user.type(input, '1.50.0');
    await form.fillRest?.(user);
    await user.click(screen.getByRole('button', { name: form.submit }));
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(' ');
    const messages = describedBy.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(messages).toMatch(/No sabemos leer «1\.50\.0»/);
    expect(form.sent()).toBeUndefined();
  });

  // Revisión DX-241 (2.ª pasada): «-50» (natural en un ajuste que resta) no
  // se envía y el campo pide el importe sin signo.
  it('un importe con signo no llega a la API y el campo pide escribirlo sin él', async () => {
    const user = userEvent.setup();
    const input = await form.render('USD', 50);
    await user.type(input, '-50');
    await form.fillRest?.(user);
    await user.click(screen.getByRole('button', { name: form.submit }));
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(' ');
    const messages = describedBy.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    expect(messages).toContain(moneyInputCopy.signed);
    expect(form.sent()).toBeUndefined();
  });

  it('bajo el campo se lee «Se guardará» con el importe interpretado', async () => {
    const user = userEvent.setup();
    const input = await form.render('USD', 150.5);
    await user.type(input, '150.50');
    const previewId = (input.getAttribute('aria-describedby') ?? '').split(' ').find((id) => id.endsWith('-preview'));
    const preview = document.getElementById(previewId ?? '');
    expect(preview).toHaveAttribute('aria-live', 'polite');
    await waitFor(() => expect(preview).toHaveTextContent(/^Se guardará: 150,50\sUS\$$/));
    expect(within(document.body).getAllByText(/^Se guardará:/)).toHaveLength(1);
  });
});
