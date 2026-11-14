import { render } from '@testing-library/react';
import { PaymentReceiptDocument } from './payment-receipt-document';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';
import type { PaymentReceipt } from '@/lib/payments/payment-receipts-api';

/**
 * DX-521: el marcado del recibo con la región de su sede (Caracas, 24 h, con
 * «Bs.» de la foto). El golden de DX-515 (`payment-receipt-document.golden`),
 * cuyos recibos no llevan región, no cambia: este es un fichero aparte.
 */
function regionalReceipt(): PaymentReceipt {
  const base = paymentReceiptFixture();
  return {
    ...base,
    regional: { timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h23' },
    issuedAt: '2026-11-02T01:30:00.000Z',
    snapshot: {
      ...base.snapshot,
      currencyTexts: { VES: 'Bs.' },
      payment: { ...base.snapshot.payment, currency: 'VES', paidOn: '2026-11-02' },
      plan: { id: 'plan-1', optionLabel: 'Opción A: implante', createdAt: '2026-09-01T15:00:00.000Z' },
      planBalance: { currency: 'VES', billable: 900000, paid: 450000, balance: 450000 },
    },
  };
}

describe('recibo con la región de su sede (DX-521)', () => {
  it.each(['a4', '80mm'] as const)('%s', (format) => {
    const { container } = render(<PaymentReceiptDocument receipt={regionalReceipt()} format={format} />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
