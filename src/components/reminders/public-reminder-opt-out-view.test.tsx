import { render, screen } from '@testing-library/react';
import { PublicReminderOptOutView } from './public-reminder-opt-out-view';
import {
  confirmPublicReminderOptOut,
  getPublicReminderOptOut,
  type PublicReminderOptOut,
} from '@/lib/reminders/opt-out-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/reminders/opt-out-api', () => ({
  getPublicReminderOptOut: jest.fn(),
  confirmPublicReminderOptOut: jest.fn(),
}));

const mockedGet = getPublicReminderOptOut as jest.MockedFunction<typeof getPublicReminderOptOut>;
const mockedConfirm = confirmPublicReminderOptOut as jest.MockedFunction<
  typeof confirmPublicReminderOptOut
>;

const view = (over: Partial<PublicReminderOptOut> = {}): PublicReminderOptOut => ({
  status: 'ACTIVE',
  patientFirstName: 'Carolina',
  optedOutAt: null,
  clinic: { name: 'Sonrisas del Norte', primaryColor: '#0E7490', logoUrl: null },
  ...over,
});

describe('PublicReminderOptOutView (DX-128)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('abrir el enlace solo pregunta: no da de baja', async () => {
    mockedGet.mockResolvedValue(view());
    render(<PublicReminderOptOutView optOutToken="tok" />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    expect(await screen.findByRole('heading', { name: 'Sonrisas del Norte' })).toBeInTheDocument();
    expect(
      screen.getByText('Hola Carolina, ¿quieres dejar de recibir los recordatorios de tus citas?'),
    ).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('tok');
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('confirmar da de baja y lo dice con la fecha', async () => {
    mockedGet.mockResolvedValue(view());
    mockedConfirm.mockResolvedValue(
      view({ status: 'OPTED_OUT', optedOutAt: '2026-10-17T15:00:00.000Z' }),
    );
    const user = setupUser();
    render(<PublicReminderOptOutView optOutToken="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Dejar de recibir recordatorios' }));
    expect(mockedConfirm).toHaveBeenCalledWith('tok');
    expect(await screen.findByRole('heading', { name: 'Listo: ya no recibirás recordatorios' })).toBeInTheDocument();
    expect(screen.getByText(/Desde el 17\/10\/2026/)).toBeInTheDocument();
  });

  it('si ya estaba dado de baja lo muestra sin pedir nada', async () => {
    mockedGet.mockResolvedValue(view({ status: 'OPTED_OUT', optedOutAt: '2026-10-01T15:00:00.000Z' }));
    render(<PublicReminderOptOutView optOutToken="tok" />);
    expect(await screen.findByRole('heading', { name: 'Listo: ya no recibirás recordatorios' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('un enlace desconocido explica que no es válido', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'Enlace de baja no encontrado'));
    render(<PublicReminderOptOutView optOutToken="tok" />);
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
  });

  it('error de red al cargar: sección con reintento', async () => {
    mockedGet.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(view());
    const user = setupUser();
    render(<PublicReminderOptOutView optOutToken="tok" />);
    await user.click(await screen.findByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('button', { name: 'Dejar de recibir recordatorios' })).toBeInTheDocument();
  });

  it('si falla la baja lo dice y deja reintentar', async () => {
    mockedGet.mockResolvedValue(view());
    mockedConfirm.mockRejectedValueOnce(new Error('red'));
    const user = setupUser();
    render(<PublicReminderOptOutView optOutToken="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Dejar de recibir recordatorios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos registrar tu baja. Revisa tu conexión e intenta de nuevo.',
    );
    expect(screen.getByRole('button', { name: 'Dejar de recibir recordatorios' })).toBeEnabled();
  });
});
