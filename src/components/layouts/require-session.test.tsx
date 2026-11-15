import { act, render, screen } from '@testing-library/react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { RequireSession, isSessionless, requireSessionCopy } from './require-session';
import { resetConnectivityForTests } from '@/lib/offline/connectivity';

const mockRefresh = jest.fn();
jest.mock('../../lib/api/client', () => ({
  refreshAccessToken: () => mockRefresh(),
}));

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

const replace = jest.fn();
let mockPathname = '/patients';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ replace, push: jest.fn() }),
}));

function renderGuard() {
  return render(
    <RequireSession>
      <h1>Pacientes</h1>
    </RequireSession>,
  );
}

describe('RequireSession (FE-020, DX-117)', () => {
  beforeEach(() => {
    replace.mockReset();
    mockPathname = '/patients';
    useAuthStore.setState({ accessToken: null, _hasHydrated: false });
  });

  it('mientras el arranque no termina: esqueleto con «Verificando sesión…» y sin redirigir', () => {
    renderGuard();
    expect(screen.getByRole('status')).toHaveTextContent(requireSessionCopy.checkingSession);
    expect(screen.getByTestId('session-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pacientes' })).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sin sesión al resolver el arranque: a /login (sin parámetro de vuelta) y sin pintar la página', () => {
    renderGuard();
    act(() => useAuthStore.getState().markResolved());
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login');
    expect(screen.queryByRole('heading', { name: 'Pacientes' })).not.toBeInTheDocument();
    // Camino de /login, el mismo esqueleto: nada de parpadeo de otra cosa.
    expect(screen.getByTestId('session-skeleton')).toBeInTheDocument();
  });

  it('con sesión: pinta la página y no redirige', () => {
    renderGuard();
    act(() => useAuthStore.getState().setAccessToken('tok'));
    expect(screen.getByRole('heading', { name: 'Pacientes' })).toBeInTheDocument();
    expect(screen.queryByTestId('session-skeleton')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('si la sesión se pierde a mitad de uso (caduca, o logout en otra pestaña): desmonta la página y va a /login', () => {
    useAuthStore.setState({ accessToken: 'tok', _hasHydrated: true });
    renderGuard();
    expect(screen.getByRole('heading', { name: 'Pacientes' })).toBeInTheDocument();

    // `clear()` es lo que hacen el logout, el refresh fallido y `onLogoutElsewhere`.
    act(() => useAuthStore.getState().clear());
    expect(screen.queryByRole('heading', { name: 'Pacientes' })).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('la ayuda estática se abre sin sesión, como antes (DX-484)', () => {
    mockPathname = '/ayuda/software-de-imagen';
    useAuthStore.setState({ accessToken: null, _hasHydrated: true });
    renderGuard();
    expect(screen.getByRole('heading', { name: 'Pacientes' })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('solo /ayuda y lo que cuelga de ella es sin sesión', () => {
    expect(isSessionless('/ayuda')).toBe(true);
    expect(isSessionless('/ayuda/software-de-imagen')).toBe(true);
    expect(isSessionless('/ayudante')).toBe(false);
    expect(isSessionless('/patients')).toBe(false);
    expect(isSessionless(null)).toBe(false);
  });

  describe('sin conexión (DX-405)', () => {
    afterEach(() => {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
      resetConnectivityForTests();
      mockRefresh.mockReset();
    });

    it('recargada sin red en /agenda: deja pasar a la pantalla (que pide el PIN si la pestaña no tiene la clave)', () => {
      mockPathname = '/agenda';
      setOnline(false);
      useAuthStore.setState({ accessToken: null, _hasHydrated: true });
      renderGuard();
      expect(screen.getByRole('heading', { name: 'Pacientes' })).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });

    it('sin red en otra pantalla: a /login como siempre (solo la agenda tiene copia)', () => {
      setOnline(false);
      useAuthStore.setState({ accessToken: null, _hasHydrated: true });
      renderGuard();
      expect(replace).toHaveBeenCalledWith('/login');
    });

    it('al volver la red renueva la sesión: con token sigue en la agenda; sin él, a /login', async () => {
      mockPathname = '/agenda';
      setOnline(false);
      useAuthStore.setState({ accessToken: null, _hasHydrated: true });
      let resolve!: (token: string | null) => void;
      mockRefresh.mockImplementation(
        () =>
          new Promise<string | null>((r) => {
            resolve = r;
          }),
      );
      renderGuard();
      setOnline(true);
      // Renovando: esqueleto, sin redirigir.
      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('session-skeleton')).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
      await act(async () => {
        useAuthStore.getState().setAccessToken('tok');
        resolve('tok');
      });
      expect(screen.getByRole('heading', { name: 'Pacientes' })).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
    });

    it('si al volver la red la sesión está muerta: a /login', async () => {
      mockPathname = '/agenda';
      setOnline(false);
      useAuthStore.setState({ accessToken: null, _hasHydrated: true });
      mockRefresh.mockResolvedValue(null);
      renderGuard();
      await act(async () => {
        setOnline(true);
      });
      expect(replace).toHaveBeenCalledWith('/login');
    });
  });
});
