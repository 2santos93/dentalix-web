import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OdontogramTab } from './odontogram-tab';
import { Toaster } from '@/components/errors/toaster';
import { listCatalogItems } from '@/lib/odontogram/catalog-api';
import {
  getOdontogram,
  addToothRecord,
  getToothTimeline,
  getDentition,
  recordDentitionEvents,
  type DentitionView,
} from '@/lib/odontogram/odontogram-api';

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
  getDentition: jest.fn(),
  recordDentitionEvents: jest.fn(),
  voidToothRecord: jest.fn(),
  VOID_REASON_MAX: 500,
}));

const mockedListCatalog = listCatalogItems as jest.MockedFunction<typeof listCatalogItems>;
const mockedGetOdontogram = getOdontogram as jest.MockedFunction<typeof getOdontogram>;
const mockedAddRecord = addToothRecord as jest.MockedFunction<typeof addToothRecord>;
const mockedGetTimeline = getToothTimeline as jest.MockedFunction<typeof getToothTimeline>;
const mockedGetDentition = getDentition as jest.MockedFunction<typeof getDentition>;
const mockedRecordDentition = recordDentitionEvents as jest.MockedFunction<typeof recordDentitionEvents>;

const POSITIONS = [1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((p) => `${q}${p}`));

/** Dentición de la API: `of(position)` decide cada posición. */
function dentitionView(
  of: (position: string) => 'PERMANENT' | 'PRIMARY' | 'MIXED',
  overall: 'PERMANENT' | 'PRIMARY' | 'MIXED' = 'PERMANENT',
  ageYears: number | null = null,
): DentitionView {
  return {
    basis: ageYears === null ? 'DEFAULT' : 'AGE',
    ageYears,
    overall,
    asOf: null,
    positions: POSITIONS.map((position) => ({
      position,
      dentition: of(position),
      source: ageYears === null ? 'DEFAULT' : 'AGE',
      lastEvent: null,
    })),
  };
}

