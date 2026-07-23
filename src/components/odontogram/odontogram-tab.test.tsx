import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OdontogramTab } from './odontogram-tab';
import { listCatalogItems } from '@/lib/odontogram/catalog-api';
import { getOdontogram, addToothRecord, getToothTimeline } from '@/lib/odontogram/odontogram-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching tooth-record-panel.test.tsx's convention. A single
// mock here covers every import of the same module across
// odontogram-tab.tsx / tooth-timeline.tsx / tooth-record-panel.tsx (they all
// resolve to the same absolute file).
jest.mock('../../lib/odontogram/catalog-api', () => ({
  listCatalogItems: jest.fn(),
}));
jest.mock('../../lib/odontogram/odontogram-api', () => ({
  getOdontogram: jest.fn(),
  addToothRecord: jest.fn(),
  getToothTimeline: jest.fn(),
}));

const mockedListCatalog = listCatalogItems as jest.MockedFunction<typeof listCatalogItems>;
const mockedGetOdontogram = getOdontogram as jest.MockedFunction<typeof getOdontogram>;
const mockedAddRecord = addToothRecord as jest.MockedFunction<typeof addToothRecord>;
const mockedGetTimeline = getToothTimeline as jest.MockedFunction<typeof getToothTimeline>;

const catalog = [
  {
    id: 'cat-1',
    tenantId: 't1',
    code: 'CAR',
    category: null,
    kind: 'DIAGNOSIS' as const,
    labelEs: 'Caries',
    labelEn: null,
    labelPt: null,
    color: '#FF0000',
    defaultPrice: null,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const initialGroups = [{ toothNumber: '11', records: [] }];

const createdRecord = {
  id: 'rec-1',
  toothNumber: '11',
  surfaces: ['OCCLUSAL' as const],
  kind: 'DIAGNOSIS' as const,
  catalogItemId: 'cat-1',
  status: 'COMPLETED' as const,
  notes: null,
  recordedAt: '2026-03-01T00:00:00.000Z',
};

const refreshedGroups = [{ toothNumber: '11', records: [createdRecord] }];

/** A promise this test controls the settlement of, to assert on the interim (pending) state. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('OdontogramTab', () => {
  beforeEach(() => {
    mockedListCatalog.mockReset();
    mockedGetOdontogram.mockReset();
    mockedAddRecord.mockReset();
    mockedGetTimeline.mockReset();
  });

  it('shows the full-page loading status only on the initial load', () => {
    mockedGetOdontogram.mockReturnValue(new Promise(() => {}));
    mockedListCatalog.mockReturnValue(new Promise(() => {}));
    render(<OdontogramTab token="tok" patientId="p1" />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando odontograma/i);
  });

  it('shows an alert with a retry when the initial load fails', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGetOdontogram.mockRejectedValue(new ApiError(500, 'Error del servidor'));
    mockedListCatalog.mockResolvedValue(catalog);
    render(<OdontogramTab token="tok" patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Error del servidor');
  });

  it('keeps the chart and the tooth-record panel mounted (no full-page reload flash) on the refetch after a successful add', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    mockedGetTimeline.mockResolvedValue([]);
    mockedAddRecord.mockResolvedValue(createdRecord);

    // First call (initial load) resolves immediately; the second call (the
    // post-add refresh) is controlled manually so the test can assert on
    // the interim "refreshing" state before it settles.
    const refetch = deferred<typeof refreshedGroups>();
    let callCount = 0;
    mockedGetOdontogram.mockImplementation(() => {
      callCount += 1;
      return callCount === 1 ? Promise.resolve(initialGroups) : refetch.promise;
    });

    const user = userEvent.setup();
    render(<OdontogramTab token="tok" patientId="p1" />);

    // Initial load: full-page status, then the chart appears.
    expect(screen.getByRole('status')).toHaveTextContent(/cargando odontograma/i);
    const chart = await screen.findByRole('group', { name: /odontograma/i });

    // Select tooth 11 -> timeline + record panel mount.
    await user.click(screen.getByRole('button', { name: '11' }));
    await screen.findByRole('radio', { name: /caries/i });
    const guardarButton = screen.getByRole('button', { name: /guardar/i });

    // Fill and submit the record form.
    await user.click(screen.getByRole('radio', { name: /caries/i }));
    await user.click(screen.getByRole('checkbox', { name: /oclusal/i }));
    await user.click(guardarButton);

    await waitFor(() => expect(mockedAddRecord).toHaveBeenCalledTimes(1));
    // The refetch (reloadKey bump) has started (2nd getOdontogram call is
    // pending on `refetch`), but the full-page "cargando odontograma" status
    // must NOT reappear, and the chart / panel must stay mounted.
    await waitFor(() => expect(mockedGetOdontogram).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/cargando odontograma/i)).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /odontograma/i })).toBe(chart);
    expect(screen.getByRole('button', { name: /guardar/i })).toBe(guardarButton);
    // Non-blocking background-refresh indicator is shown instead.
    expect(await screen.findByText(/actualizando/i)).toBeInTheDocument();

    // Settle the refetch — the indicator clears, chart/panel are still the
    // same mounted nodes (never unmounted at any point above).
    refetch.resolve(refreshedGroups);
    await waitFor(() => expect(screen.queryByText(/actualizando/i)).not.toBeInTheDocument());
    expect(screen.getByRole('group', { name: /odontograma/i })).toBe(chart);
    expect(screen.getByRole('button', { name: /guardar/i })).toBe(guardarButton);
    expect(screen.queryByText(/cargando odontograma/i)).not.toBeInTheDocument();
  });
});
