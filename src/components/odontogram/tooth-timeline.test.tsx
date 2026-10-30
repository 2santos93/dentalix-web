import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToothTimeline } from './tooth-timeline';
import { getToothTimeline, voidToothRecord } from '@/lib/odontogram/odontogram-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching medical-history-panel.test.tsx's convention.
jest.mock('../../lib/odontogram/odontogram-api', () => ({
  getToothTimeline: jest.fn(),
  voidToothRecord: jest.fn(),
  VOID_REASON_MAX: 500,
}));

const mockedGetTimeline = getToothTimeline as jest.MockedFunction<typeof getToothTimeline>;
const mockedVoid = voidToothRecord as jest.MockedFunction<typeof voidToothRecord>;

const catalogById = new Map([
  ['cat-1', { color: '#FF0000', labelEs: 'Caries', kind: 'DIAGNOSIS' as const }],
  ['cat-2', { color: '#00FF00', labelEs: 'Resina', kind: 'PROCEDURE' as const }],
]);

const older = {
  id: 'rec-1',
  toothNumber: '11',
  surfaces: ['OCCLUSAL' as const],
  kind: 'DIAGNOSIS' as const,
  catalogItemId: 'cat-1',
  status: 'PLANNED' as const,
  notes: 'Revisar en próxima cita',
  recordedAt: '2026-01-01T00:00:00.000Z',
};

const newer = {
  id: 'rec-2',
  toothNumber: '11',
  surfaces: [],
  kind: 'PROCEDURE' as const,
  catalogItemId: 'cat-2',
  status: 'COMPLETED' as const,
  notes: null,
  recordedAt: '2026-02-01T00:00:00.000Z',
};

