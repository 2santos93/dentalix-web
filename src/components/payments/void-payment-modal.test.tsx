import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoidPaymentModal } from './void-payment-modal';
import { voidPaymentSubject } from './use-void-payment';
import { regionalFormat } from '@/lib/format/regional-format';

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

  it('DX-215: avisa de que un compromiso de pago cumplido con este abono se reabre', () => {
    setup();
    expect(screen.getByRole('dialog', { name: /anular este abono/i })).toHaveTextContent(
      /compromiso de pago.*vuelve a abierto.*incumplido/i,
    );
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

it('DX-390: avisa de que una forma de pago de un cobro dividido se anula con todo el cobro', () => {
  render(
    <VoidPaymentModal
      open
      onOpenChange={jest.fn()}
      onConfirm={jest.fn()}
      submitting={false}
      error={null}
      restrictedToOwnToday={false}
      splitLines={3}
    />,
  );
  expect(screen.getByRole('note')).toHaveTextContent(
    'Es una de las 3 formas de pago de un mismo cobro: se anulan todas y su recibo.',
  );
});

it('DX-354: muestra el importe con el código ISO y la fecha de la sede', () => {
  const subject = voidPaymentSubject(
    { id: 'p', amount: 1234.5, currency: 'USD', paidOn: '2027-07-15', patientName: 'Ana' },
    regionalFormat({ locale: 'en-US', hourCycle: 'h12' }),
  );
  setup({ subject });
  expect(screen.getByText(/USD.1,234\.50 · 07\/15\/2027 · Ana/)).toBeInTheDocument();
});

describe('VoidPaymentModal en móvil (DX-414)', () => {
  it('los botones del modal de anular miden 44 px a 390 px (touchTargets)', () => {
    setup();
    expect(screen.getByRole('dialog', { name: /anular este abono/i }).className).toContain(
      'max-sm:[&_button]:min-h-11',
    );
  });
});
