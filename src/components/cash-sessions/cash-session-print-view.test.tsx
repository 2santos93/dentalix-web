import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SEDE_LOCALE_ERROR } from '@/lib/locations/use-sede-format';
import { REGIONAL_US } from '@/lib/test/document-regional';
import { CashSessionPrintView } from './cash-session-print-view';
import { ApiError } from '@/lib/api/client';
import { getCashSession } from '@/lib/cash-sessions/cash-sessions-api';
import { closedCashSessionFixture } from '@/lib/test/cash-session';

jest.mock('../../lib/cash-sessions/cash-sessions-api', () => ({
  ...jest.requireActual('../../lib/cash-sessions/cash-sessions-api'),
  getCashSession: jest.fn(),
}));
const mockedGet = getCashSession as jest.MockedFunction<typeof getCashSession>;

describe('CashSessionPrintView (DX-027)', () => {
  const print = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    window.print = print;
  });

  it('pinta el informe y abre el diálogo de impresión una vez', async () => {
    mockedGet.mockResolvedValue(closedCashSessionFixture());
    render(<CashSessionPrintView token="tok" sessionId="cs-1" />);
    expect(await screen.findByTestId('cash-session-report')).toBeInTheDocument();
    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('toolbar', { name: 'Acciones del informe' })).toBeInTheDocument();
  });

  it('sin permiso no pide nada; 404 lo dice sin reintento', async () => {
    const { unmount } = render(<CashSessionPrintView token="tok" sessionId="cs-1" allowed={false} />);
    expect(screen.getByText('Tu rol no tiene acceso a la caja.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
    unmount();
    mockedGet.mockRejectedValue(new ApiError(404, 'Caja no encontrada.'));
    render(<CashSessionPrintView token="tok" sessionId="cs-1" />);
    expect(await screen.findByText('No encontramos este turno.')).toBeInTheDocument();
  });

  it('DX-354: sin formato de la sede «—», el aviso fuera del papel, sin abrir la impresión solo y con el título sin fecha; Reintentar lo relee', async () => {
    mockedGet.mockResolvedValueOnce(closedCashSessionFixture({ regional: null }));
    mockedGet.mockResolvedValueOnce(closedCashSessionFixture({ regional: REGIONAL_US }));
    render(<CashSessionPrintView token="tok" sessionId="cs-1" />);
    expect(await screen.findByTestId('cash-session-report')).toHaveTextContent('Paola Martínez · —');
    const note = screen.getByText(SEDE_LOCALE_ERROR).closest('[role="status"]');
    expect(note?.closest('.print\\:hidden')).not.toBeNull();
    expect(print).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /imprimir/i })).toBeDisabled();
    // DX-118: en la pestaña, el título neutro; el del documento solo al imprimir.
    expect(document.title).toBe('Cierre de caja');
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.title).toBe('Cierre de caja Sede principal');
    window.dispatchEvent(new Event('afterprint'));

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByText(SEDE_LOCALE_ERROR)).not.toBeInTheDocument());
    expect(screen.getByTestId('cash-session-report')).toHaveTextContent('10/17/2026');
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.title).toBe('Cierre de caja');
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.title).toMatch(/^Cierre de caja Sede principal \d{2}\/\d{2}\/\d{4}$/);
    window.dispatchEvent(new Event('afterprint'));
  });
});
