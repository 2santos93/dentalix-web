import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { PaymentReceiptDialog } from './payment-receipt-dialog';
import { getPaymentReceipt, sendPaymentReceipt } from '@/lib/payments/payment-receipts-api';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/payments/payment-receipts-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-receipts-api'),
  getPaymentReceipt: jest.fn(),
  sendPaymentReceipt: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockedGet = getPaymentReceipt as jest.MockedFunction<typeof getPaymentReceipt>;
const mockedSend = sendPaymentReceipt as jest.MockedFunction<typeof sendPaymentReceipt>;

beforeEach(() => {
  mockedGet.mockReset();
  mockedSend.mockReset();
  (toast.success as jest.Mock).mockReset();
  (toast.error as jest.Mock).mockReset();
});

it('cerrado (sin abono) no pide nada', () => {
  render(<PaymentReceiptDialog token="tok" paymentId={null} onOpenChange={() => undefined} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mockedGet).not.toHaveBeenCalled();
});

it('carga el recibo del abono, con su número, y ofrece imprimir en A4 o tirilla', async () => {
  mockedGet.mockResolvedValue(paymentReceiptFixture());
  render(<PaymentReceiptDialog token="tok" paymentId="pay-1" onOpenChange={() => undefined} />);

  const dialog = await screen.findByRole('dialog', { name: /recibo de caja/i });
  expect(within(dialog).getByRole('status')).toHaveTextContent(/cargando el recibo/i);
  expect(await within(dialog).findByTestId('receipt-document')).toHaveTextContent('N.º NOR-000123');
  expect(mockedGet).toHaveBeenCalledWith('tok', 'pay-1');

  const a4 = within(dialog).getByRole('link', { name: /imprimir a4/i });
  expect(a4).toHaveAttribute('href', '/print/payments/pay-1/receipt');
  expect(a4).toHaveAttribute('target', '_blank');
  expect(within(dialog).getByRole('link', { name: /tirilla 80 mm/i })).toHaveAttribute(
    'href',
    '/print/payments/pay-1/receipt?formato=80mm',
  );
});

it('un fallo de carga es un error de sección con reintento', async () => {
  mockedGet.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  mockedGet.mockResolvedValueOnce(paymentReceiptFixture());
  render(<PaymentReceiptDialog token="tok" paymentId="pay-1" onOpenChange={() => undefined} />);

  const alert = await screen.findByRole('alert');
  expect(screen.queryByRole('link', { name: /imprimir a4/i })).not.toBeInTheDocument();
  await userEvent.click(within(alert).getByRole('button', { name: /reintentar/i }));
  expect(await screen.findByTestId('receipt-document')).toBeInTheDocument();
});

it('un 403 se muestra como aviso de acceso, sin reintento', async () => {
  mockedGet.mockRejectedValue(new ApiError(403, 'Tu rol no tiene acceso a los recibos de caja'));
  render(<PaymentReceiptDialog token="tok" paymentId="pay-1" onOpenChange={() => undefined} />);
  expect(await screen.findByText(/tu rol no tiene acceso a los recibos/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
});

it('enviar por email avisa del destino enmascarado', async () => {
  mockedGet.mockResolvedValue(paymentReceiptFixture());
  mockedSend.mockResolvedValue({ sentTo: 'ca***@example.com', sentToResponsible: false });
  render(<PaymentReceiptDialog token="tok" paymentId="pay-1" onOpenChange={() => undefined} />);

  await screen.findByTestId('receipt-document');
  await userEvent.click(screen.getByRole('button', { name: /enviar por email/i }));
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith('Recibo enviado a ca***@example.com.'),
  );
  expect(mockedSend).toHaveBeenCalledWith('tok', 'pay-1');
});

it('si el envío falla, el motivo en español va a un aviso con reintento y el recibo sigue en pantalla', async () => {
  mockedGet.mockResolvedValue(paymentReceiptFixture());
  mockedSend.mockRejectedValue(
    new ApiError(
      422,
      'El paciente no tiene un email registrado. Añádelo en su ficha para enviarle el recibo.',
    ),
  );
  render(<PaymentReceiptDialog token="tok" paymentId="pay-1" onOpenChange={() => undefined} />);

  await screen.findByTestId('receipt-document');
  await userEvent.click(screen.getByRole('button', { name: /enviar por email/i }));
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      'El paciente no tiene un email registrado. Añádelo en su ficha para enviarle el recibo.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Reintentar' }) }),
    ),
  );
  expect(screen.getByTestId('receipt-document')).toBeInTheDocument();
});
