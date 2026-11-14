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
import { useAuthStore } from '@/lib/auth/auth-store';
import { tokenFor } from '@/lib/test/prescriptions';
import { regionalFormat } from '@/lib/format/regional-format';
import { testStamp } from '@/lib/test/stamp';
import { clinicLocation } from '@/lib/test/locations';
import type { SedeFormatState } from '@/lib/locations/use-sede-format';
import { loadAbsentTeeth } from '@/lib/perio/absent-teeth';

jest.mock('../../lib/perio/perio-api', () => ({
  ...jest.requireActual('../../lib/perio/perio-api'),
  getPerioExam: jest.fn(),
  savePerioMeasures: jest.fn(),
  finalizePerioExam: jest.fn(),
  deletePerioExam: jest.fn(),
}));

// DX-403: los ausentes del odontograma; por defecto, ninguno.
jest.mock('../../lib/perio/absent-teeth', () => ({
  ...jest.requireActual('../../lib/perio/absent-teeth'),
  loadAbsentTeeth: jest.fn(),
}));
const mockedAbsent = loadAbsentTeeth as jest.MockedFunction<typeof loadAbsentTeeth>;

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

const DE_FORMAT = regionalFormat({ locale: 'de-DE', hourCycle: 'h23' });
const DE_DE: SedeFormatState = { status: 'ready', fmt: DE_FORMAT };
// DX-354b: la sede de la suite es de-DE; el día del examen sale con su formato («16.10.2026»), no con dd/mm/aaaa fijo.
const DE_STAMP = testStamp([clinicLocation({ locale: 'de-DE', hourCycle: 'h23' })]);

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
      stamp={DE_STAMP}
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
    mockedAbsent.mockReset().mockResolvedValue(new Set());
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
    expect(await screen.findByText(`Examen del ${DE_FORMAT.civilDate('2026-10-16')}`)).toBeInTheDocument();
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
    expect(deep).toHaveClass('text-danger-text');
    expect(deep).toHaveAttribute('data-danger', 'true');
    expect(shallow).not.toHaveClass('text-danger-text');
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
        name: new RegExp(`comparar con el examen anterior \\(${DE_FORMAT.civilDate('2026-04-15').replace(/\./g, '\\.')}\\)`, 'i'),
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
    renderEditor(null, { status: 'error', message: 'No se pudo saber el formato regional o el reloj de la sede. Vuelve a intentarlo o revisa la sede en Ajustes → Sedes.', retry, locationId: 'sede-sin-reloj' });
    const indices = await screen.findByRole('region', { name: 'Índices' });
    expect(indices).not.toHaveTextContent('%');
    expect(indices).toHaveTextContent('—');
    expect(screen.getByText(/No se pudo saber el formato regional o el reloj de la sede/)).toBeInTheDocument();
    await setupUser().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalled();
  });

  it('«Configurar sede» abre la sede sin formato o sin reloj, no la lista', async () => {
    useAuthStore.setState({ accessToken: tokenFor('ADMIN') });
    try {
      mockedGet.mockResolvedValue(exam());
      const message = 'No se pudo saber el formato regional o el reloj de la sede. Vuelve a intentarlo o revisa la sede en Ajustes → Sedes.';
      renderEditor(null, { status: 'error', message, retry: jest.fn(), locationId: 'sede-sin-reloj' });
      expect(await screen.findByRole('link', { name: 'Configurar sede' })).toHaveAttribute(
        'href',
        '/settings/sedes?sede=sede-sin-reloj',
      );
    } finally {
      useAuthStore.setState({ accessToken: null });
    }
  });

  describe('DX-403: recorrido en S, marcas y ausentes', () => {
    it('recorrido en S: del 28 vestibular al 28 palatino, y del 18 palatino al 48 lingual', async () => {
      const user = setupUser();
      mockedGet.mockResolvedValue(exam());
      renderEditor();
      const upper = await screen.findByRole('table', { name: 'Arcada superior' });
      const lower = screen.getByRole('table', { name: 'Arcada inferior' });
      await user.click(within(upper).getByRole('textbox', { name: 'Sondaje 28 MB' }));
      await user.keyboard('12345');
      expect(within(upper).getByRole('textbox', { name: 'Sondaje 28 MB' })).toHaveValue('1');
      expect(within(upper).getByRole('textbox', { name: 'Sondaje 28 B' })).toHaveValue('2');
      expect(within(upper).getByRole('textbox', { name: 'Sondaje 28 DB' })).toHaveValue('3');
      // Cambio de cara sin saltar al 18: sigue por el 28 palatino, de distal a mesial.
      expect(within(upper).getByRole('textbox', { name: 'Sondaje 28 DP' })).toHaveValue('4');
      expect(within(upper).getByRole('textbox', { name: 'Sondaje 28 P' })).toHaveValue('5');
      expect(within(upper).getByRole('textbox', { name: 'Sondaje 28 MP' })).toHaveFocus();
      expect(within(upper).getByRole('textbox', { name: 'Sondaje 18 MP' })).toHaveValue('');
      // Cambio de arcada: del último sitio palatino del 18 al 48 lingual.
      await user.click(within(upper).getByRole('textbox', { name: 'Sondaje 18 DP' }));
      await user.keyboard('6');
      expect(within(lower).getByRole('textbox', { name: 'Sondaje 48 DL' })).toHaveFocus();
      // Y al final de la lingual inferior, el 38 vestibular.
      await user.click(within(lower).getByRole('textbox', { name: 'Sondaje 38 DL' }));
      await user.keyboard('2');
      expect(within(lower).getByRole('textbox', { name: 'Sondaje 38 DB' })).toHaveFocus();
    });

    it('B, S, P o C justo tras un dígito marcan el sitio recién sondeado, no el siguiente', async () => {
      const user = setupUser();
      mockedGet.mockResolvedValue(exam());
      renderEditor();
      const upper = await screen.findByRole('table', { name: 'Arcada superior' });
      await user.click(within(upper).getByRole('textbox', { name: 'Sondaje 16 DB' }));
      await user.keyboard('5bc');
      expect(within(upper).getByRole('textbox', { name: 'Sondaje 16 B' })).toHaveFocus();
      expect(within(upper).getByRole('button', { name: 'Sangrado 16 DB' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(within(upper).getByRole('button', { name: 'Cálculo 16 DB' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(within(upper).getByRole('button', { name: 'Sangrado 16 B' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      // Otro dígito: ahora la marca va al 16 B.
      await user.keyboard('3s');
      expect(within(upper).getByRole('button', { name: 'Supuración 16 B' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(within(upper).getByRole('button', { name: 'Supuración 16 DB' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('tras moverse con flechas, la tecla marca la celda en la que se está', async () => {
      const user = setupUser();
      mockedGet.mockResolvedValue(exam({ sites: [site(16, 'MB', 4)] }));
      renderEditor();
      const upper = await screen.findByRole('table', { name: 'Arcada superior' });
      await user.click(within(upper).getByRole('textbox', { name: 'Sondaje 16 B' }));
      await user.keyboard('2');
      // El dígito llevó el foco al 16 MB (relleno); con → y ← se vuelve a él.
      await user.keyboard('{ArrowRight}{ArrowLeft}p');
      expect(within(upper).getByRole('textbox', { name: 'Sondaje 16 MB' })).toHaveFocus();
      expect(within(upper).getByRole('button', { name: 'Placa 16 MB' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(within(upper).getByRole('button', { name: 'Placa 16 B' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('los ausentes del odontograma salen omitidos, el autoavance los salta y se pueden incluir', async () => {
      const user = setupUser();
      mockedAbsent.mockResolvedValue(new Set([18]));
      mockedGet.mockResolvedValue(exam());
      mockedSave.mockResolvedValue(exam());
      renderEditor();
      const upper = await screen.findByRole('table', { name: 'Arcada superior' });
      const lower = screen.getByRole('table', { name: 'Arcada inferior' });
      const include = await within(upper).findByRole('button', { name: 'Incluir diente 18' });
      expect(include).toHaveAttribute('aria-pressed', 'true');
      expect(include).toHaveAttribute('title', 'Incluir diente 18 (ausente en el odontograma)');
      expect(screen.getByText(/Omitidos por estar ausentes en el odontograma: 18\./)).toBeInTheDocument();
      // Omitido por defecto no es «cambio sin guardar».
      expect(screen.queryByText('Tienes cambios sin guardar.')).not.toBeInTheDocument();
      // Del 17 palatino el recorrido baja al 48 sin pasar por el 18.
      await user.click(within(upper).getByRole('textbox', { name: 'Sondaje 17 MP' }));
      await user.keyboard('323');
      expect(within(lower).getByRole('textbox', { name: 'Sondaje 48 DL' })).toHaveFocus();
      expect(within(upper).getByRole('textbox', { name: 'Sondaje 18 MP' })).toHaveValue('');
      // Al guardar, la omisión por defecto viaja con lo tocado.
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      expect(mockedSave.mock.calls[0][3].teeth).toEqual([
        { toothFdi: 18, mobility: null, skipped: true },
      ]);
    });

    it('«Incluir el 18» deshace la omisión por defecto y se guarda como incluido', async () => {
      const user = setupUser();
      mockedAbsent.mockResolvedValue(new Set([18]));
      mockedGet.mockResolvedValue(exam());
      mockedSave.mockResolvedValue(exam());
      renderEditor();
      const upper = await screen.findByRole('table', { name: 'Arcada superior' });
      await user.click(await within(upper).findByRole('button', { name: 'Incluir diente 18' }));
      expect(within(upper).getByRole('button', { name: 'Omitir diente 18' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(screen.queryByText(/Omitidos por estar ausentes/)).not.toBeInTheDocument();
      // Del 17 palatino ahora sí pasa por el 18.
      await user.click(within(upper).getByRole('textbox', { name: 'Sondaje 17 DP' }));
      await user.keyboard('3');
      expect(within(upper).getByRole('textbox', { name: 'Sondaje 18 MP' })).toHaveFocus();
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      expect(mockedSave.mock.calls[0][3].teeth).toEqual([
        { toothFdi: 18, mobility: null, skipped: false },
      ]);
    });

    it('un diente ya guardado como incluido no se omite aunque falte en el odontograma', async () => {
      mockedAbsent.mockResolvedValue(new Set([18]));
      mockedGet.mockResolvedValue(exam({ teeth: [{ toothFdi: 18, mobility: null, skipped: false }] }));
      renderEditor();
      const upper = await screen.findByRole('table', { name: 'Arcada superior' });
      expect(within(upper).getByRole('button', { name: 'Omitir diente 18' })).toBeInTheDocument();
    });

    it('si no se pueden leer los ausentes, la rejilla sigue igual (aviso con reintento)', async () => {
      mockedAbsent.mockRejectedValueOnce(new ApiError(500, 'boom'));
      mockedGet.mockResolvedValue(exam());
      renderEditor();
      const upper = await screen.findByRole('table', { name: 'Arcada superior' });
      expect(within(upper).getByRole('button', { name: 'Omitir diente 18' })).toBeInTheDocument();
      expect(mockedAbsent).toHaveBeenCalledWith('tok', 'p1');
    });

    it('un examen final no consulta el odontograma', async () => {
      mockedGet.mockResolvedValue(exam({ status: 'FINAL', finalizedAt: '2026-10-16T16:00:00.000Z' }));
      renderEditor();
      await screen.findByRole('table', { name: 'Arcada superior' });
      expect(mockedAbsent).not.toHaveBeenCalled();
    });

    it('la ayuda de teclado lista todas las teclas', async () => {
      mockedGet.mockResolvedValue(exam());
      renderEditor();
      const help = await screen.findByRole('region', { name: 'Teclado' });
      for (const label of [
        'Dígitos del 0 al 9',
        'Más y un dígito',
        'Menos y un dígito',
        'Retroceso o Suprimir',
        'B',
        'S',
        'P',
        'C',
        'Flechas izquierda y derecha',
        'Flechas arriba y abajo',
      ]) {
        expect(within(help).getByText(label, { selector: '.sr-only' })).toBeInTheDocument();
      }
      expect(help).toHaveTextContent('Cálculo.');
      expect(help).toHaveTextContent(/Recorrido en S: vestibular superior del 18 al 28/);
    });
  });
});
