import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalesView } from './sales-view';
import { ApiError } from '@/lib/api/client';
import { getSalesTotals, listSales, voidSale } from '@/lib/sales/sales-api';
import type { Sale, SalesTotals } from '@/lib/sales/sales-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching dashboard-view.test.tsx's / treatment-plans-tab.test.tsx's
// convention.
jest.mock('../../lib/sales/sales-api', () => ({
  getSalesTotals: jest.fn(),
  listSales: jest.fn(),
  voidSale: jest.fn(),
}));

const mockedGetSalesTotals = getSalesTotals as jest.MockedFunction<typeof getSalesTotals>;
const mockedListSales = listSales as jest.MockedFunction<typeof listSales>;
const mockedVoidSale = voidSale as jest.MockedFunction<typeof voidSale>;

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 'sale-1',
    patientId: 'aaaaaaaa-1111-2222-3333-444444444444',
    currency: 'USD',
    total: 150,
    paidAt: '2026-07-15T14:00:00.000Z',
    paymentMethod: 'CASH',
    notes: null,
    createdById: 'user-1',
    createdAt: '2026-07-15T14:00:00.000Z',
    updatedAt: '2026-07-15T14:00:00.000Z',
    ...overrides,
  };
}

function totals(overrides: Partial<SalesTotals> = {}): SalesTotals {
  return {
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-07-24T00:00:00.000Z',
    currency: 'USD',
    totalConverted: 1250.5,
    count: 12,
    byCurrency: { COP: 500000, USD: 30 },
    ...overrides,
  };
}

