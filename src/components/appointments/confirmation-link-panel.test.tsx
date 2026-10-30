import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmationLinkPanel } from './confirmation-link-panel';
import { createConfirmationLink } from '../../lib/appointments/confirmations-api';
import { ApiError } from '../../lib/api/client';
import type { Appointment } from '../../lib/appointments/appointments-api';
import { testAgendaClock } from '@/lib/test/sede-clock';

/** Reloj de la sede de pruebas (UTC, 24 h): estas pruebas no tratan del reloj. */
const CLOCK = testAgendaClock();

jest.mock('../../lib/appointments/confirmations-api', () => ({
  createConfirmationLink: jest.fn(),
}));
jest.mock('../../lib/api/client', () => ({
  // La clase real: `apiErrorMessage` la reconoce con `instanceof`.
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));

const create = createConfirmationLink as jest.Mock;
const FUTURE = new Date(Date.now() + 2 * 24 * 3600_000);

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    tenantId: 't1',
    patientId: 'p1',
    patientFirstName: 'Ana',
    patientLastName: 'Pérez',
    providerId: 'u1',
    start: FUTURE.toISOString(),
    end: new Date(FUTURE.getTime() + 30 * 60_000).toISOString(),
    status: 'SCHEDULED',
    reason: null,
    notes: null,
    createdById: null,
    locationId: 'loc-1',
    appointmentTypeId: null,
    appointmentType: null,
    confirmationSentAt: null,
    callbackRequestedAt: null,
    wantsEarlier: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function link(whatsappPhone: string | null = '573105550101') {
  return {
    url: 'http://demo.localhost:3001/confirmar/tok_123',
    expiresAt: FUTURE.toISOString(),
    whatsappPhone,
    appointment: {
      patientFirstName: 'Ana',
      start: '2026-10-20T14:00:00.000Z',
      end: '2026-10-20T14:30:00.000Z',
      providerName: 'Dra. Pérez',
      locationName: 'Sede Norte',
      locationAddress: null,
    },
  };
}

describe('ConfirmationLinkPanel', () => {
  const writeText = jest.fn();

  beforeEach(() => {
    create.mockReset();
    writeText.mockReset().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });

  it('genera el enlace y ofrece copiarlo y abrir WhatsApp con el mensaje prellenado', async () => {
    create.mockResolvedValueOnce(link());
    const onLinkCreated = jest.fn();

    render(<ConfirmationLinkPanel clock={CLOCK} token="jwt" appointment={appointment()} onLinkCreated={onLinkCreated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar confirmación' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith('jwt', 'appt-1'));
    expect(await screen.findByLabelText('Enlace de confirmación')).toHaveValue(
      'http://demo.localhost:3001/confirmar/tok_123',
    );
    expect(onLinkCreated).toHaveBeenCalledTimes(1);

    const wa = screen.getByRole('link', { name: /abrir whatsapp/i });
    const href = wa.getAttribute('href') ?? '';
    expect(href.startsWith('https://wa.me/573105550101?text=')).toBe(true);
    const text = decodeURIComponent(href.split('?text=')[1]);
    expect(text).toContain('Hola Ana');
    expect(text).toContain('martes, 20 de octubre a las 14:00');
    expect(text).toContain('Dra. Pérez');
    expect(text).toContain('Sede Norte');
    expect(text).toContain('http://demo.localhost:3001/confirmar/tok_123');
    expect(wa).toHaveAttribute('target', '_blank');
    expect(wa).toHaveAttribute('rel', expect.stringContaining('noopener'));

    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('http://demo.localhost:3001/confirmar/tok_123'),
    );
    expect(await screen.findByText('Enlace copiado')).toBeInTheDocument();
  });

  it('sin teléfono utilizable: "Abrir WhatsApp" deshabilitado con la explicación', async () => {
    create.mockResolvedValueOnce(link(null));
    render(<ConfirmationLinkPanel clock={CLOCK} token="jwt" appointment={appointment()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar confirmación' }));

    const wa = await screen.findByRole('button', { name: /abrir whatsapp/i });
    expect(wa).toBeDisabled();
    expect(
      screen.getByText('El teléfono del paciente no sirve para WhatsApp: revísalo en su ficha o escríbelo con + y su prefijo. También puedes copiar el enlace.'),
    ).toBeInTheDocument();
    expect(wa).toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('link', { name: /abrir whatsapp/i })).not.toBeInTheDocument();
    // Copiar sigue disponible.
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeEnabled();
  });

  it('si el portapapeles no está disponible, lo dice y deja el enlace seleccionado', async () => {
    create.mockResolvedValueOnce(link());
    writeText.mockRejectedValueOnce(new Error('denied'));
    render(<ConfirmationLinkPanel clock={CLOCK} token="jwt" appointment={appointment()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar confirmación' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar enlace' }));
    expect(await screen.findByText(/cópialo a mano/i)).toBeInTheDocument();
  });

  it('error al generar: mensaje junto al botón, que sigue disponible', async () => {
    create.mockRejectedValueOnce(new ApiError(409, 'Solo se puede pedir confirmación de una cita agendada o confirmada'));
    render(<ConfirmationLinkPanel clock={CLOCK} token="jwt" appointment={appointment()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar confirmación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/solo se puede pedir confirmación/i);
    expect(screen.getByRole('button', { name: 'Enviar confirmación' })).toBeEnabled();
  });

  it.each([
    ['CANCELLED', /cancelada/i],
    ['COMPLETED', /completada/i],
  ] as const)('cita %s: botón deshabilitado con la razón', (status, reason) => {
    render(<ConfirmationLinkPanel clock={CLOCK} token="jwt" appointment={appointment({ status })} />);
    expect(screen.getByRole('button', { name: 'Enviar confirmación' })).toBeDisabled();
    expect(screen.getByText(reason)).toBeInTheDocument();
  });

  it('cita que ya empezó: deshabilitado', () => {
    render(
      <ConfirmationLinkPanel clock={CLOCK}
        token="jwt"
        appointment={appointment({ start: new Date(Date.now() - 60_000).toISOString() })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Enviar confirmación' })).toBeDisabled();
    expect(screen.getByText(/ya empezó/i)).toBeInTheDocument();
  });

  it('muestra el estado actual: confirmación pendiente / pide llamada', () => {
    const { rerender } = render(
      <ConfirmationLinkPanel clock={CLOCK}
        token="jwt"
        appointment={appointment({ confirmationSentAt: '2026-10-10T00:00:00.000Z' })}
      />,
    );
    expect(screen.getByText(/confirmación pendiente/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar confirmación' })).toBeEnabled();

    rerender(
      <ConfirmationLinkPanel clock={CLOCK}
        token="jwt"
        appointment={appointment({ callbackRequestedAt: '2026-10-10T00:00:00.000Z' })}
      />,
    );
    expect(screen.getByText(/pide llamada/i)).toBeInTheDocument();
  });
});
