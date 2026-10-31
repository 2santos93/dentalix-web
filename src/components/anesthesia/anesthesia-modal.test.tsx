import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnesthesiaModal, anesthesiaCopy } from './anesthesia-modal';
import {
  checkAnesthesiaDose,
  getEntryAnesthesia,
  listAnesthetics,
  loadSampleAnesthetics,
  recordAnesthesia,
  type AnesthesiaCheck,
  type AnesthesiaDoseSummary,
  type AnesthesiaDoseWindow,
  type AnestheticProduct,
  type EntryAnesthesia,
} from '@/lib/anesthesia/anesthesia-api';

jest.mock('../../lib/anesthesia/anesthesia-api', () => ({
  ...jest.requireActual('../../lib/anesthesia/anesthesia-api'),
  getEntryAnesthesia: jest.fn(),
  listAnesthetics: jest.fn(),
  checkAnesthesiaDose: jest.fn(),
  recordAnesthesia: jest.fn(),
  loadSampleAnesthetics: jest.fn(),
}));

const mocked = {
  entry: getEntryAnesthesia as jest.MockedFunction<typeof getEntryAnesthesia>,
  catalog: listAnesthetics as jest.MockedFunction<typeof listAnesthetics>,
  check: checkAnesthesiaDose as jest.MockedFunction<typeof checkAnesthesiaDose>,
  record: recordAnesthesia as jest.MockedFunction<typeof recordAnesthesia>,
  samples: loadSampleAnesthetics as jest.MockedFunction<typeof loadSampleAnesthetics>,
};

