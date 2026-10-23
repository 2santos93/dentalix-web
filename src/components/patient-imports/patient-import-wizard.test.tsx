import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import {
  confirmImport,
  getImport,
  inspectFile,
  listImports,
  removeBalances,
  saveCsv,
  uploadBalances,
  validateImport,
} from '@/lib/patient-imports/patient-imports-api';
import { balancesFixture, batchFixture, inspectFixture } from '@/lib/test/patient-imports';
import { ImportProgress } from './import-progress';
import { PatientImportWizard } from './patient-import-wizard';
import { notifyError } from '@/components/errors/notify';
import { toast } from 'sonner';

jest.mock('../errors/notify', () => ({
  notifyError: jest.fn(() => 'toast-poll'),
}));
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), dismiss: jest.fn() },
}));

jest.mock('../../lib/patient-imports/patient-imports-api', () => ({
  ...jest.requireActual('../../lib/patient-imports/patient-imports-api'),
  inspectFile: jest.fn(),
  validateImport: jest.fn(),
  confirmImport: jest.fn(),
  getImport: jest.fn(),
  listImports: jest.fn(),
  downloadTemplate: jest.fn(),
  downloadErrorsCsv: jest.fn().mockResolvedValue('csv'),
  downloadBalanceTemplate: jest.fn().mockResolvedValue('csv'),
  downloadBalanceErrorsCsv: jest.fn().mockResolvedValue('csv'),
  uploadBalances: jest.fn(),
  removeBalances: jest.fn(),
  saveCsv: jest.fn(),
}));

const mockedInspect = inspectFile as jest.MockedFunction<typeof inspectFile>;
const mockedValidate = validateImport as jest.MockedFunction<typeof validateImport>;
const mockedConfirm = confirmImport as jest.MockedFunction<typeof confirmImport>;
const mockedGet = getImport as jest.MockedFunction<typeof getImport>;
const mockedList = listImports as jest.MockedFunction<typeof listImports>;
const mockedBalances = uploadBalances as jest.MockedFunction<typeof uploadBalances>;
const mockedRemoveBalances = removeBalances as jest.MockedFunction<typeof removeBalances>;

const csv = () => new File(['tipo;doc\nCC;1'], 'pacientes.csv', { type: 'text/csv' });

beforeEach(() => {
  jest.clearAllMocks();
  mockedList.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
});

async function upload(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText('Archivo de pacientes (CSV o .xlsx)'), csv());
}

it('paso 1 → 2: lee el archivo y propone el mapeo de columnas con su ejemplo', async () => {
  mockedInspect.mockResolvedValue(inspectFixture());
  const user = userEvent.setup();
  render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);

  await upload(user);
  expect(mockedInspect).toHaveBeenCalledWith('tok', expect.any(File), expect.any(Function));
  expect(await screen.findByText('pacientes.csv · 3 filas')).toBeInTheDocument();
  const doc = screen.getByLabelText(/número de documento/i);
  expect(doc).toHaveValue('Cédula');
  expect(screen.getByLabelText(/^tipo de documento$/i)).toHaveValue('');
  expect(screen.getByText('1020304050')).toBeInTheDocument();
});

it('un archivo de más de 5 MB se rechaza sin subirlo', async () => {
  const user = userEvent.setup();
  render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
  const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.csv', {
    type: 'text/csv',
  });
  await user.upload(screen.getByLabelText('Archivo de pacientes (CSV o .xlsx)'), big);
  expect(await screen.findByRole('alert')).toHaveTextContent(/más de 5 MB/);
  expect(mockedInspect).not.toHaveBeenCalled();
});

it('el error del archivo sale en español junto a la subida', async () => {
  mockedInspect.mockRejectedValue(
    new ApiError(400, 'Bad Request', {
      messages: ['Es un Excel antiguo (.xls) o protegido con contraseña.'],
    }),
  );
  const user = userEvent.setup();
  render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
  await upload(user);
  expect(await screen.findByRole('alert')).toHaveTextContent(/Excel antiguo/);
});

