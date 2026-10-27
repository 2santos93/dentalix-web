import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CashSessionDetailView } from './cash-session-detail-view';
import { getCashSession } from '@/lib/cash-sessions/cash-sessions-api';
import { listLocations } from '@/lib/locations/locations-api';
import { cashSessionFixture, closedCashSessionFixture } from '@/lib/test/cash-session';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/cash-sessions/cash-sessions-api', () => ({
  ...jest.requireActual('../../lib/cash-sessions/cash-sessions-api'),
  getCashSession: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    { code: 'JPY', name: 'Yen japonés', symbol: '¥' },
  ]),
}));
const mockedGet = getCashSession as jest.MockedFunction<typeof getCashSession>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedLocations.mockResolvedValue([clinicLocation({ id: 'loc-1' })]);
});

async function renderDetail() {
  render(<CashSessionDetailView token="tok" sessionId="cs-1" />);
  await screen.findByRole('heading', { name: 'Turno de caja' });
  await screen.findByTestId('cash-session-report');
}

/**
 * DX-252 (TST-031): «Reabrir» y «Corregir con un ajuste» salen solo cuando la
 * API los permite a quien consulta (`can.reopen`, `can.adjust`), y cada uno
 * abre su modal.
 */
describe('CashSessionDetailView: acciones según `can` (DX-027, DX-252)', () => {
  it('cerrada sin can.reopen ni can.adjust (recepción): ni Reabrir ni Corregir, solo el informe', async () => {
    mockedGet.mockResolvedValue(closedCashSessionFixture({ can: { close: false, reopen: false, adjust: false } }));
    await renderDetail();
    expect(screen.queryByRole('button', { name: 'Reabrir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corregir con un ajuste' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar caja' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Informe imprimible' })).toBeInTheDocument();
  });

  it('can.reopen sin can.adjust: solo Reabrir; can.adjust sin can.reopen: solo Corregir', async () => {
    mockedGet.mockResolvedValue(closedCashSessionFixture({ can: { close: false, reopen: true, adjust: false } }));
    const { unmount } = render(<CashSessionDetailView token="tok" sessionId="cs-1" />);
    expect(await screen.findByRole('button', { name: 'Reabrir' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corregir con un ajuste' })).not.toBeInTheDocument();
    unmount();

    mockedGet.mockResolvedValue(closedCashSessionFixture({ can: { close: false, reopen: false, adjust: true } }));
    await renderDetail();
    expect(screen.getByRole('button', { name: 'Corregir con un ajuste' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reabrir' })).not.toBeInTheDocument();
  });

  it('abierta: Cerrar caja, sin Reabrir ni Corregir', async () => {
    mockedGet.mockResolvedValue(cashSessionFixture());
    await renderDetail();
    expect(screen.getByRole('button', { name: 'Cerrar caja' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reabrir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corregir con un ajuste' })).not.toBeInTheDocument();
  });

  it('ADMIN (can.reopen y can.adjust): cada botón abre su modal', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(closedCashSessionFixture());
    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Reabrir' }));
    const reopen = await screen.findByRole('dialog', { name: '¿Reabrir esta caja?' });
    expect(within(reopen).getByLabelText('Motivo de la reapertura')).toBeInTheDocument();
    await user.click(within(reopen).getByRole('button', { name: 'Cancelar' }));

    await user.click(screen.getByRole('button', { name: 'Corregir con un ajuste' }));
    const adjust = await screen.findByRole('dialog', { name: 'Corregir el cierre' });
    expect(within(adjust).getByLabelText('Motivo')).toBeInTheDocument();
  });
});

describe('CashSessionDetailView: moneda de la sede (GLOBAL-G1)', () => {
  it('JPY location shows JPY without decimals', async () => {
    const user = userEvent.setup();
    mockedLocations.mockResolvedValue([clinicLocation({ id: 'loc-1', currency: 'JPY', timeZone: 'Asia/Tokyo' })]);
    mockedGet.mockResolvedValue(closedCashSessionFixture());
    await renderDetail();
    await user.click(screen.getByRole('button', { name: 'Corregir con un ajuste' }));
    const adjust = await screen.findByRole('dialog', { name: 'Corregir el cierre' });
    // El ajuste empieza en la moneda de la sede, no en la de su país.
    expect((within(adjust).getByLabelText('Moneda') as HTMLSelectElement).value).toBe('JPY');
  });

  it('location without currency shows SedeConfigError and never COP', async () => {
    const user = userEvent.setup();
    mockedLocations.mockResolvedValue([clinicLocation({ id: 'loc-1', country: 'CO', currency: null })]);
    mockedGet.mockResolvedValue(closedCashSessionFixture());
    await renderDetail();
    expect(
      screen.getByText('No se pudo saber la moneda de la sede. Vuelve a intentarlo o revisa la sede en Ajustes → Sedes.'),
    ).toBeInTheDocument();
    // Sin moneda no se ofrece el ajuste (empezaría en una moneda supuesta).
    expect(screen.queryByRole('button', { name: 'Corregir con un ajuste' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reabrir' })).toBeInTheDocument();

    mockedLocations.mockResolvedValue([clinicLocation({ id: 'loc-1', currency: 'JPY' })]);
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Corregir con un ajuste' })).toBeInTheDocument();
  });
});
