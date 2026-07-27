import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardView } from './dashboard-view';
import { ApiError } from '@/lib/api/client';
import { getDashboard } from '@/lib/dashboard/dashboard-api';
import type { Dashboard } from '@/lib/dashboard/dashboard-api';
import { listCurrencies } from '@/lib/reference/currencies-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching agenda-view.test.tsx's / treatment-plans-tab.test.tsx's
// convention.
jest.mock('../../lib/dashboard/dashboard-api', () => ({
  getDashboard: jest.fn(),
}));
// CurrencySelect (Task 10, wired here per Task 11) fetches its own options
// via `listCurrencies` — mock it so the currency filter select renders
// deterministically.
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn(),
}));

const mockedGetDashboard = getDashboard as jest.MockedFunction<typeof getDashboard>;
const mockedListCurrencies = listCurrencies as jest.MockedFunction<typeof listCurrencies>;

function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    period: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-24T00:00:00.000Z' },
    incomes: {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-24T00:00:00.000Z',
      currency: 'USD',
      totalConverted: 1250.5,
      count: 12,
      byCurrency: { COP: 500000, USD: 30 },
    },
    lowStockItems: {
      count: 2,
      items: [
        { id: 'item-1', name: 'Guantes de nitrilo', unit: 'caja', stock: 1, minStock: 5 },
        { id: 'item-2', name: 'Anestesia', unit: 'ampolla', stock: 3, minStock: 10 },
      ],
    },
    upcomingAppointments: [
      {
        id: 'apt-1',
        patientId: 'aaaaaaaa-1111-2222-3333-444444444444',
        providerId: 'staff-1',
        start: '2026-07-24T14:00:00.000Z',
        end: '2026-07-24T14:30:00.000Z',
        status: 'CONFIRMED',
      },
    ],
    patientCount: 42,
    ...overrides,
  };
}

function emptyDashboard(): Dashboard {
  return dashboard({
    incomes: {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-24T00:00:00.000Z',
      currency: 'USD',
      totalConverted: 0,
      count: 0,
      byCurrency: {},
    },
    lowStockItems: { count: 0, items: [] },
    upcomingAppointments: [],
    patientCount: 0,
  });
}

