import { render, screen, within } from '@testing-library/react';
import { PerioExamEditor } from './perio-exam-editor';
import {
  finalizePerioExam,
  getPerioExam,
  savePerioMeasures,
  type PerioExamDetail,
} from '@/lib/perio/perio-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/perio/perio-api', () => ({
  ...jest.requireActual('../../lib/perio/perio-api'),
  getPerioExam: jest.fn(),
  savePerioMeasures: jest.fn(),
  finalizePerioExam: jest.fn(),
}));

const mockedGet = getPerioExam as jest.MockedFunction<typeof getPerioExam>;
const mockedSave = savePerioMeasures as jest.MockedFunction<typeof savePerioMeasures>;
const mockedFinalize = finalizePerioExam as jest.MockedFunction<typeof finalizePerioExam>;

const INDICES = {
  sitesExamined: 0,
  bopPercent: 0,
  plaquePercent: 0,
  sites4mmOrMore: 0,
  sites6mmOrMore: 0,
};

function exam(overrides: Partial<PerioExamDetail> = {}): PerioExamDetail {
  return {
    id: 'e1',
    tenantId: 't1',
    patientId: 'p1',
    providerId: 'u1',
    providerName: 'Dra. Laura Gómez',
    examDate: '2026-10-16',
    notes: null,
    status: 'DRAFT',
    finalizedAt: null,
    createdAt: '2026-10-16T15:00:00.000Z',
    updatedAt: '2026-10-16T15:00:00.000Z',
    indices: INDICES,
    sites: [],
    teeth: [],
    ...overrides,
  };
}

function site(
  toothFdi: number,
  s: 'MB' | 'B' | 'DB',
  probingMm: number,
  recessionMm: number | null = null,
) {
  return {
    toothFdi,
    site: s,
    probingMm,
    recessionMm,
    calMm: probingMm + (recessionMm ?? 0),
    furcation: null,
    bleeding: false,
    suppuration: false,
    plaque: false,
    calculus: false,
  };
}

function renderEditor(previous: { id: string; examDate: string } | null = null) {
  const onChanged = jest.fn();
  const onBack = jest.fn();
  render(
    <PerioExamEditor
      token="tok"
      patientId="p1"
      examId="e1"
      previous={previous}
      onBack={onBack}
      onChanged={onChanged}
    />,
  );
  return { onChanged, onBack };
}

