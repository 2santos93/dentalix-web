import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentReceiptPrintView } from './payment-receipt-print-view';
import { printPaymentReceipt } from '@/lib/payments/payment-receipts-api';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/payments/payment-receipts-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-receipts-api'),
  printPaymentReceipt: jest.fn(),
}));

const mockedPrint = printPaymentReceipt as jest.MockedFunction<typeof printPaymentReceipt>;
let printSpy: jest.SpyInstance;

beforeEach(() => {
  mockedPrint.mockReset();
  printSpy = jest.spyOn(window, 'print').mockImplementation(() => undefined);
});

afterEach(() => {
  printSpy.mockRestore();
});

it('pide la reimpresión (auditada), pinta el recibo y abre el diálogo de impresión una vez', async () => {
  mockedPrint.mockResolvedValue(paymentReceiptFixture());
  render(<PaymentReceiptPrintView token="tok" paymentId="pay-1" format="a4" />);

  expect(await screen.findByRole('heading', { level: 1, name: /recibo de caja/i })).toBeInTheDocument();
  await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
  expect(mockedPrint).toHaveBeenCalledTimes(1);
  expect(mockedPrint).toHaveBeenCalledWith('tok', 'pay-1');
  expect(document.querySelector('.receipt-print-page')).toHaveAttribute('data-format', 'a4');
});

it('mientras carga lo anuncia', () => {
  mockedPrint.mockReturnValue(new Promise(() => undefined));
  render(<PaymentReceiptPrintView token="tok" paymentId="pay-1" format="a4" />);
  expect(screen.getByRole('status')).toHaveTextContent(/preparando el recibo/i);
});

it('la barra queda fuera del papel, cambia de formato y vuelve a imprimir', async () => {
  mockedPrint.mockResolvedValue(paymentReceiptFixture());
  render(<PaymentReceiptPrintView token="tok" paymentId="pay-1" format="80mm" />);

  await screen.findByRole('heading', { level: 1, name: /recibo de caja/i });
  const toolbar = screen.getByRole('toolbar');
  expect(toolbar.className).toMatch(/print:hidden/);
  expect(within(toolbar).getByRole('link', { name: /tirilla 80 mm/i })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(within(toolbar).getByRole('link', { name: /^a4$/i })).toHaveAttribute(
    'href',
    '/print/payments/pay-1/receipt',
  );
  expect(within(toolbar).getByRole('link', { name: /volver a la ficha/i })).toHaveAttribute(
    'href',
    '/patients/pat-1?tab=treatment-plans',
  );
  expect(screen.getByTestId('receipt-document')).toHaveAttribute('data-format', '80mm');
  await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
  await userEvent.click(within(toolbar).getByRole('button', { name: /imprimir/i }));
  expect(printSpy).toHaveBeenCalledTimes(2);
});

it('un fallo de carga deja un error con reintento y no imprime', async () => {
  mockedPrint.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  mockedPrint.mockResolvedValueOnce(paymentReceiptFixture());
  render(<PaymentReceiptPrintView token="tok" paymentId="pay-1" format="a4" />);

  const alert = await screen.findByRole('alert');
  expect(printSpy).not.toHaveBeenCalled();
  await userEvent.click(within(alert).getByRole('button', { name: /reintentar/i }));
  expect(await screen.findByRole('heading', { level: 1, name: /recibo de caja/i })).toBeInTheDocument();
});

it('un rol sin acceso ve el aviso sin pedir nada ni imprimir', () => {
  render(<PaymentReceiptPrintView token="tok" paymentId="pay-1" format="a4" allowed={false} />);
  expect(screen.getByRole('status')).toHaveTextContent(/tu rol no tiene acceso/i);
  expect(screen.getByRole('button', { name: /imprimir/i })).toBeDisabled();
  expect(mockedPrint).not.toHaveBeenCalled();
});

it('un 403 de la API se muestra como aviso de acceso y un 404 como abono inexistente', async () => {
  mockedPrint.mockRejectedValueOnce(new ApiError(403, 'Forbidden'));
  const { unmount } = render(<PaymentReceiptPrintView token="tok" paymentId="pay-1" format="a4" />);
  expect(await screen.findByText(/tu rol no tiene acceso/i)).toBeInTheDocument();
  unmount();

  mockedPrint.mockRejectedValueOnce(new ApiError(404, 'No encontramos ese abono.'));
  render(<PaymentReceiptPrintView token="tok" paymentId="pay-1" format="a4" />);
  expect(await screen.findByText(/no encontramos este abono/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
});
