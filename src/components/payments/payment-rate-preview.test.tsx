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

describe('PaymentRatePreview con la fuente BCV (DX-585)', () => {
  const fmt = jest.requireActual('../../lib/format/regional-format').regionalFormat({
    locale: 'es-VE',
    hourCycle: 'h12',
  });

  function renderBcv(day: Record<string, unknown>, paymentCurrency = 'VES') {
    render(
      <PaymentRatePreview
        state={{ status: 'ready', rates: day, retry: jest.fn() } as unknown as ExchangeRatesState}
        amount={null}
        paymentCurrency={paymentCurrency}
        planCurrency="USD"
        planBalance="loading"
        onRetryBalance={jest.fn()}
        date="2026-11-22"
        fmt={fmt}
      />,
    );
  }

  it('la tasa dice «BCV» con su fecha valor', () => {
    renderBcv({
      base: 'USD',
      source: 'BCV',
      rates: { VES: 918.7662 },
      rateDate: '2026-11-22',
      bcv: { valueDate: '2026-11-20', fetchedAt: '2026-11-20T21:00:00.000Z' },
    });
    expect(screen.getByText(/· BCV, fecha valor 20\/11\/2026 · 22\/11\/2026$/)).toBeInTheDocument();
  });

  it('una moneda que no sale del BCV no lleva fecha valor', () => {
    renderBcv(
      {
        base: 'USD',
        source: 'BCV',
        rates: { COP: 4000 },
        rateDate: '2026-11-22',
        bcv: { valueDate: '2026-11-20', fetchedAt: '2026-11-20T21:00:00.000Z' },
      },
      'COP',
    );
    expect(screen.getByText(/· BCV · 22\/11\/2026$/)).toBeInTheDocument();
  });

  it('sin tasa del BCV lo dice, sin tomar la del proveedor', () => {
    renderBcv({ base: 'USD', source: 'BCV', rates: {}, rateDate: '2026-11-22', bcv: null });
    expect(screen.getByText(ratePreviewCopy.missingBcv('VES', '22/11/2026'))).toBeInTheDocument();
  });
});
