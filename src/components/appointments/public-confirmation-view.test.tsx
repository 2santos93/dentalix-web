import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PublicConfirmationView } from './public-confirmation-view';
import {
  getPublicConfirmation,
  respondPublicConfirmation,
  type PublicConfirmation,
} from '../../lib/appointments/confirmations-api';
import { ApiError } from '../../lib/api/client';

// jest.mock no reescribe alias: rutas relativas (ver otros *.test.tsx).
jest.mock('../../lib/appointments/confirmations-api', () => ({
  getPublicConfirmation: jest.fn(),
  respondPublicConfirmation: jest.fn(),
}));
jest.mock('../../lib/api/client', () => ({
  // La clase real: `apiErrorMessage` la reconoce con `instanceof`.
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));

const get = getPublicConfirmation as jest.Mock;
const respond = respondPublicConfirmation as jest.Mock;

const APPOINTMENT = {
  patientFirstName: 'Ana',
  start: '2026-10-20T14:00:00.000Z',
  end: '2026-10-20T14:30:00.000Z',
  providerName: 'Dra. Pérez',
  locationName: 'Sede Norte',
  locationAddress: 'Calle 100 # 15-20',
};
const CLINIC = { name: 'Clínica Sonrisa', primaryColor: '#7C3AED', logoUrl: null };

function view(overrides: Partial<PublicConfirmation> = {}): PublicConfirmation {
  return {
    status: 'PENDING',
    clinic: CLINIC,
    appointment: APPOINTMENT,
    response: null,
    respondedAt: null,
    ...overrides,
  };
}

describe('PublicConfirmationView', () => {
  beforeEach(() => {
    get.mockReset();
    respond.mockReset();
  });

  it('muestra "cargando" y luego clínica, fecha, hora, profesional y sede sin responder nada', async () => {
    get.mockResolvedValueOnce(view());

    render(<PublicConfirmationView confirmationToken="tok-1" />);

    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
    expect(await screen.findByRole('heading', { name: 'Clínica Sonrisa' })).toBeInTheDocument();
    expect(screen.getByText(/hola ana/i)).toBeInTheDocument();
    expect(screen.getByText(/martes, 20 de octubre/i)).toBeInTheDocument();
    expect(screen.getByText('14:00–14:30')).toBeInTheDocument();
    expect(screen.getByText('Dra. Pérez')).toBeInTheDocument();
    expect(screen.getByText('Sede Norte')).toBeInTheDocument();
    expect(screen.getByText('Calle 100 # 15-20')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('tok-1');
    // Abrir NO responde: solo el clic del paciente lo hace.
    expect(respond).not.toHaveBeenCalled();
  });

  it('aplica el color de la clínica al bloque (white-label)', async () => {
    get.mockResolvedValueOnce(view());
    const { container } = render(<PublicConfirmationView confirmationToken="tok-1" />);
    await screen.findByRole('heading', { name: 'Clínica Sonrisa' });
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--color-primary')).toBe('#7C3AED');
  });

  it.each([
    ['Confirmar asistencia', 'confirm', /confirmaste tu asistencia/i],
    ['Cancelar cita', 'cancel', /cancelaste la cita/i],
    ['Quiero que me llamen', 'call_me', /te llamaremos/i],
  ] as const)('el botón "%s" envía %s y muestra la respuesta', async (label, action, done) => {
    get.mockResolvedValueOnce(view());
    respond.mockResolvedValueOnce(
      view({ status: 'RESPONDED', response: action, respondedAt: '2026-10-19T10:00:00.000Z' }),
    );

    render(<PublicConfirmationView confirmationToken="tok-1" />);
    fireEvent.click(await screen.findByRole('button', { name: label }));

    await waitFor(() => expect(respond).toHaveBeenCalledWith('tok-1', action));
    expect(await screen.findByText(done)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
  });

  it('enlace ya respondido: muestra la respuesta dada y ningún botón', async () => {
    get.mockResolvedValueOnce(
      view({ status: 'RESPONDED', response: 'confirm', respondedAt: '2026-10-19T10:00:00.000Z' }),
    );
    render(<PublicConfirmationView confirmationToken="tok-1" />);
    expect(await screen.findByText(/ya respondiste/i)).toBeInTheDocument();
    expect(screen.getByText(/confirmaste tu asistencia/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('enlace caducado: lo explica, sin datos de la cita ni botones', async () => {
    get.mockResolvedValueOnce(view({ status: 'EXPIRED', appointment: null }));
    render(<PublicConfirmationView confirmationToken="tok-1" />);
    expect(await screen.findByRole('heading', { name: /enlace ya no es válido/i })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('token desconocido (404): "enlace no válido"', async () => {
    get.mockRejectedValueOnce(new ApiError(404, 'Confirmation link not found'));
    render(<PublicConfirmationView confirmationToken="nope" />);
    expect(await screen.findByRole('heading', { name: /enlace no válido/i })).toBeInTheDocument();
  });

  it('error de red al cargar: error de sección con reintento', async () => {
    get.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    get.mockResolvedValueOnce(view());
    render(<PublicConfirmationView confirmationToken="tok-1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos cargar tu cita/i);
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('heading', { name: 'Clínica Sonrisa' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('error de red al responder: avisa y deja volver a intentar', async () => {
    get.mockResolvedValueOnce(view());
    respond.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<PublicConfirmationView confirmationToken="tok-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar asistencia' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos enviar tu respuesta/i);
    expect(screen.getByRole('button', { name: 'Confirmar asistencia' })).toBeEnabled();
  });

  it('responder un enlace ya usado (409): recarga y muestra la respuesta registrada', async () => {
    get.mockResolvedValueOnce(view());
    respond.mockRejectedValueOnce(new ApiError(409, 'Este enlace ya se usó para responder'));
    get.mockResolvedValueOnce(
      view({ status: 'RESPONDED', response: 'cancel', respondedAt: '2026-10-19T10:00:00.000Z' }),
    );
    render(<PublicConfirmationView confirmationToken="tok-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar asistencia' }));

    expect(await screen.findByText(/cancelaste la cita/i)).toBeInTheDocument();
  });

  it('responder un enlace que caducó entretanto (410): estado caducado', async () => {
    get.mockResolvedValueOnce(view());
    respond.mockRejectedValueOnce(new ApiError(410, 'Este enlace ya no es válido'));
    render(<PublicConfirmationView confirmationToken="tok-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar cita' }));

    expect(await screen.findByRole('heading', { name: /enlace ya no es válido/i })).toBeInTheDocument();
  });
});
