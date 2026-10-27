import { configure, render, screen, within } from '@testing-library/react';
import { PerioExamEditor } from './perio-exam-editor';
import {
  finalizePerioExam,
  deletePerioExam,
  getPerioExam,
  savePerioMeasures,
  type PerioExamDetail,
} from '@/lib/perio/perio-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { regionalFormat } from '@/lib/format/regional-format';
import type { SedeFormatState } from '@/lib/locations/use-sede-format';

jest.mock('../../lib/perio/perio-api', () => ({
  ...jest.requireActual('../../lib/perio/perio-api'),
  getPerioExam: jest.fn(),
  savePerioMeasures: jest.fn(),
  finalizePerioExam: jest.fn(),
  deletePerioExam: jest.fn(),
}));

// La rejilla tiene ~1000 controles: una sola consulta `findByRole` sobre ella
// cuesta ~0,8 s en jsdom, casi el 1 s por defecto de los `findBy*`. Con la CPU
// compartida (suite completa, CI de 2 vCPU) se pasaría sin que nada vaya mal.
// 5 s explícitos en este fichero (OPS-002); `configure` sólo afecta a este
// fichero, que tiene su propia instancia de Testing Library.
configure({ asyncUtilTimeout: 5_000 });

const mockedGet = getPerioExam as jest.MockedFunction<typeof getPerioExam>;
const mockedSave = savePerioMeasures as jest.MockedFunction<typeof savePerioMeasures>;
const mockedFinalize = finalizePerioExam as jest.MockedFunction<typeof finalizePerioExam>;
const mockedDelete = deletePerioExam as jest.MockedFunction<typeof deletePerioExam>;

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

const DE_DE: SedeFormatState = { status: 'ready', fmt: regionalFormat({ locale: 'de-DE', hourCycle: 'h23' }) };

function renderEditor(
  previous: { id: string; examDate: string } | null = null,
  sedeFormat: SedeFormatState = DE_DE,
) {
  const onChanged = jest.fn();
  const onBack = jest.fn();
  const onDeleted = jest.fn();
  render(
    <PerioExamEditor
      token="tok"
      patientId="p1"
      examId="e1"
      previous={previous}
      onBack={onBack}
      onChanged={onChanged}
      onDeleted={onDeleted}
      sedeFormat={sedeFormat}
    />,
  );
  return { onChanged, onBack, onDeleted };
}

describe('PerioExamEditor', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
    mockedFinalize.mockReset();
    mockedDelete.mockReset();
  });

  it('mientras se guarda la rejilla queda bloqueada: lo tecleado no se pierde en silencio', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(exam());
    let resolveSave: (value: PerioExamDetail) => void = () => undefined;
    mockedSave.mockReturnValue(
      new Promise<PerioExamDetail>((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderEditor();
    const upper = await screen.findByRole('table', { name: 'Arcada superior' });
    await user.click(within(upper).getByRole('textbox', { name: 'Sondaje 18 DB' }));
    await user.keyboard('4');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    // En vuelo: la celda siguiente no admite cambios.
    const next = within(upper).getByRole('textbox', { name: 'Sondaje 17 DB' });
    expect(next).toHaveAttribute('readonly');
    await user.click(next);
    await user.keyboard('7');
    expect(next).toHaveValue('');
    resolveSave(exam({ sites: [site(18, 'DB', 4)] }));
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    expect(next).not.toHaveAttribute('readonly');
    await user.click(next);
    await user.keyboard('7');
    expect(next).toHaveValue('7');
  });

  it('409 al finalizar (ya finalizado en otra pestaña): recarga y queda en solo lectura', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValueOnce(exam());
    mockedGet.mockResolvedValueOnce(
      exam({ status: 'FINAL', finalizedAt: '2026-10-16T16:00:00.000Z' }),
    );
    mockedFinalize.mockRejectedValue(new ApiError(409, 'El examen está finalizado'));
    renderEditor();
    await user.click(await screen.findByRole('button', { name: 'Finalizar examen' }));
    const dialog = screen.getByRole('dialog', { name: '¿Finalizar el examen?' });
    await user.click(within(dialog).getByRole('button', { name: 'Finalizar' }));
    expect(
      await screen.findByText(
        'Este examen ya se finalizó en otra sesión: ahora se muestra en solo lectura.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Examen finalizado: solo lectura/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finalizar examen' })).not.toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('«Eliminar borrador» pide confirmación y borra', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(exam());
    mockedDelete.mockResolvedValue(undefined);
    const { onDeleted } = renderEditor();
    await user.click(await screen.findByRole('button', { name: 'Eliminar borrador' }));
    const dialog = screen.getByRole('dialog', { name: '¿Eliminar el borrador?' });
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    expect(mockedDelete).toHaveBeenCalledWith('tok', 'p1', 'e1');
    expect(onDeleted).toHaveBeenCalled();
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
    expect(screen.queryByRole('button', { name: 'Eliminar borrador' })).not.toBeInTheDocument();
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

  it('perio percent en-US 12.5% and de-DE 12,5 % (índices con el formato de la sede)', async () => {
    mockedGet.mockResolvedValue(exam());
    renderEditor(null, { status: 'ready', fmt: regionalFormat({ locale: 'en-US', hourCycle: 'h12' }) });
    const indices = await screen.findByRole('region', { name: 'Índices' });
    expect(indices).toHaveTextContent(/\d%/);
    expect(indices).not.toHaveTextContent(/\d\s%/);
  });

  it('sin formato de la sede: índices «—» y el aviso con Reintentar', async () => {
    const retry = jest.fn();
    mockedGet.mockResolvedValue(exam());
    renderEditor(null, { status: 'error', message: 'No se pudo saber el formato regional o el reloj de la sede. Vuelve a intentarlo o revisa la sede en Ajustes → Sedes.', retry });
    const indices = await screen.findByRole('region', { name: 'Índices' });
    expect(indices).not.toHaveTextContent('%');
    expect(indices).toHaveTextContent('—');
    expect(screen.getByText(/No se pudo saber el formato regional o el reloj de la sede/)).toBeInTheDocument();
    await setupUser().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalled();
  });
});