/** A promise this test controls the settlement of, to assert on the interim (pending) state — same helper as dashboard-view.test.tsx. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SalesView', () => {
  beforeEach(() => {
    mockedGetSalesTotals.mockReset();
    mockedListSales.mockReset();
    mockedVoidSale.mockReset();
  });

  it('renders the period total card and the sales table from fetched data', async () => {
    mockedGetSalesTotals.mockResolvedValue(totals());
    mockedListSales.mockResolvedValue([sale()]);

    render(<SalesView token="tok" />);

    await screen.findByText('Total del período');
    // totalConverted formatted as currency (Intl.NumberFormat('es', {style:'currency'})).
    // `getByText`'s default normalizer collapses the formatter's non-breaking
    // space into a plain ASCII space when reading DOM text, but not over the
    // matcher string itself — normalize by hand (same fix as
    // dashboard-view.test.tsx).
    const totalFormatted = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD' })
      .format(1250.5)
      .replace(/\u00A0/g, ' ');
    expect(screen.getByText(totalFormatted)).toBeInTheDocument();
    expect(screen.getByText('12 ventas')).toBeInTheDocument();
    expect(screen.getByText('COP')).toBeInTheDocument();

    const table = screen.getByRole('table', { name: 'Ventas' });
    expect(within(table).getByText('aaaaaaaa-1111-2222-3333-444444444444')).toBeInTheDocument();
    expect(within(table).getByText('Efectivo')).toBeInTheDocument();
    const rowTotal = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD' })
      .format(150)
      .replace(/\u00A0/g, ' ');
    expect(within(table).getByText(rowTotal)).toBeInTheDocument();
  });

  it('renders "—" for a sale with no patient and no payment method', async () => {
    mockedGetSalesTotals.mockResolvedValue(totals({ count: 1, byCurrency: {} }));
    mockedListSales.mockResolvedValue([sale({ patientId: null, paymentMethod: null })]);

    render(<SalesView token="tok" />);

    const table = await screen.findByRole('table', { name: 'Ventas' });
    // Two "—" fallbacks (patient + method) inside the row.
    expect(within(table).getAllByText('—')).toHaveLength(2);
  });

  it('shows an empty state when there are no sales in the period', async () => {
    mockedGetSalesTotals.mockResolvedValue(totals({ count: 0, byCurrency: {} }));
    mockedListSales.mockResolvedValue([]);

    render(<SalesView token="tok" />);

    await screen.findByText('No hay ventas en este período.');
    expect(screen.queryByRole('table', { name: 'Ventas' })).not.toBeInTheDocument();
  });

  it('fetches with the default from/to (inclusive "Hasta" +1 day)/currency on mount, then refetches both when the range changes', async () => {
    mockedGetSalesTotals.mockResolvedValue(totals());
    mockedListSales.mockResolvedValue([sale()]);

    render(<SalesView token="tok" />);
    await waitFor(() => expect(mockedGetSalesTotals).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedListSales).toHaveBeenCalledTimes(1));

    const [, totalsParams] = mockedGetSalesTotals.mock.calls[0];
    const [, listParams] = mockedListSales.mock.calls[0];
    expect(totalsParams.currency).toBe('USD');
    expect(totalsParams.from).toMatch(/^\d{4}-\d{2}-01$/);
    // Default "Hasta" is today, but the backend range is half-open
    // `[from, to)` — the component must send an exclusive upper bound
    // (today + 1 day) for BOTH totals and list.
    const today = new Date();
    const tomorrow = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1));
    const expectedTomorrow = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;
    expect(totalsParams.to).toBe(expectedTomorrow);
    expect(listParams?.to).toBe(expectedTomorrow);

    mockedGetSalesTotals.mockClear();
    mockedListSales.mockClear();
    const toInput = screen.getByLabelText('Hasta') as HTMLInputElement;
    fireEvent.change(toInput, { target: { value: '2026-07-10' } });

    await waitFor(() => expect(mockedGetSalesTotals).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedListSales).toHaveBeenCalledTimes(1));
    const [, newTotalsParams] = mockedGetSalesTotals.mock.calls[0];
    const [, newListParams] = mockedListSales.mock.calls[0];
    expect(newTotalsParams.to).toBe('2026-07-11');
    expect(newListParams?.to).toBe('2026-07-11');
    // The input itself still reflects the user's selected (inclusive) date.
    expect(toInput.value).toBe('2026-07-10');
  });

  it('refetches both with the new currency when the currency input changes, uppercased', async () => {
    mockedGetSalesTotals.mockResolvedValue(totals());
    mockedListSales.mockResolvedValue([sale()]);

    render(<SalesView token="tok" />);
    await waitFor(() => expect(mockedGetSalesTotals).toHaveBeenCalledTimes(1));

    mockedGetSalesTotals.mockClear();
    mockedListSales.mockClear();
    const currencyInput = screen.getByLabelText('Moneda');
    fireEvent.change(currencyInput, { target: { value: 'cop' } });

    await waitFor(() => expect(mockedGetSalesTotals).toHaveBeenCalledTimes(1));
    const [, params] = mockedGetSalesTotals.mock.calls[0];
    expect(params.currency).toBe('COP');
  });

  it('shows a loading skeleton while the request is in flight', async () => {
    const pending = deferred<SalesTotals>();
    mockedGetSalesTotals.mockReturnValue(pending.promise);
    mockedListSales.mockResolvedValue([]);

    render(<SalesView token="tok" />);

    expect(screen.getByRole('status', { name: /cargando ventas/i })).toBeInTheDocument();
    expect(screen.queryByText('Total del período')).not.toBeInTheDocument();

    pending.resolve(totals());
    await screen.findByText('Total del período');
    expect(screen.queryByRole('status', { name: /cargando ventas/i })).not.toBeInTheDocument();
  });

  it('shows a graceful access-denied message (not a crash) on a 403, with a retry that re-fetches', async () => {
    mockedGetSalesTotals.mockRejectedValueOnce(new ApiError(403, 'Forbidden'));
    mockedListSales.mockResolvedValue([]);
    const user = userEvent.setup();

    render(<SalesView token="tok" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No tienes acceso a las ventas.');
    expect(screen.queryByText('Total del período')).not.toBeInTheDocument();

    mockedGetSalesTotals.mockResolvedValueOnce(totals());
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    await screen.findByText('Total del período');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('voiding a sale calls voidSale then refreshes totals + list in place — the row stays disabled until the refetch lands, table stays mounted', async () => {
    mockedGetSalesTotals.mockResolvedValue(totals());
    mockedVoidSale.mockResolvedValue(undefined);

    const refetch = deferred<Sale[]>();
    let callCount = 0;
    mockedListSales.mockImplementation(() => {
      callCount += 1;
      return callCount === 1 ? Promise.resolve([sale()]) : refetch.promise;
    });

    const user = userEvent.setup();
    render(<SalesView token="tok" />);

    const table = await screen.findByRole('table', { name: 'Ventas' });
    const row = within(table).getByText('Efectivo').closest('tr') as HTMLTableRowElement;
    const voidButton = within(row).getByRole('button', { name: /anular/i });

    await user.click(voidButton);

    await waitFor(() => expect(mockedVoidSale).toHaveBeenCalledWith('tok', 'sale-1'));
    await waitFor(() => expect(mockedListSales).toHaveBeenCalledTimes(2));
    // Still the same table node while the refetch is pending — no remount.
    expect(screen.getByRole('table', { name: 'Ventas' })).toBe(table);
    expect(within(row).getByRole('button', { name: /anulando/i })).toBeDisabled();

    refetch.resolve([]);

    await waitFor(() => expect(screen.queryByRole('table', { name: 'Ventas' })).not.toBeInTheDocument());
    expect(screen.getByText('No hay ventas en este período.')).toBeInTheDocument();
  });
});
