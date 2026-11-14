import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SplitPaymentSummary, splitPaymentCopy, splitTotalOf } from './split-payment-lines';
import type { ExchangeRatesState } from './use-exchange-rates';

// DX-442 (FE-094): el resumen del cobro dividido distingue «no se pudo
// consultar la tasa» (un fallo, con reintento) de «falta la tasa» (una
// indicación), y un fallo del saldo del plan ofrece reintento.
const copy = splitPaymentCopy;
const LINES = [
  { amount: 100, currency: 'USD' },
  { amount: 4000, currency: 'VES' },
];

function renderSummary(props: Partial<Parameters<typeof SplitPaymentSummary>[0]> = {}) {
  const onRetryBalance = jest.fn();
  render(
    <SplitPaymentSummary
      total={{ status: 'ready', total: 101 }}
      pending={500}
      planCurrency="USD"
      fmt={null}
      confirmCredit={false}
      onConfirmCredit={jest.fn()}
      confirmError={null}
      disabled={false}
      onRetryBalance={onRetryBalance}
      {...props}
    />,
  );
  return { onRetryBalance };
}

describe('splitTotalOf (DX-442)', () => {
  const retry = jest.fn();

  it('las tasas que no se pudieron consultar son un error con reintento', () => {
    const rates: ExchangeRatesState = { status: 'error', retry };
    expect(splitTotalOf(LINES, 'USD', rates)).toEqual({ status: 'error', retry });
  });

  it('la tasa que aún no está (500 del proveedor) o que falta para una moneda no es un error', () => {
    expect(splitTotalOf(LINES, 'USD', { status: 'unavailable', retry })).toEqual({ status: 'unavailable' });
    expect(
      splitTotalOf(LINES, 'USD', {
        status: 'ready',
        rates: { date: '2026-11-09', base: 'USD', rates: {}, source: 'MANUAL' } as never,
      }),
    ).toEqual({ status: 'unavailable' });
  });

  it('sin líneas en otra moneda no pide tasas', () => {
    expect(splitTotalOf([{ amount: 100, currency: 'USD' }], 'USD', { status: 'error', retry })).toEqual({
      status: 'ready',
      total: 100,
    });
  });
});

describe('SplitPaymentSummary (DX-442)', () => {
  it('«no se pudo consultar»: un FieldError con reintento en el total, sin el aviso de «falta la tasa»', async () => {
    const retry = jest.fn();
    renderSummary({ total: { status: 'error', retry } });
    expect(screen.getByRole('status')).toHaveTextContent(copy.ratesError);
    expect(screen.queryByText(copy.ratesUnavailable)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('«falta la tasa»: el total es «—» y el aviso explica que se verá al guardar, sin reintento', () => {
    renderSummary({ total: { status: 'unavailable' } });
    expect(screen.getByText(copy.ratesUnavailable)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('el saldo del plan que no se pudo leer ofrece reintento', async () => {
    const { onRetryBalance } = renderSummary({ pending: 'error' });
    expect(screen.getByText(copy.balanceError)).toBeInTheDocument();
    expect(screen.getByText(copy.balanceUnavailable)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetryBalance).toHaveBeenCalledTimes(1);
  });
});
