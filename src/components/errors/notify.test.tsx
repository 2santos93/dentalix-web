import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from './toaster';
import { notifyError } from './notify';

function Harness({ onRetry }: { onRetry?: () => void }) {
  return (
    <>
      <button onClick={() => notifyError('No se pudo cambiar el estado', { onRetry })}>
        disparar
      </button>
      <Toaster />
    </>
  );
}

describe('notifyError', () => {
  it('muestra el mensaje en un toast', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'disparar' }));

    expect(await screen.findByText('No se pudo cambiar el estado')).toBeInTheDocument();
  });

  it('ofrece una acción de reintento que invoca el callback', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    render(<Harness onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'disparar' }));
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('no duplica el toast si el mismo error se repite', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'disparar' }));
    await screen.findByText('No se pudo cambiar el estado');
    await user.click(screen.getByRole('button', { name: 'disparar' }));

    expect(screen.getAllByText('No se pudo cambiar el estado')).toHaveLength(1);
  });
});