const adult = dentitionView(() => 'PERMANENT');
// Niño de 7 años: incisivos mudando, primeros molares permanentes, el resto temporal.
const child7 = dentitionView(
  (p) => (Number(p[1]) <= 2 ? 'MIXED' : Number(p[1]) === 6 ? 'PERMANENT' : 'PRIMARY'),
  'MIXED',
  7,
);

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
    mockedGetDentition.mockReset();
    mockedRecordDentition.mockReset();
    mockedGetDentition.mockResolvedValue(adult);
  });

  it('shows the full-page loading status only on the initial load', () => {
    mockedGetOdontogram.mockReturnValue(new Promise(() => {}));
    mockedListCatalog.mockReturnValue(new Promise(() => {}));
    render(<OdontogramTab token="tok" patientId="p1" />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando odontograma/i);
  });

  it('dibuja la dentición mixta de un niño de 7 años y pinta un registro en el 64 (sin aviso de «no aparecen»)', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    mockedGetDentition.mockResolvedValue(child7);
    mockedGetOdontogram.mockResolvedValue([
      { toothNumber: '64', records: [{ ...createdRecord, id: 'rec-64', toothNumber: '64' }] },
    ]);

    render(<OdontogramTab token="tok" patientId="p1" />);

    const chart = await screen.findByRole('group', { name: /^Odontograma$/ });
    expect(within(chart).getByRole('group', { name: 'Diente 64 (temporal), 1 registro, cara oclusal' })).toBeInTheDocument();
    expect(within(chart).getByRole('group', { name: 'Diente 51 (temporal), sano' })).toBeInTheDocument();
    expect(within(chart).getByRole('group', { name: 'Diente 11, sano' })).toBeInTheDocument();
    expect(screen.queryByText(/no aparecen en el mapa/i)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Mixta' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Según la edad (7 años)')).toBeInTheDocument();
  });

  it('la leyenda distingue «Hecho en la clínica», «Ya presente» y «Otro profesional»', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    mockedGetOdontogram.mockResolvedValue([]);
    render(<OdontogramTab token="tok" patientId="p1" />);
    const origins = await screen.findByRole('list', { name: 'Origen de los registros' });
    expect(within(origins).getByText('Hecho en la clínica')).toBeInTheDocument();
    expect(within(origins).getByText('Ya presente')).toBeInTheDocument();
    expect(within(origins).getByText('Otro profesional')).toBeInTheDocument();
  });

  it('carta vacía: sana, con la indicación para empezar', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    mockedGetOdontogram.mockResolvedValue([]);
    render(<OdontogramTab token="tok" patientId="p1" />);
    expect(await screen.findByText(/aún no hay registros: la carta está sana/i)).toBeInTheDocument();
  });

  it('avisa de los registros en dientes que la dentición actual no dibuja (el 55 ya exfoliado) y lleva a su historial', async () => {
    const user = userEvent.setup();
    mockedListCatalog.mockResolvedValue(catalog);
    mockedGetTimeline.mockResolvedValue([]);
    mockedGetOdontogram.mockResolvedValue([
      { toothNumber: '55', records: [{ ...createdRecord, id: 'rec-55', toothNumber: '55' }] },
    ]);
    render(<OdontogramTab token="tok" patientId="p1" />);

    const notice = await screen.findByText(/no se dibuja el diente 55/i);
    expect(notice).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver el historial del diente 55' }));
    expect(await screen.findByRole('heading', { name: 'Diente 55' })).toBeInTheDocument();
    // No se puede registrar en él sin cambiar la dentición.
    expect(screen.queryByRole('form', { name: /registrar en el diente 55/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no está en la boca según la dentición actual/i)).toBeInTheDocument();
  });

  it('«Cambiar dentición» envía las posiciones marcadas y recarga la carta', async () => {
    const user = userEvent.setup();
    mockedListCatalog.mockResolvedValue(catalog);
    mockedGetOdontogram.mockResolvedValue([]);
    mockedGetDentition.mockResolvedValue(child7);
    mockedRecordDentition.mockResolvedValue([]);
    render(<OdontogramTab token="tok" patientId="p1" />);

    await user.click(await screen.findByRole('button', { name: 'Cambiar dentición' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cambiar dentición' });
    await user.click(within(dialog).getByRole('checkbox', { name: /^Posición 15,/ }));
    await user.selectOptions(within(dialog).getByLabelText('Motivo'), 'EXFOLIATION');
    expect(within(dialog).getByRole('radio', { name: 'Permanente' })).toBeChecked();
    expect(within(dialog).getByRole('radio', { name: 'Mixta' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar dentición' }));

    expect(mockedRecordDentition).toHaveBeenCalledWith('tok', 'p1', {
      positions: ['15'],
      dentition: 'PERMANENT',
      reason: 'EXFOLIATION',
    });
    await waitFor(() => expect(mockedGetDentition).toHaveBeenCalledTimes(2));
  });

  it('el conmutador pasa toda la carta a temporal tras confirmar', async () => {
    const user = userEvent.setup();
    mockedListCatalog.mockResolvedValue(catalog);
    mockedGetOdontogram.mockResolvedValue([]);
    mockedRecordDentition.mockResolvedValue([]);
    render(<OdontogramTab token="tok" patientId="p1" />);

    await user.click(await screen.findByRole('radio', { name: 'Temporal' }));
    const dialog = await screen.findByRole('dialog', { name: /dentición temporal/i });
    await user.click(within(dialog).getByRole('button', { name: 'Cambiar la carta' }));
    expect(mockedRecordDentition).toHaveBeenCalledWith(
      'tok',
      'p1',
      expect.objectContaining({ dentition: 'PRIMARY', reason: 'MANUAL' }),
    );
    expect(mockedRecordDentition.mock.calls[0][2].positions).toHaveLength(32);
  });

  it('«Ver la carta al» recarga a esa fecha en solo lectura, con aviso y sin acciones', async () => {
    const user = userEvent.setup();
    mockedListCatalog.mockResolvedValue(catalog);
    mockedGetTimeline.mockResolvedValue([]);
    mockedGetOdontogram.mockResolvedValue(initialGroups);
    render(<OdontogramTab token="tok" patientId="p1" initialTooth="11" />);

    await screen.findByRole('form', { name: /registrar en el diente 11/i });
    const date = screen.getByLabelText('Ver la carta al');
    await user.type(date, '2026-10-05');

    await waitFor(() => expect(mockedGetOdontogram).toHaveBeenLastCalledWith('tok', 'p1', '2026-10-05'));
    expect(mockedGetDentition).toHaveBeenLastCalledWith('tok', 'p1', '2026-10-05');
    expect(await screen.findByText(/carta al 05\/10\/2026 · solo lectura/i)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: /registrar en el diente 11/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cambiar dentición' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Temporal' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Volver a hoy' }));
    await waitFor(() => expect(mockedGetOdontogram).toHaveBeenLastCalledWith('tok', 'p1', undefined));
  });

  it('shows an alert with a retry when the initial load fails', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGetOdontogram.mockRejectedValue(new ApiError(500, 'Error del servidor'));
    mockedListCatalog.mockResolvedValue(catalog);
    render(<OdontogramTab token="tok" patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el odontograma.');
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

  it('surfaces a failed background refresh as a toast with a retry, keeping the already-loaded chart on screen (rung 3, not a full-page error)', async () => {
    mockedListCatalog.mockResolvedValue(catalog);
    mockedGetTimeline.mockResolvedValue([]);
    mockedAddRecord.mockResolvedValue(createdRecord);

    let callCount = 0;
    mockedGetOdontogram.mockImplementation(() => {
      callCount += 1;
      // First call (initial load) succeeds; the second call (the post-add
      // refresh) fails.
      return callCount === 1 ? Promise.resolve(initialGroups) : Promise.reject(new Error('boom'));
    });

    const user = userEvent.setup();
    render(
      <>
        <OdontogramTab token="tok" patientId="p1" />
        <Toaster />
      </>,
    );

    const chart = await screen.findByRole('group', { name: /odontograma/i });
    await user.click(screen.getByRole('button', { name: '11' }));
    await screen.findByRole('radio', { name: /caries/i });
    await user.click(screen.getByRole('radio', { name: /caries/i }));
    await user.click(screen.getByRole('checkbox', { name: /oclusal/i }));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedGetOdontogram).toHaveBeenCalledTimes(2));

    // The failed refresh surfaces as a toast with a retry action — the
    // already-loaded chart stays mounted, and there's no full-page error.
    const retryButton = await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.getByRole('group', { name: /odontograma/i })).toBe(chart);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Clicking the toast's retry re-triggers the fetch.
    mockedGetOdontogram.mockResolvedValueOnce(refreshedGroups);
    await user.click(retryButton);
    await waitFor(() => expect(mockedGetOdontogram).toHaveBeenCalledTimes(3));
  });
});
