import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { Toaster } from './toaster';
import { notifyError } from './notify';

jest.mock('sonner', () => {
  const actual = jest.requireActual('sonner');
  return { ...actual, toast: { ...actual.toast, error: jest.fn(actual.toast.error) } };
});

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

  // Un toast con acción tiene que sobrevivir a que la persona lo note, lo lea,
  // decida y pulse. jsdom no avanza los temporizadores de sonner de forma
  // observable, así que la aserción es sobre lo que se le pide a la librería:
  // una duración explícita cuando hay reintento, y su default cuando no.
  it('dura más de lo normal cuando lleva reintento, y usa el default cuando no', async () => {
    const mockedError = toast.error as jest.Mock;
    const user = userEvent.setup();

    mockedError.mockClear();
    const { unmount } = render(<Harness onRetry={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'disparar' }));
    expect(mockedError.mock.calls[0][1].duration).toBe(12_000);
    unmount();

    mockedError.mockClear();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'disparar' }));
    expect(mockedError.mock.calls[0][1].duration).toBeUndefined();
  });
});
