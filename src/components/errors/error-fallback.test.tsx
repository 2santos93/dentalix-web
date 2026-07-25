import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorFallback } from './error-fallback';

describe('ErrorFallback', () => {
  it('renders the friendly Spanish message', () => {
    render(<ErrorFallback onRetry={jest.fn()} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument();
    expect(
      screen.getByText('Ocurrió un error inesperado. Puedes intentar de nuevo.'),
    ).toBeInTheDocument();
  });

  it('calls onRetry when "Reintentar" is clicked', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    render(<ErrorFallback onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
