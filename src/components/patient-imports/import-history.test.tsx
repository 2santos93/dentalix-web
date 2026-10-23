import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { listImports, undoImport } from '@/lib/patient-imports/patient-imports-api';
import { batchFixture } from '@/lib/test/patient-imports';
import { notifyError } from '@/components/errors/notify';
import { ImportHistory } from './import-history';

jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

jest.mock('../../lib/patient-imports/patient-imports-api', () => ({
  ...jest.requireActual('../../lib/patient-imports/patient-imports-api'),
  listImports: jest.fn(),
  undoImport: jest.fn(),
  downloadErrorsCsv: jest.fn(),
  saveCsv: jest.fn(),
}));

const mockedList = listImports as jest.MockedFunction<typeof listImports>;
const mockedUndo = undoImport as jest.MockedFunction<typeof undoImport>;

const completed = batchFixture({
  status: 'COMPLETED',
  canConfirm: false,
  canUndo: true,
  confirmedAt: '2026-10-21T14:05:00.000Z',
  progress: { preparedRows: 2, processedRows: 2, createdCount: 1, updatedCount: 1, skippedCount: 0, failedCount: 0, percent: 100 },
});
const page = (items = [completed]) => ({ items, total: items.length, page: 1, pageSize: 20 });

beforeEach(() => jest.clearAllMocks());

it('carga con esqueleto y luego lista cada lote con su estado y resultado', async () => {
  mockedList.mockResolvedValue(page());
  render(<ImportHistory token="tok" reloadKey={0} />);
  expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
  const list = await screen.findByRole('list', { name: /importaciones de la clínica/i });
  expect(list).toHaveTextContent('pacientes.csv');
  expect(list).toHaveTextContent('Importado');
  expect(list).toHaveTextContent('1 creados · 1 actualizados · 2 duplicados o con error');
  expect(list).toHaveTextContent('Admin Demo');
});

it('vacío: lo explica', async () => {
  mockedList.mockResolvedValue(page([]));
  render(<ImportHistory token="tok" reloadKey={0} />);
  expect(await screen.findByText('Aún no has importado pacientes')).toBeInTheDocument();
});

it('error: sección con «Reintentar» que vuelve a cargar', async () => {
  mockedList.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(page());
  const user = userEvent.setup();
  render(<ImportHistory token="tok" reloadKey={0} />);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/historial de importaciones/);
  await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('pacientes.csv')).toBeInTheDocument();
  expect(mockedList).toHaveBeenCalledTimes(2);
});

it('deshacer: pide confirmación y deja el lote como deshecho', async () => {
  mockedList.mockResolvedValue(page());
  mockedUndo.mockResolvedValue({ ...completed, status: 'UNDONE', canUndo: false, undoneCreated: 1, undoneFilled: 1 });
  const user = userEvent.setup();
  render(<ImportHistory token="tok" reloadKey={0} />);
  await user.click(await screen.findByRole('button', { name: /deshacer el lote pacientes\.csv/i }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent(/Se retirarán los 1 pacientes/);
  await user.click(within(dialog).getByRole('button', { name: 'Deshacer lote' }));
  expect(mockedUndo).toHaveBeenCalledWith('tok', 'batch-1');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('Deshecho: 1 pacientes retirados, 1 fichas revertidas')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /deshacer el lote/i })).not.toBeInTheDocument();
});

it('deshacer rechazado (409): el motivo en el diálogo y el lote intacto', async () => {
  mockedList.mockResolvedValue(page());
  mockedUndo.mockRejectedValue(
    new ApiError(409, 'Conflict', { messages: ['No se puede deshacer: 1 paciente de este lote ya tiene citas, historia clínica, planes, pagos u otros datos registrados. Corrígelo desde su ficha.'] }),
  );
  const user = userEvent.setup();
  render(<ImportHistory token="tok" reloadKey={0} />);
  await user.click(await screen.findByRole('button', { name: /deshacer el lote/i }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deshacer lote' }));
  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/ya tiene citas/);
});

it('paginado: «Siguiente» pide la página 2', async () => {
  mockedList.mockResolvedValue({ items: [completed], total: 25, page: 1, pageSize: 20 });
  const user = userEvent.setup();
  render(<ImportHistory token="tok" reloadKey={0} />);
  await screen.findByText('pacientes.csv');
  await user.click(screen.getByRole('button', { name: /siguiente/i }));
  await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith('tok', 2));
});

it('un lote importando se refresca solo hasta terminar', async () => {
  jest.useFakeTimers();
  try {
    const running = { ...completed, status: 'RUNNING' as const, canUndo: false, progress: { ...completed.progress, processedRows: 1, percent: 50 } };
    mockedList.mockResolvedValueOnce(page([running])).mockResolvedValue(page());
    render(<ImportHistory token="tok" reloadKey={0} />);
    expect(await screen.findByText('1 de 2 filas procesadas')).toBeInTheDocument();
    await act(async () => {
      jest.advanceTimersByTime(3100);
    });
    expect(await screen.findByText(/1 creados/)).toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});

it('«Informe» solo si sigue disponible (revisión: tras la purga daría 410)', async () => {
  const purged = { ...completed, id: 'batch-2', fileName: 'viejo.csv', reportAvailable: false };
  mockedList.mockResolvedValue(page([completed, purged]));
  render(<ImportHistory token="tok" reloadKey={0} />);
  await screen.findByText('viejo.csv');
  expect(screen.getByRole('button', { name: /informe.*pacientes\.csv/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /informe.*viejo\.csv/i })).not.toBeInTheDocument();
});

it('Way-Out Rule: el aviso de fallo del refresco trae «Reintentar»', async () => {
  jest.useFakeTimers();
  try {
    const running = { ...completed, status: 'RUNNING' as const, canUndo: false };
    mockedList.mockResolvedValueOnce(page([running])).mockRejectedValue(new Error('red'));
    render(<ImportHistory token="tok" reloadKey={0} />);
    await screen.findByText('pacientes.csv');
    await act(async () => {
      jest.advanceTimersByTime(3100);
    });
    expect(notifyError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ onRetry: expect.any(Function) }),
    );
  } finally {
    jest.useRealTimers();
  }
});
