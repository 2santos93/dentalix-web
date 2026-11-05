import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { Toaster } from './toaster';
import { SUCCESS_DURATION_MS, notifyError, notifySuccess } from './notify';

jest.mock('sonner', () => {
  const actual = jest.requireActual('sonner');
  return { ...actual, toast: { ...actual.toast, error: jest.fn(actual.toast.error), success: jest.fn(actual.toast.success) } };
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

  // Un toast que avisa de algo que quedó sin hacer no puede caducar solo: si
  // el estado de una cita no cambió y el aviso desaparece, la divergencia se
  // queda y nadie se enteró. Además, un modal abierto marca `inert` todo lo de
  // fuera, así que un toast con caducidad podía expirar mientras era
  // inalcanzable. jsdom no avanza los temporizadores de sonner de forma
  // observable, así que la aserción es sobre lo que se le pide a la librería.
  it('no caduca cuando lleva reintento, y usa el default cuando no', async () => {
    const mockedError = toast.error as jest.Mock;
    const user = userEvent.setup();

    mockedError.mockClear();
    const { unmount } = render(<Harness onRetry={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'disparar' }));
    expect(mockedError.mock.calls[0][1].duration).toBe(Infinity);
    unmount();

    mockedError.mockClear();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'disparar' }));
    expect(mockedError.mock.calls[0][1].duration).toBeUndefined();
  });

  it('devuelve el id del aviso para poder cerrarlo cuando el fallo se resuelve', () => {
    expect(notifyError('Fallo de prueba')).toBe('error:Fallo de prueba');
  });

  it('DX-538: con un modal abierto no ofrece un botón que no se podría pulsar', async () => {
    const user = userEvent.setup();
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('data-state', 'open');
    document.body.append(modal);
    try {
      render(<Harness />);
      await user.click(screen.getByRole('button', { name: 'disparar' }));
      expect(await screen.findByText('No se pudo cambiar el estado')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    } finally {
      modal.remove();
    }
  });
});

describe('notifySuccess (DX-075)', () => {
  it('un éxito corriente dura 10 s', () => {
    notifySuccess('Abono registrado.');
    expect(toast.success).toHaveBeenLastCalledWith('Abono registrado.', { duration: SUCCESS_DURATION_MS });
    expect(SUCCESS_DURATION_MS).toBe(10_000);
  });

  it('el que lleva una advertencia o un recibo no caduca', () => {
    notifySuccess('Abono registrado. Quedó sin tasa.', { persistent: true });
    expect(toast.success).toHaveBeenLastCalledWith('Abono registrado. Quedó sin tasa.', { duration: Infinity });
  });
});
