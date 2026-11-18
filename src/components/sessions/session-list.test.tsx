import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  listMySessions,
  listStaffSessions,
  revokeAllStaffSessions,
  revokeMyOtherSessions,
  revokeMySession,
  type UserSession,
} from '@/lib/auth/sessions-api';
import { SessionList } from './session-list';

jest.mock('../../lib/auth/sessions-api', () => ({
  listMySessions: jest.fn(),
  listStaffSessions: jest.fn(),
  revokeMySession: jest.fn(),
  revokeMyOtherSessions: jest.fn(),
  revokeStaffSession: jest.fn(),
  revokeAllStaffSessions: jest.fn(),
}));
jest.mock('../../lib/locations/sede-stamp', () => ({
  useSedeStamp: () => ({
    dateTime: (iso: string) => `fecha(${iso.slice(0, 10)})`,
    status: 'ready',
  }),
}));
jest.mock('../locations/sede-stamp-note', () => ({
  SedeStampNote: () => null,
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

const listMine = listMySessions as jest.MockedFunction<typeof listMySessions>;
const listStaff = listStaffSessions as jest.MockedFunction<typeof listStaffSessions>;
const revokeOne = revokeMySession as jest.MockedFunction<typeof revokeMySession>;
const revokeOthers = revokeMyOtherSessions as jest.MockedFunction<typeof revokeMyOtherSessions>;
const revokeAll = revokeAllStaffSessions as jest.MockedFunction<typeof revokeAllStaffSessions>;

const session = (over: Partial<UserSession>): UserSession => ({
  id: 'b7f1c2d4-0000-4000-8000-000000000001',
  deviceLabel: 'Chrome en Windows',
  ipPrefix: '190.202.15.0/24',
  firstSeenAt: '2026-11-17T12:00:00.000Z',
  lastSeenAt: '2026-11-18T12:00:00.000Z',
  current: false,
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('SessionList (DX-137)', () => {
  it('lista las propias con «Este dispositivo» marcado y la red truncada', async () => {
    listMine.mockResolvedValue([
      session({ id: 'a', current: true }),
      session({
        id: 'b',
        deviceLabel: 'Safari en iOS',
        ipPrefix: '200.44.32.0/24',
      }),
    ]);
    render(<SessionList mode="self" token="tok" onCloseCurrent={jest.fn()} />);
    expect(screen.getByRole('status', { name: 'Cargando sesiones…' })).toBeInTheDocument();
    expect(await screen.findByText('Este dispositivo')).toBeInTheDocument();
    expect(screen.getByText(/Red 200\.44\.32\.0\/24/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar la sesión de Safari en iOS' })).toBeInTheDocument();
  });

  it('cerrar otra la quita; cerrar la actual es salir', async () => {
    const user = userEvent.setup();
    const onCloseCurrent = jest.fn();
    listMine.mockResolvedValue([
      session({ id: 'a', current: true }),
      session({ id: 'b', deviceLabel: 'Safari en iOS' }),
    ]);
    revokeOne.mockResolvedValue();
    render(<SessionList mode="self" token="tok" onCloseCurrent={onCloseCurrent} />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Cerrar la sesión de Safari en iOS',
      }),
    );
    expect(revokeOne).toHaveBeenCalledWith('tok', 'b');
    expect(screen.queryByText('Safari en iOS')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(onCloseCurrent).toHaveBeenCalled();
    expect(revokeOne).toHaveBeenCalledTimes(1);
  });

  it('«Cerrar todas las demás» deja solo la actual', async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValue([
      session({ id: 'a', current: true }),
      session({ id: 'b', deviceLabel: 'Firefox en Linux' }),
    ]);
    revokeOthers.mockResolvedValue(1);
    render(<SessionList mode="self" token="tok" onCloseCurrent={jest.fn()} />);
    await user.click(await screen.findByRole('button', { name: 'Cerrar todas las demás' }));
    expect(screen.queryByText('Firefox en Linux')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar todas las demás' })).not.toBeInTheDocument();
  });

  it('error: escalón 1 con «Reintentar», que vuelve a pedir', async () => {
    const user = userEvent.setup();
    listMine.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce([session({ current: true })]);
    render(<SessionList mode="self" token="tok" onCloseCurrent={jest.fn()} />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('No pudimos cargar las sesiones.')).toBeInTheDocument();
    await user.click(within(alert).getByRole('button'));
    expect(await screen.findByText('Este dispositivo')).toBeInTheDocument();
    expect(listMine).toHaveBeenCalledTimes(2);
  });

  it('miembro sin sesiones: estado vacío', async () => {
    listStaff.mockResolvedValue([]);
    render(<SessionList mode="member" token="tok" userId="u1" memberName="Ana" />);
    expect(await screen.findByText('No tiene sesiones abiertas en esta clínica.')).toBeInTheDocument();
  });

  it('el ADMIN cierra todas las de un miembro', async () => {
    const user = userEvent.setup();
    listStaff.mockResolvedValue([session({ id: 'x' })]);
    revokeAll.mockResolvedValue(1);
    render(<SessionList mode="member" token="tok" userId="u1" memberName="Ana" />);
    await user.click(await screen.findByRole('button', { name: 'Cerrar todas' }));
    expect(revokeAll).toHaveBeenCalledWith('tok', 'u1');
    expect(await screen.findByText('No tiene sesiones abiertas en esta clínica.')).toBeInTheDocument();
  });
});
