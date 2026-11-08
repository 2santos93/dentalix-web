import { render, screen, within } from '@testing-library/react';
import { PaymentReceiptDialog } from './payment-receipt-dialog';
import { PaymentReceiptPrintView } from './payment-receipt-print-view';
import { getPaymentReceipt, printPaymentReceipt } from '@/lib/payments/payment-receipts-api';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';
import { setClinicCurrencyTexts } from '@/lib/format/clinic-currency-texts';
import cases from '@/lib/format/receipt-format.cases.json';

jest.mock('../../lib/payments/payment-receipts-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-receipts-api'),
  getPaymentReceipt: jest.fn(),
  printPaymentReceipt: jest.fn(),
}));

const mockedGet = getPaymentReceipt as jest.MockedFunction<typeof getPaymentReceipt>;
const mockedPrint = printPaymentReceipt as jest.MockedFunction<typeof printPaymentReceipt>;

interface MoneyCase {
  locale: string;
  op: string;
  args: unknown[];
  expected: string;
}

/**
 * El vector compartido con la API (`receipt-format.cases.json`, copia byte a
 * byte): el email del recibo se prueba contra estas mismas cadenas en
 * `outbox-receipt-email-sender.spec.ts` de la API.
 */
function vector(amount: number, currency: string, texts: Record<string, string>): string {
  const found = (cases as MoneyCase[]).find(
    (c) =>
      c.locale === 'en-US' &&
      c.op === 'moneyWithCode' &&
      c.args[0] === amount &&
      c.args[1] === currency &&
      JSON.stringify(c.args[2]) === JSON.stringify(texts),
  );
  if (!found) throw new Error(`Sin vector en-US ${amount} ${currency}`);
  return found.expected;
}

/** Recibo de una sede en-US: abono en VES con el texto «Bs.» congelado y saldo del plan en USD. */
function enUsReceipt() {
  const base = paymentReceiptFixture();
  return paymentReceiptFixture({
    regional: { timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' },
    snapshot: {
      ...base.snapshot,
      payment: { ...base.snapshot.payment, amount: 1234.5, currency: 'VES' },
      planBalance: { currency: 'USD', billable: 2000, paid: 765.5, balance: 1234.5 },
      currencyTexts: { VES: 'Bs.' },
    },
  });
}

let printSpy: jest.SpyInstance;

beforeEach(() => {
  mockedGet.mockReset();
  mockedPrint.mockReset();
  // La clínica dice hoy otra cosa: el recibo usa SU foto, no los textos de hoy.
  setClinicCurrencyTexts({ VES: 'VEB', USD: 'Dól.' });
  printSpy = jest.spyOn(window, 'print').mockImplementation(() => undefined);
});

afterEach(() => {
  setClinicCurrencyTexts({});
  printSpy.mockRestore();
});

describe('DX-517-bis: pantalla, papel y email dicen el mismo importe (sede en-US)', () => {
  const amount = vector(1234.5, 'VES', { VES: 'Bs.' });
  const balance = vector(1234.5, 'USD', {});

  it('los vectores son los del texto congelado y el código ISO, con espacio duro', () => {
    expect(amount).toBe('Bs. 1,234.50');
    expect(balance).toBe('USD 1,234.50');
  });

  it('pantalla: el diálogo del recibo', async () => {
    mockedGet.mockResolvedValue(enUsReceipt());
    render(<PaymentReceiptDialog token="tok" paymentId="pay-1" onOpenChange={() => undefined} />);
    const dialog = await screen.findByRole('dialog', { name: /recibo de caja/i });
    const doc = await within(dialog).findByTestId('receipt-document');
    expect(doc.textContent).toContain(amount);
    expect(doc.textContent).toContain(balance);
    expect(doc.textContent).not.toContain('VEB');
    expect(doc.textContent).not.toContain('Dól.');
  });

  it('papel: la vista imprimible', async () => {
    mockedPrint.mockResolvedValue(enUsReceipt());
    render(<PaymentReceiptPrintView token="tok" paymentId="pay-1" format="a4" />);
    const doc = await screen.findByTestId('receipt-document');
    expect(doc.textContent).toContain(amount);
    expect(doc.textContent).toContain(balance);
    expect(doc.textContent).not.toContain('VEB');
  });
});
