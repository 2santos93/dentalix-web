import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicCheckInView } from './public-check-in-view';
import { getCheckInQr, identifyCheckIn } from '../../lib/appointments/arrival-api';
import { ApiError } from '../../lib/api/client';
import { PUBLIC_REGIONAL_VE } from '@/lib/test/document-regional';

// jest.mock no reescribe alias: rutas relativas.
jest.mock('../../lib/appointments/arrival-api', () => ({
  ...jest.requireActual('../../lib/appointments/arrival-api'),
  getCheckInQr: jest.fn(),
  identifyCheckIn: jest.fn(),
}));
jest.mock('../../lib/api/client', () => ({
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));

const getQr = getCheckInQr as jest.Mock;
const identify = identifyCheckIn as jest.Mock;

const QR = {
  clinic: { name: 'Clínica Sonrisa', primaryColor: '#7C3AED', logoUrl: null },
  locationName: 'Sede Chacao',
  ...PUBLIC_REGIONAL_VE,
};
const APPOINTMENT = { patientFirstName: 'Josefina', start: '2026-10-20T14:00:00.000Z', locationName: 'Sede Chacao', ...PUBLIC_REGIONAL_VE };

function apiError(status: number, code: string | null, retryAfterSeconds: number | null = null) {
  return new ApiError(status, 'x', { code, retryAfterSeconds } as never);
}

async function fill(doc: string) {
  fireEvent.change(await screen.findByLabelText('Número de documento'), { target: { value: doc } });
}

describe('PublicCheckInView (DX-265)', () => {
  beforeEach(() => {
    getQr.mockReset();
    identify.mockReset();
    getQr.mockResolvedValue(QR);
  });

  it('pide documento y fecha y no envía sin ellos', async () => {
    render(<PublicCheckInView qrToken="qr-1" />);
    expect(await screen.findByRole('heading', { name: 'Avisa de tu llegada' })).toBeInTheDocument();
    expect(screen.getByText(/en Sede Chacao/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ya llegué' }));
    expect(await screen.findByText('Escribe tu número de documento.')).toBeInTheDocument();
    expect(identify).not.toHaveBeenCalled();
  });

  it('QR que ya no vale: el aviso, sin formulario', async () => {
    getQr.mockRejectedValueOnce(apiError(404, 'CHECK_IN_QR_INACTIVE'));
    render(<PublicCheckInView qrToken="qr-1" />);
    expect(await screen.findByRole('heading', { name: 'Este código ya no está activo' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Número de documento')).not.toBeInTheDocument();
  });

  async function submit(doc = 'V-77777777') {
    const user = userEvent.setup();
    await fill(doc);
    const group = screen.getByRole('group', { name: 'Fecha de nacimiento' });
    const [day] = within(group).getAllByRole('spinbutton');
    await user.click(day);
    await user.keyboard('01121985');
    await user.click(screen.getByRole('button', { name: 'Ya llegué' }));
  }

  it('acierto: «Pasa por recepción» con el turno, sin decir qué está pendiente', async () => {
    identify.mockResolvedValueOnce({
      state: 'ARRIVED',
      result: 'SEE_RECEPTION',
      turnNumber: 4,
      opensAt: null,
      closesAt: null,
      appointment: APPOINTMENT,
    });
    render(<PublicCheckInView qrToken="qr-1" />);
    await submit();
    expect(identify).toHaveBeenCalledWith('qr-1', { documentNumber: 'V-77777777', birthDate: '1985-12-01' });
    expect(await screen.findByRole('heading', { name: 'Gracias, Josefina' })).toBeInTheDocument();
    expect(screen.getByText(/pasa por recepción/i)).toBeInTheDocument();
    expect(screen.getByTestId('arrival-turn')).toHaveTextContent('Tu turno: 4');
    fireEvent.click(screen.getByRole('button', { name: 'Marcar otra llegada' }));
    expect(screen.getByLabelText('Número de documento')).toHaveValue('');
  });

  it('fallo: un mensaje que no dice si el paciente existe', async () => {
    identify.mockRejectedValueOnce(apiError(400, 'CHECK_IN_NO_MATCH'));
    render(<PublicCheckInView qrToken="qr-1" />);
    await submit('V-10101010');
    expect(await screen.findByTestId('check-in-no-match')).toHaveTextContent(
      'No encontramos una cita para hoy en esta sede con esos datos.',
    );
  });

  it('bloqueo tras 5 fallos: aviso con la espera y el envío deshabilitado', async () => {
    identify.mockRejectedValueOnce(apiError(429, 'CHECK_IN_LOCKED', 900));
    render(<PublicCheckInView qrToken="qr-1" />);
    await submit();
    expect(await screen.findByTestId('check-in-locked')).toHaveTextContent('Vuelve a intentarlo en 15 minutos.');
    expect(screen.getByRole('button', { name: 'Ya llegué' })).toBeDisabled();
  });

  it('fuera de la ventana: dice desde qué hora y no muestra el resultado', async () => {
    identify.mockResolvedValueOnce({
      state: 'TOO_EARLY',
      result: null,
      turnNumber: null,
      opensAt: '2026-10-20T13:30:00.000Z',
      closesAt: '2026-10-20T14:30:00.000Z',
      appointment: APPOINTMENT,
    });
    render(<PublicCheckInView qrToken="qr-1" />);
    await submit();
    expect(await screen.findByTestId('check-in-outside-window')).toHaveTextContent(/desde las 9:30/);
  });
});