it('DX-107 × DX-259: mientras sube el archivo enseña el progreso y, subido, que lo está leyendo', async () => {
  let report: ((fraction: number) => void) | undefined;
  let finish: ((value: ReturnType<typeof inspectFixture>) => void) | undefined;
  mockedInspect.mockImplementation((_token, _file, onProgress) => {
    report = onProgress;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const user = userEvent.setup();
  render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
  await upload(user);

  act(() => report?.(0.42));
  expect(screen.getByRole('status')).toHaveTextContent('Subiendo el archivo… 42 %');
  const bar = screen.getByRole('progressbar', { name: 'Subida del archivo' });
  expect(bar).toHaveAttribute('aria-valuenow', '42');

  act(() => report?.(1));
  expect(screen.getByRole('status')).toHaveTextContent('Leyendo el archivo…');
  expect(screen.queryByRole('progressbar', { name: 'Subida del archivo' })).not.toBeInTheDocument();

  await act(async () => finish?.(inspectFixture()));
  expect(await screen.findByText('pacientes.csv · 3 filas')).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('DX-107 × DX-259: al validar vuelve a enseñar el progreso de la subida', async () => {
  mockedInspect.mockResolvedValue(inspectFixture());
  let report: ((fraction: number) => void) | undefined;
  mockedValidate.mockImplementation((_t, _f, _m, _d, onProgress) => {
    report = onProgress;
    return new Promise(() => {});
  });
  const user = userEvent.setup();
  render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
  await upload(user);
  await user.click(await screen.findByRole('button', { name: 'Validar archivo' }));

  act(() => report?.(0.1));
  expect(screen.getByRole('status')).toHaveTextContent('Subiendo el archivo… 10 %');
  expect(screen.getByRole('progressbar', { name: 'Subida del archivo' })).toHaveAttribute('aria-valuenow', '10');
  act(() => report?.(1));
  expect(screen.getByRole('status')).toHaveTextContent('Validando… no se guarda ningún paciente todavía.');
});

it('paso 2: valida con el mapeo elegido y muestra totales, errores por fila y vista previa', async () => {
  mockedInspect.mockResolvedValue(inspectFixture());
  mockedValidate.mockResolvedValue(batchFixture());
  const user = userEvent.setup();
  render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
  await upload(user);
  await screen.findByLabelText(/número de documento/i);

  await user.selectOptions(screen.getByLabelText(/^teléfono$/i), '');
  await user.click(screen.getByRole('button', { name: 'Validar archivo' }));

  expect(mockedValidate).toHaveBeenCalledWith(
    'tok',
    expect.any(File),
    { docNumber: 'Cédula', firstName: 'Nombre', lastName: 'Apellidos' },
    'CC',
    expect.any(Function),
  );
  const result = await screen.findByRole('region', {
    name: /resultado de la validación/i,
  });
  expect(within(result).getByText('Pacientes nuevos').nextSibling).toHaveTextContent('1');
  const table = within(result).getByRole('table', {
    name: /errores y duplicados/i,
  });
  expect(within(table).getAllByRole('row')).toHaveLength(3);
  expect(table).toHaveTextContent('Falta «Nombres».');
  expect(table).toHaveTextContent('Ya existe en la clínica');
  expect(result).toHaveTextContent('Ana Pérez');

  await user.click(within(result).getByRole('button', { name: /descargar informe/i }));
  await waitFor(() => expect(saveCsv).toHaveBeenCalledWith('csv', 'errores-pacientes.csv'));
});

it('paso 3: confirma con «actualizar vacíos» y sigue el avance hasta terminar', async () => {
  jest.useFakeTimers();
  try {
    mockedInspect.mockResolvedValue(inspectFixture());
    mockedValidate.mockResolvedValue(batchFixture());
    mockedConfirm.mockResolvedValue(batchFixture({ status: 'QUEUED', canConfirm: false }));
    mockedGet.mockResolvedValue(
      batchFixture({
        status: 'COMPLETED',
        canConfirm: false,
        canUndo: true,
        progress: {
          preparedRows: 2,
          processedRows: 2,
          createdCount: 1,
          updatedCount: 1,
          skippedCount: 0,
          failedCount: 0,
          percent: 100,
        },
      }),
    );
    const onBatchChange = jest.fn();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<PatientImportWizard token="tok" onBatchChange={onBatchChange} />);
    await upload(user);
    await user.click(await screen.findByRole('button', { name: 'Validar archivo' }));
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(await screen.findByRole('button', { name: 'Continuar sin saldos' }));

    expect(screen.getByText(/autorización de datos \(Ley 1581\) pendiente/)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/actualizar solo los campos vacíos/i));
    await user.click(screen.getByRole('button', { name: 'Importar 1 paciente' }));
    expect(mockedConfirm).toHaveBeenCalledWith('tok', 'batch-1', 'FILL_EMPTY');
    expect(await screen.findByText('En cola')).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    expect(await screen.findByText('Importado')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /avance/i })).toHaveAttribute('value', '100');
    expect(screen.getByText('2 de 2 filas procesadas')).toBeInTheDocument();
    expect(onBatchChange).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Importar otro archivo' })).toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

it('confirmar falla con 409: el motivo de la API junto al botón', async () => {
  mockedInspect.mockResolvedValue(inspectFixture());
  mockedValidate.mockResolvedValue(batchFixture());
  mockedConfirm.mockRejectedValue(
    new ApiError(409, 'Conflict', {
      messages: ['Ya hay una importación de pacientes en curso en la clínica: espera a que termine.'],
    }),
  );
  const user = userEvent.setup();
  render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
  await upload(user);
  await user.click(await screen.findByRole('button', { name: 'Validar archivo' }));
  await user.click(await screen.findByRole('button', { name: 'Continuar' }));
  await user.click(await screen.findByRole('button', { name: 'Continuar sin saldos' }));
  await user.click(screen.getByRole('button', { name: 'Importar 1 paciente' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/en curso/);
});

it('sin filas que importar (y el lote caducado) no deja continuar', async () => {
  mockedInspect.mockResolvedValue(inspectFixture());
  mockedValidate.mockResolvedValue(
    batchFixture({
      canConfirm: false,
      createdAt: '2020-01-01T00:00:00.000Z',
      totals: { totalRows: 1, validRows: 0, duplicateRows: 0, errorRows: 1 },
    }),
  );
  const user = userEvent.setup();
  render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
  await upload(user);
  await user.click(await screen.findByRole('button', { name: 'Validar archivo' }));
  expect(await screen.findByText(/No hay filas que importar/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
});

it('al volver con una importación en marcha, enseña su avance', async () => {
  const running = batchFixture({
    status: 'RUNNING',
    canConfirm: false,
    progress: {
      preparedRows: 10,
      processedRows: 4,
      createdCount: 4,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      percent: 40,
    },
  });
  mockedList.mockResolvedValue({
    items: [running],
    total: 1,
    page: 1,
    pageSize: 20,
  });
  mockedGet.mockResolvedValue(running);
  render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
  expect(await screen.findByText('4 de 10 filas procesadas')).toBeInTheDocument();
  expect(screen.getByText('Importando')).toBeInTheDocument();
});

it('si el avance falla varias veces seguidas, un solo aviso', async () => {
  jest.useFakeTimers();
  try {
    const running = batchFixture({ status: 'RUNNING', canConfirm: false });
    mockedList.mockResolvedValue({
      items: [running],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    mockedGet.mockResolvedValueOnce(running).mockRejectedValue(new Error('red'));
    render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
    expect(await screen.findByText('Importando')).toBeInTheDocument();
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        jest.advanceTimersByTime(1600);
      });
    }
    expect(mockedGet.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(notifyError).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it('tras un error del archivo, el campo se vacía para volver a elegirlo', async () => {
  mockedInspect.mockRejectedValue(new ApiError(400, 'Bad Request', { messages: ['El archivo está vacío.'] }));
  const user = userEvent.setup();
  render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
  await upload(user);
  expect(await screen.findByRole('alert')).toHaveTextContent('El archivo está vacío.');
  expect((screen.getByLabelText('Archivo de pacientes (CSV o .xlsx)') as HTMLInputElement).value).toBe('');
});

it('QA D3: el campo de archivo oculto no es una parada de Tab; «Elegir archivo» sí', () => {
  render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
  expect(screen.getByLabelText('Archivo de pacientes (CSV o .xlsx)')).toHaveAttribute('tabindex', '-1');
  expect(screen.getByRole('button', { name: 'Elegir archivo' })).not.toHaveAttribute('tabindex', '-1');
});

it('QA O1: al avanzar, el foco va al título del paso nuevo (no se pierde en <body>)', async () => {
  mockedInspect.mockResolvedValue(inspectFixture());
  mockedValidate.mockResolvedValue(batchFixture());
  const user = userEvent.setup();
  render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
  await upload(user);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Revisa las columnas y valida' })).toHaveFocus());
  await user.click(screen.getByRole('button', { name: 'Validar archivo' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Resultado de la validación' })).toHaveFocus());
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
  await waitFor(() =>
    expect(
      screen.getByRole('heading', {
        name: 'Saldos de los pacientes (opcional)',
      }),
    ).toHaveFocus(),
  );
  await user.click(screen.getByRole('button', { name: 'Continuar sin saldos' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Confirmar la importación' })).toHaveFocus());
});

describe('DX-262: hoja de saldos «Saldo migrado»', () => {
  const saldos = () =>
    new File(['doc;importe;moneda\n1;2;COP'], 'saldos.csv', {
      type: 'text/csv',
    });

  async function toBalances(user: ReturnType<typeof userEvent.setup>) {
    mockedInspect.mockResolvedValue(inspectFixture());
    mockedValidate.mockResolvedValue(batchFixture());
    render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
    await upload(user);
    await user.click(await screen.findByRole('button', { name: 'Validar archivo' }));
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
  }

  it('valida la hoja (dry-run): total por moneda del archivo y a importar, y errores por fila; luego se confirma', async () => {
    mockedBalances.mockResolvedValue(
      batchFixture({
        balances: balancesFixture(),
        balanceIssues: [
          {
            row: 3,
            column: 'numero_documento',
            kind: 'MERGED',
            message: 'Mismo paciente y moneda que la fila 2: se suman en un solo saldo migrado.',
            value: '111111',
          },
          {
            row: 6,
            column: 'importe',
            kind: 'ERROR',
            message: 'El importe debe ser mayor que 0.',
            value: '-5',
          },
        ],
        balanceIssuesTotal: 2,
      }),
    );
    const user = userEvent.setup();
    await toBalances(user);
    expect(screen.getByText(/nada se guarda hasta confirmar/i)).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Hoja de saldos (CSV o .xlsx)'), saldos());
    expect(mockedBalances).toHaveBeenCalledWith('tok', 'batch-1', expect.any(File), expect.any(Function));

    const totals = await screen.findByRole('table', {
      name: 'Totales por moneda',
    });
    const cop = within(totals).getByRole('row', { name: /COP/ });
    expect(cop).toHaveTextContent('201.100,50');
    expect(cop).toHaveTextContent('201.000,50');
    expect(within(totals).getByRole('row', { name: /USD/ })).toHaveTextContent('40,00');
    const issues = screen.getByRole('table', {
      name: 'Errores y avisos de la hoja de saldos',
    });
    expect(within(issues).getByText('Sumada a otra fila')).toBeInTheDocument();
    expect(within(issues).getByText('El importe debe ser mayor que 0.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('heading', { name: 'Confirmar la importación' })).toBeInTheDocument();
    expect(screen.getByText(/3 saldos migrados/)).toBeInTheDocument();
  });

  it('el error de la hoja sale en español junto a la subida', async () => {
    mockedBalances.mockRejectedValue(
      new ApiError(400, 'Bad Request', {
        messages: ['A la hoja de saldos le falta la columna «Moneda».'],
      }),
    );
    const user = userEvent.setup();
    await toBalances(user);
    await user.upload(screen.getByLabelText('Hoja de saldos (CSV o .xlsx)'), saldos());
    expect(await screen.findByRole('alert')).toHaveTextContent(/falta la columna «Moneda»/);
    expect(screen.getByRole('button', { name: 'Continuar sin saldos' })).toBeInTheDocument();
  });

  it('quitar la hoja vuelve a «sin saldos»', async () => {
    mockedBalances.mockResolvedValue(batchFixture({ balances: balancesFixture() }));
    mockedRemoveBalances.mockResolvedValue(batchFixture());
    const user = userEvent.setup();
    await toBalances(user);
    await user.upload(screen.getByLabelText('Hoja de saldos (CSV o .xlsx)'), saldos());
    await user.click(await screen.findByRole('button', { name: 'Quitar la hoja de saldos' }));
    expect(mockedRemoveBalances).toHaveBeenCalledWith('tok', 'batch-1');
    expect(await screen.findByRole('button', { name: 'Continuar sin saldos' })).toBeInTheDocument();
  });

  it('I2: sin pacientes nuevos (todos ya existen) se puede seguir al paso «Saldos» e importar solo saldos', async () => {
    const onlyExisting = batchFixture({
      canConfirm: false,
      createdAt: new Date().toISOString(),
      totals: { totalRows: 2, validRows: 0, duplicateRows: 2, errorRows: 0 },
      progress: { ...batchFixture().progress, preparedRows: 0 },
      issues: [],
      issuesTotal: 0,
    });
    mockedInspect.mockResolvedValue(inspectFixture());
    mockedValidate.mockResolvedValue(onlyExisting);
    mockedBalances.mockResolvedValue({
      ...onlyExisting,
      canConfirm: true,
      balances: balancesFixture({ preparedCount: 3 }),
    });
    mockedConfirm.mockResolvedValue(batchFixture({ status: 'QUEUED', canConfirm: false }));
    const user = userEvent.setup();
    render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
    await upload(user);
    await user.click(await screen.findByRole('button', { name: 'Validar archivo' }));
    expect(await screen.findByText(/No hay pacientes nuevos: puedes importar solo sus saldos/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    // Sin hoja todavía no hay nada que importar: no se puede seguir sin saldos.
    expect(screen.getByRole('button', { name: 'Continuar sin saldos' })).toBeDisabled();
    await user.upload(screen.getByLabelText('Hoja de saldos (CSV o .xlsx)'), saldos());
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Importar 3 saldos migrados' }));
    expect(mockedConfirm).toHaveBeenCalledWith('tok', 'batch-1', 'SKIP');
  });

  it('M7: el avance distingue los saldos no creados por documento ambiguo', () => {
    render(
      <ImportProgress
        headingId="h"
        onReport={jest.fn()}
        batch={batchFixture({
          status: 'COMPLETED',
          balances: balancesFixture({
            progress: { processed: 3, created: 1, skipped: 1, ambiguous: 1 },
          }),
        })}
      />,
    );
    expect(screen.getByText(/1 saldo no se creó: su paciente no existía al importar/)).toBeInTheDocument();
    expect(screen.getByText(/1 saldo no se creó: su documento es de varios pacientes/)).toBeInTheDocument();
  });

  it('el avance enseña los saldos migrados importados por moneda', () => {
    render(
      <ImportProgress
        headingId="h"
        onReport={jest.fn()}
        batch={batchFixture({
          status: 'COMPLETED',
          balances: balancesFixture({
            progress: { processed: 3, created: 3, skipped: 0, ambiguous: 0 },
            imported: [
              { currency: 'COP', count: 2, amount: 201000.5 },
              { currency: 'USD', count: 1, amount: 40 },
            ],
          }),
        })}
      />,
    );
    expect(screen.getByText('Saldos migrados: 3 de 3')).toBeInTheDocument();
    expect(screen.getByText(/201\.000,50/)).toBeInTheDocument();
  });
});

it('Way-Out Rule: el aviso de fallo del avance trae «Reintentar»', async () => {
  jest.useFakeTimers();
  try {
    const running = batchFixture({ status: 'RUNNING', canConfirm: false });
    mockedList.mockResolvedValue({
      items: [running],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    mockedGet.mockResolvedValueOnce(running).mockRejectedValue(new Error('red'));
    render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
    expect(await screen.findByText('Importando')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    expect(notifyError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ onRetry: expect.any(Function) }),
    );
  } finally {
    jest.useRealTimers();
  }
});

it('sin informe disponible (caducado o purgado) no ofrece descargarlo', async () => {
  const done = batchFixture({
    status: 'COMPLETED',
    canConfirm: false,
    canUndo: true,
    reportAvailable: false,
  });
  render(<ImportProgress batch={done} headingId="h" onReport={jest.fn()} />);
  expect(screen.queryByRole('button', { name: /informe de errores/i })).not.toBeInTheDocument();
  render(<ImportProgress batch={{ ...done, reportAvailable: true }} headingId="h2" onReport={jest.fn()} />);
  expect(screen.getByRole('button', { name: /informe de errores/i })).toBeInTheDocument();
});

it('el aviso del avance se cierra solo cuando la consulta vuelve a ir bien', async () => {
  jest.useFakeTimers();
  try {
    const running = batchFixture({ status: 'RUNNING', canConfirm: false });
    mockedList.mockResolvedValue({
      items: [running],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    mockedGet.mockResolvedValueOnce(running).mockRejectedValueOnce(new Error('red')).mockResolvedValue(running);
    render(<PatientImportWizard token="tok" onBatchChange={jest.fn()} />);
    expect(await screen.findByText('Importando')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(toast.dismiss).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1600);
    });
    expect(toast.dismiss).toHaveBeenCalledWith('toast-poll');
  } finally {
    jest.useRealTimers();
  }
});
