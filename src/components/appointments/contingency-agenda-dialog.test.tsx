import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/api-error';
import { clinicLocation } from '@/lib/test/locations';
import { listLocations } from '@/lib/locations/locations-api';
import {
  downloadContingencyAgenda,
  downloadContingencyNightly,
  getContingencyNightly,
  type ContingencyNightly,
} from '@/lib/appointments/contingency-agenda-api';
import { saveBlob } from '@/lib/files/save-blob';
import { ContingencyAgendaDialog, contingencyCopy as copy } from './contingency-agenda-dialog';

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
}));
jest.mock('../../lib/appointments/contingency-agenda-api', () => ({
  ...jest.requireActual('../../lib/appointments/contingency-agenda-api'),
  downloadContingencyAgenda: jest.fn(),
  downloadContingencyNightly: jest.fn(),
  getContingencyNightly: jest.fn(),
}));
jest.mock('../../lib/files/save-blob', () => ({ saveBlob: jest.fn() }));

const listMock = listLocations as jest.MockedFunction<typeof listLocations>;
const nowMock = downloadContingencyAgenda as jest.MockedFunction<typeof downloadContingencyAgenda>;
const nightlyPdfMock = downloadContingencyNightly as jest.MockedFunction<typeof downloadContingencyNightly>;
const nightlyMock = getContingencyNightly as jest.MockedFunction<typeof getContingencyNightly>;
const saveMock = saveBlob as jest.MockedFunction<typeof saveBlob>;

const CENTRO = clinicLocation({ id: 'loc-centro', name: 'Sede Centro' });
const NORTE = clinicLocation({ id: 'loc-norte', name: 'Sede Norte', hourCycle: 'h23' });

const NONE: ContingencyNightly = {
  available: false,
  current: false,
  forDate: null,
  generatedAt: null,
  appointmentCount: null,
};
const LAST_NIGHT: ContingencyNightly = {
  available: true,
  current: true,
  forDate: '2026-11-02',
  // 02:10 en Bogotá.
  generatedAt: '2026-11-02T07:10:00.000Z',
  appointmentCount: 3,
};

function renderDialog(defaultLocationId: string | null = 'loc-norte') {
  const onOpenChange = jest.fn();
  render(
    <ContingencyAgendaDialog
      open
      onOpenChange={onOpenChange}
      token="T"
      defaultLocationId={defaultLocationId}
    />,
  );
  return { onOpenChange };
}