describe('PerioExamEditor', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
    mockedFinalize.mockReset();
  });

  it('carga con esqueleto y muestra error con reintento', async () => {
    const user = setupUser();
    mockedGet.mockRejectedValueOnce(new ApiError(404, 'Examen periodontal no encontrado'));
    mockedGet.mockResolvedValueOnce(exam());
    renderEditor();
    expect(screen.getByRole('status', { name: /cargando examen/i })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Examen periodontal no encontrado');
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText('Examen del 16/10/2026')).toBeInTheDocument();
  });

  it('captura rápida: un dígito fija el valor y salta al siguiente sitio; las flechas navegan', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(exam());
    renderEditor();
    const upper = await screen.findByRole('table', { name: 'Arcada superior' });
    // Primera celda de la fila vestibular superior: 18, sitio distal.
    const first = within(upper).getByRole('textbox', { name: 'Sondaje 18 DB' });
    await user.click(first);
    await user.keyboard('325');
    expect(first).toHaveValue('3');
    expect(within(upper).getByRole('textbox', { name: 'Sondaje 18 B' })).toHaveValue('2');
    expect(within(upper).getByRole('textbox', { name: 'Sondaje 18 MB' })).toHaveValue('5');
    // Tras el tercer dígito, el foco pasó al primer sitio del 17.
    expect(within(upper).getByRole('textbox', { name: 'Sondaje 17 DB' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(within(upper).getByRole('textbox', { name: 'Sondaje 18 MB' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    // Abajo: misma columna en la fila de palatino (superior → «P»).
    expect(within(upper).getByRole('textbox', { name: 'Sondaje 18 MP' })).toHaveFocus();
    expect(screen.getByText('Tienes cambios sin guardar.')).toBeInTheDocument();
  });

  it('sondaje ≥4 mm en rojo (token de peligro) y NIC = sondaje + recesión', async () => {
    mockedGet.mockResolvedValue(exam({ sites: [site(16, 'MB', 5, 2), site(16, 'B', 3)] }));
    renderEditor();
    const upper = await screen.findByRole('table', { name: 'Arcada superior' });
    const deep = within(upper).getByRole('textbox', { name: 'Sondaje 16 MB' });
    const shallow = within(upper).getByRole('textbox', {
      name: 'Sondaje 16 B',
    });
    expect(deep).toHaveClass('text-danger');
    expect(deep).toHaveAttribute('data-danger', 'true');
    expect(shallow).not.toHaveClass('text-danger');
    // NIC del 16 MB: 5 + 2.
    const calRow = within(upper)
      .getAllByRole('row')
      .find((r) => r.textContent?.startsWith('NIC'));
    expect(calRow).toHaveTextContent('7');
  });

  it('«-» y un dígito dan recesión negativa; «+» y un dígito, 10–19 mm', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(exam());
    renderEditor();
    const upper = await screen.findByRole('table', { name: 'Arcada superior' });
    await user.click(within(upper).getByRole('textbox', { name: 'Recesión 18 DB' }));
    await user.keyboard('-2');
    expect(within(upper).getByRole('textbox', { name: 'Recesión 18 DB' })).toHaveValue('-2');
    await user.click(within(upper).getByRole('textbox', { name: 'Sondaje 11 B' }));
    await user.keyboard('+2');
    expect(within(upper).getByRole('textbox', { name: 'Sondaje 11 B' })).toHaveValue('12');
  });

  it('«Guardar» envía solo lo tocado y deja el estado guardado', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(exam());
    mockedSave.mockResolvedValue(exam({ sites: [site(18, 'DB', 4)] }));
    const { onChanged } = renderEditor();
    const upper = await screen.findByRole('table', { name: 'Arcada superior' });
    await user.click(within(upper).getByRole('textbox', { name: 'Sondaje 18 DB' }));
    await user.keyboard('4');
    await user.keyboard('{ArrowLeft}b');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mockedSave).toHaveBeenCalledWith('tok', 'p1', 'e1', {
      sites: [
        {
          toothFdi: 18,
          site: 'DB',
          probingMm: 4,
          recessionMm: null,
          furcation: null,
          bleeding: true,
          suppuration: false,
          plaque: false,
          calculus: false,
        },
      ],
      teeth: [],
    });
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('muestra el 400 del servidor sin perder lo escrito', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(exam());
    mockedSave.mockRejectedValue(
      new ApiError(400, 'Diente 18, sitio DB: el sondaje debe ser un entero entre 0 y 19 mm'),
    );
    renderEditor();
    const upper = await screen.findByRole('table', { name: 'Arcada superior' });
    await user.click(within(upper).getByRole('textbox', { name: 'Sondaje 18 DB' }));
    await user.keyboard('4');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/el sondaje debe ser un entero/)).toBeInTheDocument();
    expect(within(upper).getByRole('textbox', { name: 'Sondaje 18 DB' })).toHaveValue('4');
  });

  it('«Finalizar» pide confirmación y deja el examen en solo lectura', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(exam());
    mockedFinalize.mockResolvedValue(
      exam({ status: 'FINAL', finalizedAt: '2026-10-16T16:00:00.000Z' }),
    );
    renderEditor();
    await user.click(await screen.findByRole('button', { name: 'Finalizar examen' }));
    const dialog = screen.getByRole('dialog', {
      name: '¿Finalizar el examen?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Finalizar' }));
    expect(mockedFinalize).toHaveBeenCalledWith('tok', 'p1', 'e1');
    expect(await screen.findByText(/solo lectura/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('un examen FINAL es de solo lectura: las teclas no cambian nada', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(
      exam({
        status: 'FINAL',
        finalizedAt: '2026-10-16T16:00:00.000Z',
        sites: [site(16, 'MB', 5)],
      }),
    );
    renderEditor();
    const upper = await screen.findByRole('table', { name: 'Arcada superior' });
    const cell = within(upper).getByRole('textbox', { name: 'Sondaje 16 MB' });
    expect(cell).toHaveAttribute('readonly');
    await user.click(cell);
    await user.keyboard('2');
    expect(cell).toHaveValue('5');
    expect(within(upper).getByRole('button', { name: 'Omitir diente 16' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Finalizar examen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Tienes cambios sin guardar.')).not.toBeInTheDocument();
  });

  it('omitir un diente lo saca de la captura y de los índices', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(exam({ sites: [site(18, 'DB', 6)] }));
    renderEditor();
    const upper = await screen.findByRole('table', { name: 'Arcada superior' });
    const indices = screen.getByRole('region', { name: 'Índices' });
    expect(within(indices).getByText('Sitios ≥ 6 mm').nextSibling).toHaveTextContent('1');
    await user.click(within(upper).getByRole('button', { name: 'Omitir diente 18' }));
    expect(within(indices).getByText('Sitios ≥ 6 mm').nextSibling).toHaveTextContent('0');
    expect(within(upper).getByRole('textbox', { name: 'Sondaje 18 DB' })).toHaveAttribute(
      'readonly',
    );
  });

  it('compara con el examen anterior: valor previo e índice de mejora por sitio', async () => {
    const user = setupUser();
    mockedGet.mockImplementation((_t, _p, id) =>
      Promise.resolve(
        id === 'e0'
          ? exam({
              id: 'e0',
              examDate: '2026-04-15',
              status: 'FINAL',
              sites: [site(16, 'MB', 7), site(16, 'B', 2)],
              indices: { ...INDICES, bopPercent: 60, sites6mmOrMore: 1 },
            })
          : exam({ sites: [site(16, 'MB', 4), site(16, 'B', 3)] }),
      ),
    );
    renderEditor({ id: 'e0', examDate: '2026-04-15' });
    await user.click(
      await screen.findByRole('checkbox', {
        name: /comparar con el examen anterior \(15\/04\/2026\)/i,
      }),
    );
    const upper = screen.getByRole('table', { name: 'Arcada superior' });
    const better = await within(upper).findByLabelText('Anterior 16 MB: 7 mm, mejora');
    expect(better).toHaveAttribute('data-trend', 'better');
    expect(within(upper).getByLabelText('Anterior 16 B: 2 mm, empeora')).toHaveAttribute(
      'data-trend',
      'worse',
    );
    const indices = screen.getByRole('region', { name: 'Índices' });
    expect(within(indices).getByText('Anterior: 60 %')).toBeInTheDocument();
  });
});
