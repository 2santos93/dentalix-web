import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { getPaymentProofUrl } from '@/lib/payments/payment-proof-api';
import { usePaymentProofViewer } from './payment-proof-viewer';

jest.mock('../../lib/payments/payment-proof-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-proof-api'),
  getPaymentProofUrl: jest.fn(),
}));
const mockedUrl = getPaymentProofUrl as jest.MockedFunction<typeof getPaymentProofUrl>;

const ticket = (over: Partial<Awaited<ReturnType<typeof getPaymentProofUrl>>> = {}) => ({
  url: 'https://files.test/p?sig=1',
  expiresAt: '2026-11-05T00:05:00.000Z',
  disposition: 'inline' as const,
  mime: 'image/png' as 'image/png' | 'application/pdf',
  name: 'captura.png',
  ...over,
});

function Harness() {
  const viewer = usePaymentProofViewer('tok');
  return (
    <>
      <button type="button" onClick={() => viewer.open('pay-9')}>
        abrir
      </button>
      {viewer.dialog}
    </>
  );
}

beforeEach(() => mockedUrl.mockReset());

it('abre el comprobante con UNA sola consulta (la URL ya pedida se reutiliza) y una imagen se pinta en <img>', async () => {
  mockedUrl.mockResolvedValue(ticket());
  render(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'abrir' }));
  expect(await screen.findByRole('img', { name: 'captura.png' })).toHaveAttribute('src', 'https://files.test/p?sig=1');
  expect(mockedUrl).toHaveBeenCalledTimes(1);
  expect(mockedUrl).toHaveBeenCalledWith('tok', 'pay-9', 'inline');
});

it('un PDF no se pinta como imagen', async () => {
  mockedUrl.mockResolvedValue(ticket({ mime: 'application/pdf', name: 'pago.pdf' }));
  render(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'abrir' }));
  expect(await screen.findByRole('dialog', { name: 'pago.pdf' })).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: 'pago.pdf' })).not.toBeInTheDocument();
});

it('si no carga, error de sección con reintento', async () => {
  mockedUrl.mockRejectedValueOnce(new ApiError(404, 'no'));
  mockedUrl.mockResolvedValueOnce(ticket());
  render(<Harness />);
  await userEvent.click(screen.getByRole('button', { name: 'abrir' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/No se pudo cargar/);
  await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
  await waitFor(() => expect(screen.getByRole('img', { name: 'captura.png' })).toBeInTheDocument());
});