/** A promise this test controls the settlement of, to assert on the interim (pending) state — same helper as agenda-view.test.tsx. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('DashboardView', () => {
  beforeEach(() => {
    mockedGetDashboard.mockReset();
    mockedListCurrencies.mockReset();
    mockedListCurrencies.mockResolvedValue([
      { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
      { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    ]);
  });

  it('renders the 4 cards (incomes, low stock, upcoming appointments, patient count) with fetched data', async () => {
    mockedGetDashboard.mockResolvedValue(dashboard());

    render(<DashboardView token="tok" />);

    await screen.findByText('Ingresos del período');
    // Incomes: totalConverted formatted as currency (Intl.NumberFormat('es', {style:'currency'})) + count + byCurrency breakdown.
    // `getByText`'s default normalizer collapses the formatter's non-breaking
    // space (U+00A0, between the amount and the "US$" symbol) into a plain
    // ASCII space when reading DOM text — but it does NOT run that same
    // normalization over the string passed in as the matcher, so the literal
    // Intl output (which still has the NBSP) must be normalized by hand here
    // too, or the comparison never matches.
    const totalFormatted = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD' })
      .format(1250.5)
      .replace(/ /g, ' ');
    expect(screen.getByText(totalFormatted)).toBeInTheDocument();
    expect(screen.getByText('12 abonos')).toBeInTheDocument();
    expect(screen.getByText('COP')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();

    // Low stock: count + item rows. `getByText('Bajo stock')` would match
    // twice (the card heading AND the table's sr-only caption) — scope to
    // the heading role.
    expect(screen.getByRole('heading', { name: 'Bajo stock' })).toBeInTheDocument();
    expect(screen.getByText('2 ítems')).toBeInTheDocument();
    expect(screen.getByText('Guantes de nitrilo')).toBeInTheDocument();
    expect(screen.getByText('Anestesia')).toBeInTheDocument();

    // Upcoming appointments: at least one row with a status badge.
    expect(screen.getByText('Próximas citas')).toBeInTheDocument();
    expect(screen.getByText('Confirmada')).toBeInTheDocument();

    // Patient count.
    expect(screen.getByText('# Pacientes')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('fetches with the default from/to/currency on mount, then refetches with the new params when the range changes', async () => {
    mockedGetDashboard.mockResolvedValue(dashboard());

    render(<DashboardView token="tok" />);
    await waitFor(() => expect(mockedGetDashboard).toHaveBeenCalledTimes(1));
    const [, firstParams] = mockedGetDashboard.mock.calls[0];
    expect(firstParams.currency).toBe('USD');
    expect(firstParams.from).toMatch(/^\d{4}-\d{2}-01$/);
    // Default "Hasta" is today, but the backend's incomes/payments-totals
    // query is half-open `[from, to)` — the component must send an exclusive
    // upper bound (today + 1 day) so today's payments aren't silently excluded.
    const today = new Date();
    const tomorrow = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1));
    const expectedTomorrow = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;
    expect(firstParams.to).toBe(expectedTomorrow);

    mockedGetDashboard.mockClear();
    const fromInput = screen.getByLabelText('Desde');
    // A single `fireEvent.change` (rather than `userEvent.type`, which fires
    // one change event per keystroke — each of which is itself a distinct
    // `from` value and therefore its own refetch, per this component's
    // effect) so the assertion below can pin down exactly one resulting call.
    fireEvent.change(fromInput, { target: { value: '2026-06-01' } });

    await waitFor(() => expect(mockedGetDashboard).toHaveBeenCalledTimes(1));
    const [, params] = mockedGetDashboard.mock.calls[0];
    expect(params.from).toBe('2026-06-01');
  });

  it('sends an exclusive (+1 day) "to" bound when the user changes "Hasta", while the input keeps showing the selected inclusive date', async () => {
    mockedGetDashboard.mockResolvedValue(dashboard());

    render(<DashboardView token="tok" />);
    await waitFor(() => expect(mockedGetDashboard).toHaveBeenCalledTimes(1));

    mockedGetDashboard.mockClear();
    const toInput = screen.getByLabelText('Hasta') as HTMLInputElement;
    fireEvent.change(toInput, { target: { value: '2026-07-10' } });

    await waitFor(() => expect(mockedGetDashboard).toHaveBeenCalledTimes(1));
    const [, params] = mockedGetDashboard.mock.calls[0];
    expect(params.to).toBe('2026-07-11');
    // The input itself still reflects the user's selected (inclusive) date.
    expect(toInput.value).toBe('2026-07-10');
  });

  it('refetches with the new currency when the currency select changes', async () => {
    mockedGetDashboard.mockResolvedValue(dashboard());
    const user = userEvent.setup();

    render(<DashboardView token="tok" />);
    await waitFor(() => expect(mockedGetDashboard).toHaveBeenCalledTimes(1));

    mockedGetDashboard.mockClear();
    // CurrencySelect (Task 11) replaces the old free-text currency input —
    // pick an option instead of typing, once its options (from the mocked
    // `listCurrencies`) have loaded in.
    const currencySelect = screen.getByLabelText<HTMLSelectElement>('Moneda');
    await waitFor(() => expect(currencySelect.querySelector('option[value="COP"]')).not.toBeNull());
    await user.selectOptions(currencySelect, 'COP');

    await waitFor(() => expect(mockedGetDashboard).toHaveBeenCalledTimes(1));
    const [, params] = mockedGetDashboard.mock.calls[0];
    expect(params.currency).toBe('COP');
  });

  it('shows a loading skeleton while the request is in flight', async () => {
    const pending = deferred<Dashboard>();
    mockedGetDashboard.mockReturnValue(pending.promise);

    render(<DashboardView token="tok" />);

    expect(screen.getByRole('status', { name: /cargando panel/i })).toBeInTheDocument();
    expect(screen.queryByText('# Pacientes')).not.toBeInTheDocument();

    pending.resolve(dashboard());
    await screen.findByText('# Pacientes');
    expect(screen.queryByRole('status', { name: /cargando panel/i })).not.toBeInTheDocument();
  });

  it('renders empty-states for low stock (0) and upcoming appointments (0), and 0 for incomes/patients', async () => {
    mockedGetDashboard.mockResolvedValue(emptyDashboard());

    render(<DashboardView token="tok" />);

    await screen.findByText('# Pacientes');
    expect(screen.getByText('0 abonos')).toBeInTheDocument();
    expect(screen.getByText('No hay ítems en bajo stock.')).toBeInTheDocument();
    expect(screen.getByText('No hay citas próximas.')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows a graceful access-denied message (not a crash) on a 403, with a retry that re-fetches', async () => {
    mockedGetDashboard.mockRejectedValueOnce(new ApiError(403, 'Forbidden'));
    const user = userEvent.setup();

    render(<DashboardView token="tok" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No tienes acceso a este panel.');
    expect(screen.queryByText('# Pacientes')).not.toBeInTheDocument();

    mockedGetDashboard.mockResolvedValueOnce(dashboard());
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    await screen.findByText('# Pacientes');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
