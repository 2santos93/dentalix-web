import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreditRefundPrintView } from './credit-refund-print-view';
import { getCreditRefund } from '@/lib/patient-credit/patient-credit-api';
import { SEDE_LOCALE_ERROR } from '@/lib/locations/use-sede-format';
import { REGIONAL_US } from '@/lib/test/document-regional';
import { refundFixture } from '@/lib/test/credit-refund';

jest.mock('../../lib/patient-credit/patient-credit-api', () => ({
  ...jest.requireActual('../../lib/patient-credit/patient-credit-api'),
  getCreditRefund: jest.fn(),
}));
const mockedGet = getCreditRefund as jest.MockedFunction<typeof getCreditRefund>;

describe('CreditRefundPrintView (DX-354)', () => {
  let print: jest.SpyInstance;
  beforeEach(() => {
    mockedGet.mockReset();
    print = jest.spyOn(window, 'print').mockImplementation(() => undefined);
  });
  afterEach(() => print.mockRestore());

  it('con la sede del comprobante: importe con código y abre la impresión una vez', async () => {
    mockedGet.mockResolvedValue(refundFixture({ regional: REGIONAL_US }));
    render(<CreditRefundPrintView token="tok" refundId="r-1" format="a4" />);
    const doc = await screen.findByTestId('refund-document');
    expect(doc.textContent?.replace(/\s/g, ' ')).toContain('USD 40,000.00');
    expect(screen.queryByText(SEDE_LOCALE_ERROR)).not.toBeInTheDocument();
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it('sin región: «—», el aviso fuera del papel, sin imprimir solo; Reintentar lo relee e imprime', async () => {
    mockedGet.mockResolvedValueOnce(refundFixture({ regional: null }));
    mockedGet.mockResolvedValueOnce(refundFixture({ regional: REGIONAL_US }));
    render(<CreditRefundPrintView token="tok" refundId="r-1" format="a4" />);
    const note = (await screen.findByText(SEDE_LOCALE_ERROR)).closest('[role="status"]');
    expect(note?.closest('.print\\:hidden')).not.toBeNull();
    expect(screen.getByTestId('refund-document')).toHaveTextContent('Emitido —');
    expect(screen.getByRole('button', { name: /imprimir/i })).toBeDisabled();
    expect(print).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByText(SEDE_LOCALE_ERROR)).not.toBeInTheDocument());
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });
});
