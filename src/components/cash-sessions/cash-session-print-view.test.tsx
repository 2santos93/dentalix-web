import { render, screen } from '@testing-library/react';
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
});
