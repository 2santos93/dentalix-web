import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentRatePreview, ratePreviewCopy } from './payment-rate-preview';
import type { ExchangeRatesState } from './use-exchange-rates';

const rates = {
  status: 'ready',
  rates: { base: 'USD', source: 'AUTOMATIC', rates: { VES: 36 } },
  retry: jest.fn(),
} as unknown as ExchangeRatesState;

function renderPreview(rateProviderTimedOut: boolean, onRetryBalance = jest.fn()) {
  render(
    <PaymentRatePreview
      state={rates}
      amount={3600}
      paymentCurrency="VES"
      planCurrency="USD"
      planBalance={{ balance: 300, paymentsWithoutRate: 1, rateProviderTimedOut }}
      onRetryBalance={onRetryBalance}
      date="2026-10-30"
      fmt={null}
    />,
  );
}

describe('PaymentRatePreview al cobrar (DX-472)', () => {
  it('sin tasa: habla de registrar la tasa y no ofrece reintentar', () => {
    renderPreview(false);
    expect(screen.getByText(ratePreviewCopy.pendingWithoutRate(1))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('el proveedor no respondió: mensaje propio y «Reintentar», que relee el saldo', async () => {
    const onRetry = jest.fn();
    renderPreview(true, onRetry);
    expect(screen.getByText('El proveedor de tasas no respondió, vuelve a intentarlo')).toBeInTheDocument();
    expect(screen.queryByText(ratePreviewCopy.pendingWithoutRate(1))).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
