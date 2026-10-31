import { render, screen, waitFor, within } from '@testing-library/react';
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

/** «Pagará hasta el» es un `DatePicker` (segmentos dd/mm/aaaa, sin locale de sede → «es»). */
async function typeDate(iso: string) {
  const [y, m, d] = iso.split('-');
  const group = screen.getByRole('group', { name: 'Pagará hasta el' });
  await userEvent.click(within(group).getAllByRole('spinbutton')[0]);
  await userEvent.keyboard(`${d}${m}${y}`);
}

describe('PaymentPromiseDialog (DX-150)', () => {
  beforeEach(() => mockedCreate.mockReset());

  it('valida en español importe y fecha', async () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Compromiso de pago' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar compromiso' }));
    expect(await screen.findByText('Escribe un importe mayor que 0.')).toBeInTheDocument();
    expect(screen.getByText('Elige la fecha del compromiso.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('DX-241: «150.50» en USD se guarda como 150,5 (no 15 050)', async () => {
    mockedCreate.mockResolvedValue({ id: 'pp1' } as never);
    setup();
    const due = inDays(3);
    await userEvent.type(screen.getByLabelText('Importe'), '150.50');
    await userEvent.selectOptions(screen.getByLabelText('Moneda'), 'USD');
    await typeDate(due);
    expect(await screen.findByText(/^Se guardará: 150,50\sUSD$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar compromiso' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'pat-1', { amount: 150.5, currency: 'USD', dueDate: due }),
    );
  });

  it('DX-241: un importe ambiguo bloquea el envío con el motivo junto al campo', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Importe'), '1.50.0');
    await typeDate(inDays(1));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar compromiso' }));
    const input = screen.getByLabelText('Importe');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const error = document.getElementById('pp-amount-error');
    expect(error).toHaveTextContent('No sabemos leer «1.50.0»');
    expect(input.getAttribute('aria-describedby')).toContain('pp-amount-error');
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('DX-241: COP admite céntimos como la API («150.000,50» → 150000,5)', async () => {
    mockedCreate.mockResolvedValue({ id: 'pp1' } as never);
    setup();
    await userEvent.type(screen.getByLabelText('Importe'), '150.000,50');
    await typeDate(inDays(1));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar compromiso' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'pat-1', expect.objectContaining({ amount: 150000.5, currency: 'COP' })),
    );
  });

  it('no admite una fecha pasada', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Importe'), '200000');
    await typeDate(inDays(-1));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar compromiso' }));
    expect(await screen.findByText('La fecha no puede ser anterior a hoy.')).toBeInTheDocument();
  });

  it('guarda importe, moneda y fecha', async () => {
    mockedCreate.mockResolvedValue({ id: 'pp1' } as never);
    const { onSaved, onOpenChange } = setup();
    const due = inDays(7);
    await userEvent.type(screen.getByLabelText('Importe'), '200.000');
    await userEvent.selectOptions(screen.getByLabelText('Moneda'), 'COP');
    await typeDate(due);
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
    await typeDate(inDays(1));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar compromiso' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ya tiene un compromiso de pago abierto');
  });
});
