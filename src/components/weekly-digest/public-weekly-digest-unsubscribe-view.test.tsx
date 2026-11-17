import { render, screen } from '@testing-library/react';
import { PublicWeeklyDigestUnsubscribeView } from './public-weekly-digest-unsubscribe-view';
import {
  confirmWeeklyDigestUnsubscribe,
  getWeeklyDigestUnsubscribe,
} from '@/lib/public/weekly-digest-unsubscribe-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/public/weekly-digest-unsubscribe-api', () => ({
  getWeeklyDigestUnsubscribe: jest.fn(),
  confirmWeeklyDigestUnsubscribe: jest.fn(),
}));

const mockedGet = getWeeklyDigestUnsubscribe as jest.MockedFunction<typeof getWeeklyDigestUnsubscribe>;
const mockedConfirm = confirmWeeklyDigestUnsubscribe as jest.MockedFunction<typeof confirmWeeklyDigestUnsubscribe>;

describe('PublicWeeklyDigestUnsubscribeView (DX-568)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('abrir el enlace muestra la clínica y pregunta: no da de baja', async () => {
    mockedGet.mockResolvedValue({ clinicName: 'Clínica Dental Sonrisas', status: 'ACTIVE' });
    render(<PublicWeeklyDigestUnsubscribeView unsubscribeToken="tok" />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    expect(await screen.findByRole('heading', { level: 1, name: 'Clínica Dental Sonrisas' })).toBeInTheDocument();
    expect(screen.getByText('¿Quieres dejar de recibir el resumen semanal por email?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dejar de recibir el resumen' })).toBeEnabled();
    expect(mockedGet).toHaveBeenCalledWith('tok');
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('confirmar da de baja y lo dice', async () => {
    mockedGet.mockResolvedValue({ clinicName: 'Clínica Dental Sonrisas', status: 'ACTIVE' });
    mockedConfirm.mockResolvedValue({ clinicName: 'Clínica Dental Sonrisas', status: 'ALREADY_OUT' });
    const user = setupUser();
    render(<PublicWeeklyDigestUnsubscribeView unsubscribeToken="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Dejar de recibir el resumen' }));
    expect(mockedConfirm).toHaveBeenCalledWith('tok');
    expect(await screen.findByRole('heading', { name: 'Ya no recibes este resumen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dejar de recibir el resumen' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('un enlace ya usado (o de quien ya no es administrador) dice «Ya no recibes este resumen» sin botón', async () => {
    mockedGet.mockResolvedValue({ clinicName: 'Clínica Dental Sonrisas', status: 'ALREADY_OUT' });
    render(<PublicWeeklyDigestUnsubscribeView unsubscribeToken="tok" />);
    expect(await screen.findByRole('heading', { name: 'Ya no recibes este resumen' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('404: el enlace no existe o caducó, sin reintento', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'El enlace para dejar de recibir el resumen no existe o caducó.'));
    render(<PublicWeeklyDigestUnsubscribeView unsubscribeToken="inventado" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'El enlace no existe o caducó' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('otro error al abrir: reintento que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce({ clinicName: 'Clínica Dental Sonrisas', status: 'ACTIVE' });
    const user = setupUser();
    render(<PublicWeeklyDigestUnsubscribeView unsubscribeToken="tok" />);
    expect(await screen.findByText('No pudimos abrir el enlace. Revisa tu conexión.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Dejar de recibir el resumen' })).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('si falla la baja, avisa junto al botón; un 404 al confirmar es enlace caducado', async () => {
    mockedGet.mockResolvedValue({ clinicName: 'Clínica Dental Sonrisas', status: 'ACTIVE' });
    mockedConfirm.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedConfirm.mockRejectedValueOnce(new ApiError(404, 'no'));
    const user = setupUser();
    render(<PublicWeeklyDigestUnsubscribeView unsubscribeToken="tok" />);
    const button = await screen.findByRole('button', { name: 'Dejar de recibir el resumen' });
    await user.click(button);
    expect(
      await screen.findByText('No pudimos registrar tu baja. Revisa tu conexión e intenta de nuevo.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dejar de recibir el resumen' }));
    expect(await screen.findByRole('heading', { name: 'El enlace no existe o caducó' })).toBeInTheDocument();
  });
});
