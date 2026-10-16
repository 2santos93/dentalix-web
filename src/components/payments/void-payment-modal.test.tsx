import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoidPaymentModal } from './void-payment-modal';

function setup(props: Partial<React.ComponentProps<typeof VoidPaymentModal>> = {}) {
  const onConfirm = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <VoidPaymentModal
      open
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      submitting={false}
      error={null}
      restrictedToOwnToday={false}
      {...props}
    />,
  );
  return { onConfirm, onOpenChange, user: userEvent.setup() };
}

describe('VoidPaymentModal', () => {
  it('pide el motivo con un campo etiquetado y explica que queda registrado', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: /anular este abono/i });
    expect(dialog).toHaveTextContent(/quién lo anuló, cuándo y por qué/i);
    expect(screen.getByLabelText(/motivo de la anulación/i)).toHaveAttribute('maxLength', '300');
  });

  it('sin motivo (o solo espacios / menos de 3 caracteres) no envía y explica el error junto al campo', async () => {
    const { onConfirm, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Anular abono' }));
    expect(onConfirm).not.toHaveBeenCalled();
    const field = screen.getByLabelText(/motivo de la anulación/i);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent(/al menos 3 caracteres/i);

    await user.type(field, '  ab  ');
    await user.click(screen.getByRole('button', { name: 'Anular abono' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('envía el motivo recortado', async () => {
    const { onConfirm, user } = setup();
    await user.type(screen.getByLabelText(/motivo de la anulación/i), '  Cobro duplicado  ');
    await user.click(screen.getByRole('button', { name: 'Anular abono' }));
    expect(onConfirm).toHaveBeenCalledWith('Cobro duplicado');
  });

  it('cuenta los caracteres usados', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText(/motivo de la anulación/i), 'Hola');
    expect(screen.getByText('4/300')).toBeInTheDocument();
  });

  it('muestra el error del servidor (p. ej. 403 de recepción) dentro del modal', () => {
    setup({ error: 'Solo puedes anular abonos registrados hoy.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Solo puedes anular abonos registrados hoy.');
  });

  it('avisa a recepción de su ventana de anulación', () => {
    setup({ restrictedToOwnToday: true });
    expect(screen.getByRole('dialog')).toHaveTextContent(/solo los que registraste tú hoy/i);
  });

  it('mientras envía, deshabilita el campo y cancelar', () => {
    setup({ submitting: true });
    expect(screen.getByLabelText(/motivo de la anulación/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });
});
