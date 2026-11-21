import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CheckInSettingsPanel } from './check-in-settings';
import {
  createCheckInQr,
  getCheckInSettings,
  revokeCheckInQr,
  updateCheckInSettings,
} from '../../lib/appointments/arrival-api';
import { readPosterHash } from './check-in-poster';

jest.mock('../../lib/appointments/arrival-api', () => ({
  ...jest.requireActual('../../lib/appointments/arrival-api'),
  getCheckInSettings: jest.fn(),
  updateCheckInSettings: jest.fn(),
  createCheckInQr: jest.fn(),
  revokeCheckInQr: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const get = getCheckInSettings as jest.Mock;
const update = updateCheckInSettings as jest.Mock;
const create = createCheckInQr as jest.Mock;
const revoke = revokeCheckInQr as jest.Mock;

const SETTINGS = {
  locationId: 'loc-1',
  linkEnabled: true,
  minutesBefore: 30,
  minutesAfter: 30,
  lateMinutes: 10,
  qrActive: false,
  qrCreatedAt: null,
};
const QR_TOKEN = 'Q'.repeat(43);

function renderPanel() {
  render(
    <CheckInSettingsPanel token="T" locationId="loc-1" locationName="Sede Chacao" dateLabel={(iso) => iso.slice(0, 10)} />,
  );
}

describe('CheckInSettingsPanel (DX-265)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    get.mockResolvedValue(SETTINGS);
  });

  it('cambia la ventana con la barra de guardar y manda los números', async () => {
    update.mockResolvedValueOnce({ ...SETTINGS, minutesBefore: 45 });
    renderPanel();
    const before = await screen.findByLabelText('Desde (minutos antes de la cita)');
    expect(before).toHaveValue('30');
    fireEvent.change(before, { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la llegada de pacientes de Sede Chacao' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('T', 'loc-1', {
        linkEnabled: true,
        minutesBefore: 45,
        minutesAfter: 30,
        lateMinutes: 10,
      }),
    );
  });

  it('fuera de rango no se envía', async () => {
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Retraso que manda a recepción (minutos)'), {
      target: { value: '300' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la llegada de pacientes de Sede Chacao' }));
    expect(await screen.findByText('Escribe un número entero de 0 a 240.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('genera el QR: lo enseña una vez con el cartel para imprimir', async () => {
    create.mockResolvedValueOnce({ ...SETTINGS, qrActive: true, qrCreatedAt: '2026-11-21T10:00:00.000Z', token: QR_TOKEN });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Generar QR' }));
    expect(await screen.findByTestId('check-in-qr-fresh')).toBeInTheDocument();
    expect(screen.getByText('Activo desde el 2026-11-21')).toBeInTheDocument();
    const print = screen.getByRole('link', { name: /Imprimir cartel/ });
    const hash = print.getAttribute('href')!.split('#')[1];
    expect(readPosterHash(`#${hash}`)).toEqual({ token: QR_TOKEN, sede: 'Sede Chacao' });
  });

  it('con QR activo, generar otro o retirarlo pide confirmación', async () => {
    get.mockResolvedValue({ ...SETTINGS, qrActive: true, qrCreatedAt: '2026-11-01T10:00:00.000Z' });
    revoke.mockResolvedValueOnce(SETTINGS);
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Retirar QR' }));
    expect(screen.getByRole('dialog', { name: '¿Retirar el QR?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('T', 'loc-1'));
    expect(await screen.findByText('Sin QR')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});
