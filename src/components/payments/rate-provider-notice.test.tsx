import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RateProviderNotice, rateProviderCopy } from './rate-provider-notice';

describe('RateProviderNotice (DX-472)', () => {
  it('dice que el proveedor no respondió, cuántos abonos faltan y ofrece «Reintentar»', async () => {
    const onRetry = jest.fn();
    render(<RateProviderNotice paymentsCount={2} onRetry={onRetry} />);

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('El proveedor de tasas no respondió, vuelve a intentarlo');
    expect(notice).toHaveTextContent('todavía no cuenta 2 abonos');

    await userEvent.click(screen.getByRole('button', { name: rateProviderCopy.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('no propone registrar una tasa: no falta ninguna', () => {
    render(<RateProviderNotice paymentsCount={1} onRetry={jest.fn()} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent(/registrar/i);
  });

  it('sin recuento dice que las cifras están incompletas; reintentando, el botón se bloquea', () => {
    render(<RateProviderNotice onRetry={jest.fn()} retrying />);
    expect(screen.getByRole('status')).toHaveTextContent(rateProviderCopy.incomplete);
    expect(screen.getByRole('button', { name: rateProviderCopy.retry })).toBeDisabled();
  });
});
