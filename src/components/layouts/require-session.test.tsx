import { act, render, screen } from '@testing-library/react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { RequireSession, isSessionless, requireSessionCopy } from './require-session';

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
});
