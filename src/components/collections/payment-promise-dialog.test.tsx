import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentPromiseDialog } from './payment-promise-dialog';
import { createPaymentPromise } from '@/lib/collections/collections-api';
import { todayLocal } from '@/lib/collections/presentation';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/collections/collections-api', () => ({
  createPaymentPromise: jest.fn(),
}));
const mockedCreate = createPaymentPromise as jest.MockedFunction<typeof createPaymentPromise>;

const patient = { id: 'pat-1', fullName: 'Ana Pérez' };

function setup() {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <PaymentPromiseDialog
      open
      onOpenChange={onOpenChange}
      token="tok"
      patient={patient}
      currencies={['COP', 'USD']}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange };
}

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return todayLocal(d);
}

describe('PaymentPromiseDialog (DX-150)', () => {
  beforeEach(() => mockedCreate.mockReset());

  it('valida en español importe y fecha', async () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Compromiso de pago' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar compromiso' }));
    expect(await screen.findByText('Escribe un importe mayor que 0.')).toBeInTheDocument();
    expect(screen.getByText('Elige la fecha del compromiso.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Importe'), '12,345');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar compromiso' }));
    expect(await screen.findByText('El importe admite hasta 2 decimales.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('no admite una fecha pasada', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Importe'), '200000');
    await userEvent.type(screen.getByLabelText('Pagará hasta el'), inDays(-1));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar compromiso' }));
    expect(await screen.findByText('La fecha no puede ser anterior a hoy.')).toBeInTheDocument();
  });

  it('guarda importe, moneda y fecha', async () => {
    mockedCreate.mockResolvedValue({ id: 'pp1' } as never);
    const { onSaved, onOpenChange } = setup();
    const due = inDays(7);
    await userEvent.type(screen.getByLabelText('Importe'), '200.000');
    await userEvent.selectOptions(screen.getByLabelText('Moneda'), 'COP');
    await userEvent.type(screen.getByLabelText('Pagará hasta el'), due);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar compromiso' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'pat-1', {
        amount: 200000,
        currency: 'COP',
        dueDate: due,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('el 409 de «ya hay uno abierto» se muestra en el modal', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(409, 'El paciente ya tiene un compromiso de pago abierto: se cierra solo al cumplirse o al vencer.'),
    );
    setup();
    await userEvent.type(screen.getByLabelText('Importe'), '1000');
    await userEvent.type(screen.getByLabelText('Pagará hasta el'), inDays(1));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar compromiso' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya tiene un compromiso de pago abierto');
  });
});