describe('ToothTimeline', () => {
  beforeEach(() => {
    mockedGetTimeline.mockReset();
    mockedVoid.mockReset();
  });

  it('shows a loading state while fetching', () => {
    mockedGetTimeline.mockReturnValue(new Promise(() => {}));
    render(
      <ToothTimeline token="tok" patientId="p1" toothNumber="11" catalogById={catalogById} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
  });

  it('shows an empty state when the tooth has no records', async () => {
    mockedGetTimeline.mockResolvedValue([]);
    render(
      <ToothTimeline token="tok" patientId="p1" toothNumber="11" catalogById={catalogById} />,
    );
    expect(await screen.findByText(/no hay registros/i)).toBeInTheDocument();
  });

  it('renders records in the order returned by the backend (DESC), most recent first', async () => {
    // Backend contract: getToothTimeline already returns DESC by recordedAt.
    // The component must not re-sort — it renders newer, older in that order.
    mockedGetTimeline.mockResolvedValue([newer, older]);
    render(
      <ToothTimeline token="tok" patientId="p1" toothNumber="11" catalogById={catalogById} />,
    );

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Resina')).toBeInTheDocument();
    expect(within(items[1]).getByText('Caries')).toBeInTheDocument();
  });

  it('shows the catalog label, color swatch, surfaces, status and notes for each record', async () => {
    mockedGetTimeline.mockResolvedValue([older]);
    render(
      <ToothTimeline token="tok" patientId="p1" toothNumber="11" catalogById={catalogById} />,
    );

    const item = (await screen.findAllByRole('listitem'))[0];
    expect(within(item).getByText('Caries')).toBeInTheDocument();
    expect(within(item).getByText(/oclusal/i)).toBeInTheDocument();
    expect(within(item).getByText(/planificado/i)).toBeInTheDocument();
    expect(within(item).getByText('Revisar en próxima cita')).toBeInTheDocument();
  });

  it('refetches when refreshKey changes', async () => {
    mockedGetTimeline.mockResolvedValue([older]);
    const { rerender } = render(
      <ToothTimeline
        token="tok"
        patientId="p1"
        toothNumber="11"
        catalogById={catalogById}
        refreshKey={0}
      />,
    );
    await screen.findAllByRole('listitem');
    expect(mockedGetTimeline).toHaveBeenCalledTimes(1);

    rerender(
      <ToothTimeline
        token="tok"
        patientId="p1"
        toothNumber="11"
        catalogById={catalogById}
        refreshKey={1}
      />,
    );
    await screen.findAllByRole('listitem');
    expect(mockedGetTimeline).toHaveBeenCalledTimes(2);
  });

  it('refetches when the selected tooth changes', async () => {
    mockedGetTimeline.mockResolvedValue([older]);
    const { rerender } = render(
      <ToothTimeline token="tok" patientId="p1" toothNumber="11" catalogById={catalogById} />,
    );
    await screen.findAllByRole('listitem');

    rerender(
      <ToothTimeline token="tok" patientId="p1" toothNumber="21" catalogById={catalogById} />,
    );
    await screen.findAllByRole('listitem');
    expect(mockedGetTimeline).toHaveBeenCalledTimes(2);
    expect(mockedGetTimeline).toHaveBeenLastCalledWith('tok', 'p1', '21');
  });

  it('shows an alert with the API error message when loading fails', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGetTimeline.mockRejectedValue(new ApiError(500, 'Error del servidor'));
    render(
      <ToothTimeline token="tok" patientId="p1" toothNumber="11" catalogById={catalogById} />,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el historial del diente.');
  });

  it('reads as a dated clinical list: a <time> per row, hairline separation, no card per record', async () => {
    mockedGetTimeline.mockResolvedValue([newer, older]);
    const { container } = render(
      <ToothTimeline token="tok" patientId="p1" toothNumber="11" catalogById={catalogById} />,
    );

    const list = await screen.findByRole('list', { name: /historial del diente 11/i });
    expect(list.tagName).toBe('OL');
    expect(list.className).toContain('divide-y');

    // Dates are machine-readable and tabular so the column aligns.
    const times = container.querySelectorAll('time');
    expect(times).toHaveLength(2);
    expect(times[0]).toHaveAttribute('dateTime', newer.recordedAt);
    expect(times[0].className).toContain('tabular-nums');

    // DESIGN.md: "not a decorated card stack" — rows carry no border/background
    // of their own.
    for (const item of screen.getAllByRole('listitem')) {
      expect(item.className).not.toMatch(/\bborder\b|\brounded-lg\b|\bbg-surface\b/);
    }
  });

  it('marks the status as a semantic chip and omits the notes line when there are none', async () => {
    mockedGetTimeline.mockResolvedValue([newer, older]);
    render(<ToothTimeline token="tok" patientId="p1" toothNumber="11" catalogById={catalogById} />);

    const items = await screen.findAllByRole('listitem');

    // COMPLETED -> success tint; PLANNED -> warning tint (status only, never decoration).
    expect(within(items[0]).getByText('Completado').className).toContain('text-success-text');
    expect(within(items[1]).getByText('Planificado').className).toContain('text-warning-text');

    // `newer` has no notes: no em-dash placeholder row.
    expect(within(items[0]).queryByText('—')).not.toBeInTheDocument();
    expect(within(items[1]).getByText('Revisar en próxima cita')).toBeInTheDocument();
  });

  it('labels a whole-tooth record instead of listing surfaces', async () => {
    mockedGetTimeline.mockResolvedValue([newer]);
    render(<ToothTimeline token="tok" patientId="p1" toothNumber="11" catalogById={catalogById} />);

    const item = (await screen.findAllByRole('listitem'))[0];
    expect(within(item).getByText('Diente completo')).toBeInTheDocument();
  });
});

describe('ToothTimeline — origen y anulación (DX-120)', () => {
  const voided = {
    ...older,
    id: 'rec-v',
    performedById: 'u-1',
    performedByName: 'Dra. Autora',
    void: {
      id: 'void-1',
      reason: 'Registrado en el diente equivocado',
      performedById: 'u-2',
      performedByName: 'Dr. Admin',
      recordedAt: '2026-01-10T15:00:00.000Z',
    },
  };
  const brought = { ...newer, id: 'rec-o', origin: 'PRE_EXISTING' as const, performedById: 'u-1' };

  beforeEach(() => {
    mockedGetTimeline.mockReset();
    mockedVoid.mockReset();
  });

  it('muestra el anulado tachado, con motivo y autor, y el origen de lo que no es de la clínica', async () => {
    mockedGetTimeline.mockResolvedValue([brought, voided]);
    render(<ToothTimeline token="tok" patientId="p1" toothNumber="11" catalogById={catalogById} />);

    const items = await screen.findAllByRole('listitem');
    const voidedItem = items[1];
    expect(voidedItem).toHaveAttribute('data-voided', 'true');
    expect(within(voidedItem).getByText('Anulado')).toBeInTheDocument();
    expect(within(voidedItem).getByText('Caries')).toHaveClass('line-through');
    expect(voidedItem).toHaveTextContent(/Anulado por Dr\. Admin el \d{2}\/\d{2}\/2026/);
    expect(voidedItem).toHaveTextContent('Registrado en el diente equivocado');
    expect(within(items[0]).getByText('Ya presente')).toBeInTheDocument();
  });

  it('ofrece «Anular» solo en lo vigente que el usuario puede anular, y nunca en solo lectura', async () => {
    mockedGetTimeline.mockResolvedValue([brought, voided]);
    const { rerender } = render(
      <ToothTimeline
        token="tok"
        patientId="p1"
        toothNumber="11"
        catalogById={catalogById}
        canVoid={(r) => r.performedById === 'u-1'}
      />,
    );
    expect(await screen.findAllByRole('button', { name: /^Anular/ })).toHaveLength(1);

    rerender(
      <ToothTimeline
        token="tok"
        patientId="p1"
        toothNumber="11"
        catalogById={catalogById}
        canVoid={() => true}
        readOnly
      />,
    );
    expect(screen.queryByRole('button', { name: /^Anular/ })).not.toBeInTheDocument();
  });

  it('anular pide el motivo, lo envía y avisa para refrescar la carta', async () => {
    const user = userEvent.setup();
    mockedGetTimeline.mockResolvedValue([brought]);
    mockedVoid.mockResolvedValue({ ...brought, id: 'void-2', voidsRecordId: 'rec-o' });
    const onVoided = jest.fn();
    render(
      <ToothTimeline
        token="tok"
        patientId="p1"
        toothNumber="11"
        catalogById={catalogById}
        canVoid={() => true}
        onVoided={onVoided}
      />,
    );
    await user.click(await screen.findByRole('button', { name: /^Anular/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Anular registro' });

    await user.click(within(dialog).getByRole('button', { name: 'Anular registro' }));
    expect(await within(dialog).findByText('Escribe el motivo de la anulación.')).toBeInTheDocument();
    expect(mockedVoid).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Motivo'), 'Diente equivocado');
    await user.click(within(dialog).getByRole('button', { name: 'Anular registro' }));

    expect(mockedVoid).toHaveBeenCalledWith('tok', 'p1', 'rec-o', 'Diente equivocado');
    expect(onVoided).toHaveBeenCalled();
  });

  it('en una carta a una fecha muestra el historial de entonces', async () => {
    mockedGetTimeline.mockResolvedValue([newer, voided]);
    render(
      <ToothTimeline
        token="tok"
        patientId="p1"
        toothNumber="11"
        catalogById={catalogById}
        asOf="2026-01-05"
      />,
    );
    const items = await screen.findAllByRole('listitem');
    // `newer` es de febrero: no existía. La anulación (10 de enero) tampoco.
    expect(items).toHaveLength(1);
    expect(items[0]).not.toHaveAttribute('data-voided');
  });
});