describe('ContingencyAgendaDialog (DX-339)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listMock.mockResolvedValue([CENTRO, NORTE, clinicLocation({ id: 'loc-off', name: 'Cerrada', isActive: false })]);
    nightlyMock.mockResolvedValue(NONE);
  });

  it('abre con la sede activa elegida, solo sedes activas, y dice si no hay copia nocturna', async () => {
    renderDialog();
    const select = await screen.findByLabelText(copy.location);
    expect(select).toHaveValue('loc-norte');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sede Centro', 'Sede Norte']);
    expect(await screen.findByText(copy.nightlyNone)).toBeInTheDocument();
    expect(nightlyMock).toHaveBeenCalledWith('T', 'loc-norte');
    expect(screen.queryByRole('button', { name: copy.nightlyDownload })).not.toBeInTheDocument();
  });

  it('en «Todas las sedes» empieza por la primera; con una sola sede la nombra sin selector', async () => {
    listMock.mockResolvedValue([CENTRO]);
    renderDialog(null);
    expect(await screen.findByText('Sede Centro')).toBeInTheDocument();
    expect(screen.queryByLabelText(copy.location)).not.toBeInTheDocument();
    await waitFor(() => expect(nightlyMock).toHaveBeenCalledWith('T', 'loc-centro'));
  });

  it('descarga el PDF de ahora: estado de carga en el botón y aviso al terminar', async () => {
    const user = userEvent.setup();
    let resolve: (v: { blob: Blob; fileName: string }) => void = () => undefined;
    nowMock.mockReturnValue(new Promise((r) => (resolve = r)));
    renderDialog();
    const button = await screen.findByRole('button', { name: copy.downloadNow });
    await user.click(button);
    const busy = screen.getByRole('button', { name: copy.downloading });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    const blob = new Blob(['%PDF']);
    await act(async () => resolve({ blob, fileName: 'agenda-contingencia-sede-norte-2026-11-02.pdf' }));
    expect(nowMock).toHaveBeenCalledWith('T', 'loc-norte');
    expect(saveMock).toHaveBeenCalledWith(blob, 'agenda-contingencia-sede-norte-2026-11-02.pdf');
    expect(screen.getByText(copy.downloaded('agenda-contingencia-sede-norte-2026-11-02.pdf'))).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.getByRole('button', { name: copy.downloadNow })).toBeEnabled();
  });

  it('si la descarga falla, lo dice junto al botón con el mensaje de la API y se puede reintentar', async () => {
    const user = userEvent.setup();
    nowMock.mockRejectedValueOnce(
      new ApiError(409, 'Configura una zona horaria válida para la sede y vuelve a intentarlo.', {
        code: 'LOCATION_TIMEZONE_REQUIRED',
      }),
    );
    renderDialog();
    await user.click(await screen.findByRole('button', { name: copy.downloadNow }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Configura una zona horaria válida para la sede y vuelve a intentarlo.',
    );
    expect(saveMock).not.toHaveBeenCalled();
    nowMock.mockResolvedValueOnce({ blob: new Blob(['%PDF']), fileName: 'a.pdf' });
    await user.click(screen.getByRole('button', { name: copy.downloadNow }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('la copia de anoche: cuándo se generó en la hora de la sede, cuántas citas, y se descarga', async () => {
    const user = userEvent.setup();
    nightlyMock.mockResolvedValue(LAST_NIGHT);
    nightlyPdfMock.mockResolvedValue({ blob: new Blob(['%PDF']), fileName: 'copia.pdf' });
    renderDialog();
    // Sede Norte: reloj de 24 h.
    expect(await screen.findByText(copy.nightlyReady('02/11/2026 02:10', 3))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.nightlyDownload }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledWith(expect.any(Blob), 'copia.pdf'));
    expect(nightlyPdfMock).toHaveBeenCalledWith('T', 'loc-norte');
  });

  it('una copia de un día anterior avisa de que no es la de hoy', async () => {
    nightlyMock.mockResolvedValue({ ...LAST_NIGHT, current: false, appointmentCount: 1 });
    renderDialog();
    expect(await screen.findByText(copy.nightlyStale)).toBeInTheDocument();
    expect(screen.getByText(copy.nightlyReady('02/11/2026 02:10', 1))).toBeInTheDocument();
  });

  it('cambiar de sede vuelve a pedir su copia', async () => {
    const user = userEvent.setup();
    renderDialog();
    await screen.findByText(copy.nightlyNone);
    await user.selectOptions(screen.getByLabelText(copy.location), 'loc-centro');
    await waitFor(() => expect(nightlyMock).toHaveBeenLastCalledWith('T', 'loc-centro'));
  });

  it('si no se puede saber el estado de la copia, el hueco lo dice y se reintenta (la descarga de ahora sigue)', async () => {
    const user = userEvent.setup();
    nightlyMock.mockRejectedValueOnce(new Error('caída'));
    renderDialog();
    expect(await screen.findByText(copy.nightlyError)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.downloadNow })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(copy.nightlyNone)).toBeInTheDocument();
  });

  it('si las sedes no cargan, el selector se sustituye por el error con reintento y no se puede descargar', async () => {
    const user = userEvent.setup();
    listMock.mockRejectedValueOnce(new Error('caída'));
    renderDialog();
    expect(await screen.findByText(copy.locationsError)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.downloadNow })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText(copy.location)).toHaveValue('loc-norte');
  });
});
