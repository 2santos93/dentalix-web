import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { CreditRefundDialog } from './credit-refund-dialog';
import { getCreditRefund } from '@/lib/patient-credit/patient-credit-api';
import { ApiError } from '@/lib/api/client';
import { SEDE_LOCALE_ERROR } from '@/lib/locations/use-sede-format';
import { REGIONAL_US } from '@/lib/test/document-regional';
import { refundFixture } from '@/lib/test/credit-refund';

jest.mock('../../lib/patient-credit/patient-credit-api', () => ({
  ...jest.requireActual('../../lib/patient-credit/patient-credit-api'),
  getCreditRefund: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), dismiss: jest.fn() }) }));
const mockedGet = getCreditRefund as jest.MockedFunction<typeof getCreditRefund>;

describe('CreditRefundDialog (DX-354)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    (toast.error as jest.Mock).mockReset();
  });

  it('con región: el comprobante con la sede y sin aviso', () => {
    render(<CreditRefundDialog token="tok" refund={refundFixture({ regional: REGIONAL_US })} onOpenChange={() => undefined} />);
    expect(screen.queryByText(SEDE_LOCALE_ERROR)).not.toBeInTheDocument();
    expect(screen.getByTestId('refund-document').textContent?.replace(/\s/g, ' ')).toContain('USD 40,000.00');
  });

  it('sin región: «—», el aviso y Reintentar, que relee el comprobante con el token y lo pinta', async () => {
    mockedGet.mockResolvedValue(refundFixture({ regional: REGIONAL_US }));
    render(<CreditRefundDialog token="tok" refund={refundFixture({ regional: null })} onOpenChange={() => undefined} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('refund-document')).toHaveTextContent('Emitido —');
    expect(within(dialog).getByText(SEDE_LOCALE_ERROR)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reintentar' }));
    expect(mockedGet).toHaveBeenCalledWith('tok', 'r-1');
    await waitFor(() => expect(screen.queryByText(SEDE_LOCALE_ERROR)).not.toBeInTheDocument());
    expect(screen.getByTestId('refund-document').textContent?.replace(/\s/g, ' ')).toContain('USD 40,000.00');
  });

  it('si la relectura falla lo dice (aviso con reintento) y deja el comprobante y la nota', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    render(<CreditRefundDialog token="tok" refund={refundFixture({ regional: null })} onOpenChange={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(String((toast.error as jest.Mock).mock.calls[0][0])).toMatch(/No pudimos volver a leer el comprobante|error/i);
    expect(screen.getByText(SEDE_LOCALE_ERROR)).toBeInTheDocument();
    expect(screen.getByTestId('refund-document')).toBeInTheDocument();
  });
});
