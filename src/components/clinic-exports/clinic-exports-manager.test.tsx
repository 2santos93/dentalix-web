import { act, render, screen, waitFor, within } from '@testing-library/react';
import { ClinicExportsManager, POLL_MS, clinicExportsCopy as copy } from './clinic-exports-manager';
import {
  downloadClinicExport,
  fileSizeLabel,
  listClinicExports,
  requestClinicExport,
  type ClinicExport,
} from '@/lib/clinic-exports/clinic-exports-api';
import { ApiError } from '@/lib/api/api-error';
import { notifyError } from '@/components/errors/notify';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/clinic-exports/clinic-exports-api', () => ({
  ...jest.requireActual('../../lib/clinic-exports/clinic-exports-api'),
  listClinicExports: jest.fn(),
  requestClinicExport: jest.fn(),
  downloadClinicExport: jest.fn(),
}));
jest.mock('../../lib/locations/sede-stamp', () => ({
  useSedeStamp: () => ({ dateTime: () => '21/11/2026 9:30 a. m.', notice: null }),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = listClinicExports as jest.MockedFunction<typeof listClinicExports>;
const mockedRequest = requestClinicExport as jest.MockedFunction<typeof requestClinicExport>;
const mockedDownload = downloadClinicExport as jest.MockedFunction<typeof downloadClinicExport>;

function exportOf(partial: Partial<ClinicExport> & { id: string }): ClinicExport {
  return {
    state: 'READY',
    requestedByName: 'Ana Rodríguez',
    requestedAt: '2026-11-21T13:30:00.000Z',
    completedAt: '2026-11-21T13:31:00.000Z',
    sizeBytes: 2_500_000,
    fileCount: 49,
    totalRows: 1234,
    downloadExpiresAt: '2026-11-22T13:31:00.000Z',
    downloadedAt: null,
    downloadedByName: null,
    errorCode: null,
    canDownload: true,
    ...partial,
  };
}

describe('ClinicExportsManager (DX-053)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('historial con estado, quién, tamaño y «Descargar» solo en la lista', async () => {
    mockedList.mockResolvedValue([
      exportOf({ id: 'e2' }),
      exportOf({
        id: 'e1',
        state: 'DOWNLOADED',
        canDownload: false,
        downloadedAt: '2026-11-20T15:00:00.000Z',
        downloadedByName: 'Luis Pérez',
      }),
    ]);
    render(<ClinicExportsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: copy.tableLabel });
    expect(within(table).getByText('Lista')).toBeInTheDocument();
    expect(within(table).getByText('Descargada')).toBeInTheDocument();
    expect(within(table).getAllByText('por Ana Rodríguez')).toHaveLength(2);
    expect(within(table).getAllByText(fileSizeLabel(2_500_000))).toHaveLength(2);
    expect(within(table).getByText(/Por Luis Pérez el/)).toBeInTheDocument();
    expect(within(table).getAllByRole('button', { name: /Descargar la exportación/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: copy.exportAll })).toBeEnabled();
  });

  it('vacío: explica cómo empezar', async () => {
    mockedList.mockResolvedValue([]);
    render(<ClinicExportsManager token="tok" allowed />);
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
  });

  it('error al cargar: mensaje y «Reintentar» que vuelve a pedir', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new Error('caída')).mockResolvedValueOnce([]);
    render(<ClinicExportsManager token="tok" allowed />);
    expect(await screen.findByText(copy.loadError)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('«Exportar todo» pide confirmación y añade la exportación en cola', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedRequest.mockResolvedValue(exportOf({ id: 'e3', state: 'PENDING', canDownload: false, sizeBytes: null }));
    render(<ClinicExportsManager token="tok" allowed />);
    await screen.findByText(copy.empty);
    await user.click(screen.getByRole('button', { name: copy.exportAll }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(copy.confirmTitle)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: copy.confirmLabel }));
    expect(mockedRequest).toHaveBeenCalledWith('tok');
    expect(await screen.findByText('En cola')).toBeInTheDocument();
    // En curso: no se puede pedir otra.
    expect(screen.getByRole('button', { name: copy.inProgress })).toBeDisabled();
  });

  it('409 de otro administrador: el error se ve en el diálogo y la lista se refresca', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedRequest.mockRejectedValue(new ApiError(409, 'Ya hay una exportación en curso.', {}));
    render(<ClinicExportsManager token="tok" allowed />);
    await screen.findByText(copy.empty);
    await user.click(screen.getByRole('button', { name: copy.exportAll }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: copy.confirmLabel }));
    expect(await within(dialog).findByText('Ya hay una exportación en curso.')).toBeInTheDocument();
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  });

  it('en curso vuelve a preguntar hasta que está lista', async () => {
    jest.useFakeTimers();
    try {
      mockedList
        .mockResolvedValueOnce([exportOf({ id: 'e4', state: 'RUNNING', canDownload: false, sizeBytes: null })])
        .mockResolvedValueOnce([exportOf({ id: 'e4' })]);
      render(<ClinicExportsManager token="tok" allowed />);
      expect(await screen.findByText('Generándose')).toBeInTheDocument();
      await act(async () => {
        jest.advanceTimersByTime(POLL_MS);
      });
      expect(await screen.findByText('Lista')).toBeInTheDocument();
      expect(mockedList).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('«Descargar» abre la URL firmada y refresca (un solo uso)', async () => {
    const user = setupUser();
    const openUrl = jest.fn();
    mockedList.mockResolvedValue([exportOf({ id: 'e5' })]);
    mockedDownload.mockResolvedValue({
      url: 'https://almacen/firmada',
      expiresInSeconds: 60,
      fileName: 'exportacion-dentalix-2026-11-21.zip',
      sizeBytes: 2_500_000,
    });
    render(<ClinicExportsManager token="tok" allowed openUrl={openUrl} />);
    const table = await screen.findByRole('table', { name: copy.tableLabel });
    await user.click(within(table).getByRole('button', { name: /Descargar la exportación/ }));
    expect(mockedDownload).toHaveBeenCalledWith('tok', 'e5');
    expect(openUrl).toHaveBeenCalledWith('https://almacen/firmada');
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  });

  it('descarga ya usada (410): avisa con el mensaje de la API', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([exportOf({ id: 'e6' })]);
    mockedDownload.mockRejectedValue(new ApiError(410, 'Esta exportación ya se descargó.', {}));
    render(<ClinicExportsManager token="tok" allowed openUrl={jest.fn()} />);
    const table = await screen.findByRole('table', { name: copy.tableLabel });
    await user.click(within(table).getByRole('button', { name: /Descargar la exportación/ }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith('Esta exportación ya se descargó.'));
  });

  it('sin permiso: candado y nada se pide', () => {
    render(<ClinicExportsManager token="tok" allowed={false} />);
    expect(screen.getByText(copy.forbiddenTitle)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });
});