const ARTI: AnestheticProduct = {
  id: 'a-arti',
  name: 'Articaína 4 % con epinefrina 1:100.000',
  activeIngredient: 'Articaína',
  concentrationPct: 4,
  vasoconstrictor: 'Epinefrina 1:100.000',
  mlPerCarpule: 1.7,
  maxMgPerKg: 7,
  maxAbsoluteMg: 500,
  sampleCode: 'ARTICAINE_4_EPI',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function doseSummary(overrides: Partial<AnesthesiaDoseSummary> = {}): AnesthesiaDoseSummary {
  return {
    rulesVersion: 'ANESTHESIA_DOSE_V2',
    weightKg: 20,
    totalMg: 0,
    byAnesthetic: [],
    percent: 0,
    level: 'OK',
    alerts: [],
    ...overrides,
  };
}

function doseWindow(overrides: Partial<AnesthesiaDoseWindow> = {}): AnesthesiaDoseWindow {
  return {
    hours: 24,
    from: '2026-10-29T15:00:00.000Z',
    to: '2026-10-31T15:00:00.000Z',
    parts: [],
    pendingMg: null,
    ...overrides,
  };
}

/** Lo que el paciente recibió hoy en OTRA evolución y sede (DX-418). */
const OTHER_ENTRY_PART: AnesthesiaDoseWindow['parts'][number] = {
  clinicalEntryId: 'e0',
  current: false,
  authorId: 'u2',
  authorName: 'Dr. Luis Pérez',
  locationId: 'l2',
  locationName: 'Sede Norte',
  firstAdministeredAt: '2026-10-30T13:00:00.000Z',
  lastAdministeredAt: '2026-10-30T13:00:00.000Z',
  carpules: 3,
  mg: 108,
  percent: 77,
};

function entry(overrides: Partial<EntryAnesthesia> = {}): EntryAnesthesia {
  return {
    records: [],
    summary: doseSummary(),
    ageYears: 8,
    weightRequired: false,
    window: doseWindow(),
    ...overrides,
  };
}

function checkResult(summary: Partial<AnesthesiaDoseSummary>, extra: Partial<AnesthesiaCheck> = {}): AnesthesiaCheck {
  return {
    summary: doseSummary(summary),
    ageYears: 8,
    weightSource: 'ANAMNESIS',
    weightRequired: false,
    window: doseWindow(),
    ...extra,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof AnesthesiaModal>> = {}) {
  return render(
    <AnesthesiaModal
      open
      onOpenChange={jest.fn()}
      token="t"
      patientId="p1"
      entryId="e1"
      entryDateLabel="30/10/2026"
      canRecord
      canManageCatalog={false}
      clock={null}
      onRecorded={jest.fn()}
      {...props}
    />,
  );
}

async function fill(user: ReturnType<typeof userEvent.setup>, carpules: string) {
  await user.selectOptions(await screen.findByLabelText(anesthesiaCopy.anesthetic), ARTI.id);
  await user.type(screen.getByLabelText(anesthesiaCopy.carpules), carpules);
}

describe('AnesthesiaModal (DX-307)', () => {
  beforeEach(() => {
    Object.values(mocked).forEach((m) => m.mockReset());
    mocked.entry.mockResolvedValue(entry());
    mocked.catalog.mockResolvedValue([ARTI]);
  });

  it('al 146 % bloquea: sin confirmación y motivo no envía; con ellos manda el overrideReason', async () => {
    const user = userEvent.setup();
    mocked.check.mockResolvedValue(
      checkResult({
        totalMg: 204,
        percent: 146,
        level: 'EXCEEDED',
        alerts: [
          {
            code: 'DOSE_OVER_MAX',
            severity: 'BLOCKING',
            message: 'Dosis máxima superada: 204 mg de 140 mg (146 %) para 20 kg.',
            source: 'Malamed',
          },
        ],
      }),
    );
    mocked.record.mockResolvedValue({} as never);
    renderModal();
    await fill(user, '3');
    expect(await screen.findByText(/204 mg de 140 mg \(146 %\)/)).toBeInTheDocument();
    expect(mocked.check).toHaveBeenLastCalledWith('t', 'p1', 'e1', { anestheticId: ARTI.id, carpules: 3 });

    await user.click(screen.getByRole('button', { name: anesthesiaCopy.submit }));
    expect(await screen.findByText(anesthesiaCopy.confirmRequired)).toBeInTheDocument();
    expect(screen.getByText(anesthesiaCopy.reasonTooShort)).toBeInTheDocument();
    expect(mocked.record).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: anesthesiaCopy.confirm }));
    await user.type(screen.getByLabelText(anesthesiaCopy.reasonLabel), 'Exodoncia compleja valorada');
    await user.click(screen.getByRole('button', { name: anesthesiaCopy.submit }));
    await waitFor(() => expect(mocked.record).toHaveBeenCalled());
    expect(mocked.record.mock.calls[0][3]).toEqual(
      expect.objectContaining({
        anestheticId: ARTI.id,
        carpules: 3,
        technique: 'INFILTRATION',
        overrideReason: 'Exodoncia compleja valorada',
      }),
    );
  });

  it('al 86 % solo avisa y guarda sin motivo', async () => {
    const user = userEvent.setup();
    mocked.check.mockResolvedValue(checkResult({ totalMg: 120, percent: 86, level: 'WARNING' }));
    mocked.record.mockResolvedValue({} as never);
    renderModal();
    await fill(user, '1,5');
    expect(await screen.findByText(/Cerca de la dosis máxima/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: anesthesiaCopy.submit }));
    await waitFor(() => expect(mocked.record).toHaveBeenCalled());
    expect(mocked.record.mock.calls[0][3]).not.toHaveProperty('overrideReason');
    expect(mocked.record.mock.calls[0][3]).toHaveProperty('carpules', 1.5);
  });

  it('alergia a anestésicos: muestra el aviso y exige confirmación aunque la dosis sea baja', async () => {
    const user = userEvent.setup();
    mocked.check.mockResolvedValue(
      checkResult({
        totalMg: 68,
        percent: 49,
        alerts: [
          {
            code: 'ALLERGY_ANESTHETIC',
            severity: 'BLOCKING',
            message: 'Alergia en la anamnesis a un anestésico de la misma familia: Articaína (alergia anotada: Lidocaína).',
            source: 'Anamnesis',
          },
        ],
      }),
    );
    renderModal();
    await fill(user, '1');
    expect(await screen.findByText(/alergia anotada: Lidocaína/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: anesthesiaCopy.confirm })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: anesthesiaCopy.submit }));
    expect(await screen.findByText(anesthesiaCopy.confirmRequired)).toBeInTheDocument();
    expect(mocked.record).not.toHaveBeenCalled();
  });

  it('menor de 12 años sin peso: pide el peso antes de guardar y lo manda', async () => {
    const user = userEvent.setup();
    mocked.entry.mockResolvedValue(
      entry({ weightRequired: true, summary: doseSummary({ weightKg: null, percent: null, level: 'NO_WEIGHT' }) }),
    );
    mocked.check.mockImplementation((_t, _p, _e, input) =>
      Promise.resolve(
        input.weightKg
          ? checkResult({ weightKg: input.weightKg, totalMg: 68, percent: 37 }, { weightSource: 'ENTERED' })
          : checkResult(
              { weightKg: null, percent: null, level: 'NO_WEIGHT', totalMg: 68 },
              { weightRequired: true, weightSource: null },
            ),
      ),
    );
    mocked.record.mockResolvedValue({} as never);
    renderModal();
    await fill(user, '1');
    const weight = await screen.findByLabelText(anesthesiaCopy.weight);
    expect(screen.getByText(anesthesiaCopy.weightHintRequired)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(anesthesiaCopy.checking)).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: anesthesiaCopy.submit }));
    expect(await screen.findByText(anesthesiaCopy.weightRequired)).toBeInTheDocument();
    expect(mocked.record).not.toHaveBeenCalled();

    await user.type(weight, '18,5');
    await waitFor(() => expect(screen.getByText(/37 % del máximo/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: anesthesiaCopy.submit }));
    await waitFor(() => expect(mocked.record).toHaveBeenCalled());
    expect(mocked.record.mock.calls[0][3]).toHaveProperty('weightKg', 18.5);
  });

  it('con peso de la anamnesis el campo sigue ahí para anotar el pesado hoy, y dice qué peso se usa', async () => {
    const user = userEvent.setup();
    mocked.check.mockImplementation(async (_t, _p, _e, input) =>
      input.weightKg
        ? checkResult({ weightKg: input.weightKg, totalMg: 68, percent: 45 }, { weightSource: 'ENTERED' })
        : checkResult({ weightKg: 20, totalMg: 68, percent: 34 }),
    );
    mocked.record.mockResolvedValue({} as never);
    renderModal();
    await fill(user, '1');
    const weight = await screen.findByLabelText(anesthesiaCopy.weight);
    expect(await screen.findByText(anesthesiaCopy.weightHintUsing(20, 'ANAMNESIS'))).toBeInTheDocument();
    await user.type(weight, '15');
    await waitFor(() => expect(mocked.check).toHaveBeenLastCalledWith('t', 'p1', 'e1', expect.objectContaining({ weightKg: 15 })));
    await user.click(screen.getByRole('button', { name: anesthesiaCopy.submit }));
    await waitFor(() => expect(mocked.record).toHaveBeenCalled());
    expect(mocked.record.mock.calls[0][3]).toHaveProperty('weightKg', 15);
  });

  it('carpules inválidos: no previsualiza y el formulario dice por qué', async () => {
    const user = userEvent.setup();
    renderModal();
    await fill(user, '0,3');
    await user.click(screen.getByRole('button', { name: anesthesiaCopy.submit }));
    expect(await screen.findByText(anesthesiaCopy.carpulesInvalid)).toBeInTheDocument();
    expect(mocked.check).not.toHaveBeenCalled();
  });

  it('catálogo vacío: el ADMIN carga los sugeridos', async () => {
    const user = userEvent.setup();
    mocked.catalog.mockResolvedValueOnce([]).mockResolvedValue([ARTI]);
    mocked.samples.mockResolvedValue([ARTI]);
    renderModal({ canManageCatalog: true });
    await user.click(await screen.findByRole('button', { name: anesthesiaCopy.loadSamples }));
    expect(mocked.samples).toHaveBeenCalled();
    expect(await screen.findByLabelText(anesthesiaCopy.anesthetic)).toBeInTheDocument();
  });

  it('la asistente solo ve lo registrado (sin formulario)', async () => {
    renderModal({ canRecord: false });
    expect(await screen.findByText(anesthesiaCopy.noneRecorded)).toBeInTheDocument();
    expect(screen.queryByLabelText(anesthesiaCopy.anesthetic)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: anesthesiaCopy.submit })).not.toBeInTheDocument();
  });

  it('error al cargar: estado de error con reintento', async () => {
    const user = userEvent.setup();
    mocked.entry.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(entry());
    renderModal();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText(anesthesiaCopy.noneRecorded)).toBeInTheDocument();
  });

  describe('DX-418 · acumulado del paciente en las últimas 24 h', () => {
    it('sin anestesia en esta evolución, enseña lo que recibió hoy en otra, con profesional y sede', async () => {
      mocked.entry.mockResolvedValue(
        entry({
          summary: doseSummary({ totalMg: 108, percent: 77 }),
          window: doseWindow({ parts: [OTHER_ENTRY_PART] }),
        }),
      );
      renderModal();
      const bar = await screen.findByRole('region', { name: 'Acumulado del paciente en las últimas 24 h' });
      expect(bar).toHaveTextContent('108 mg · 77 % del máximo');
      const breakdown = screen.getByRole('list', { name: 'Desglose por evolución y profesional' });
      expect(breakdown).toHaveTextContent('Otra evolución · Dr. Luis Pérez · Sede Norte');
      expect(breakdown).toHaveTextContent('3 carp. · 108 mg (77 %)');
    });

    it('caso del criterio: 3 + 3 carpules en dos evoluciones → 154 %, bloqueo y la dosis nueva aparte', async () => {
      const user = userEvent.setup();
      mocked.check.mockResolvedValue(
        checkResult(
          {
            totalMg: 216,
            percent: 154,
            level: 'EXCEEDED',
            alerts: [
              {
                code: 'DOSE_OVER_MAX',
                severity: 'BLOCKING',
                message: 'Dosis máxima superada: 216 mg de 140 mg (154 %) para 20 kg.',
                source: 'Malamed',
              },
            ],
          },
          { window: doseWindow({ parts: [OTHER_ENTRY_PART], pendingMg: 108 }) },
        ),
      );
      renderModal();
      await fill(user, '3');
      expect(await screen.findByText(/216 mg de 140 mg \(154 %\)/)).toBeInTheDocument();
      expect(screen.getByText('Esta dosis, sin guardar: 108 mg')).toBeInTheDocument();
      expect(screen.getByText(/Dr. Luis Pérez · Sede Norte/)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: anesthesiaCopy.confirm })).toBeInTheDocument();
    });

    it('mientras calcula, la barra dice que calcula; si falla, dice por qué, no deja registrar y se reintenta', async () => {
      const user = userEvent.setup();
      let rejectFirst!: (err: Error) => void;
      mocked.check
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              rejectFirst = reject;
            }),
        )
        .mockResolvedValue(checkResult({ totalMg: 68, percent: 49 }));
      renderModal();
      await fill(user, '1');
      expect(await screen.findByText(anesthesiaCopy.checking)).toBeInTheDocument();
      await waitFor(() => expect(mocked.check).toHaveBeenCalledTimes(1));
      rejectFirst(new Error('red'));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(anesthesiaCopy.checkError);
      // Sin acumulado ni avisos a la vista no se registra a ciegas.
      expect(screen.getByRole('button', { name: anesthesiaCopy.submit })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByText(/68 mg · 49 % del máximo/)).toBeInTheDocument();
    });
  });
});
