import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserMenu } from './user-menu';

const push = jest.fn();
const clear = jest.fn();
let mockAccessToken = 'T';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push }) }));
jest.mock('../../lib/me/me-api', () => ({ getMe: jest.fn() }));
jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: jest.fn() }),
}));
jest.mock('../../lib/auth/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { accessToken: string | null; clear: () => void }) => unknown) =>
      selector({ accessToken: mockAccessToken, clear }),
    { getState: () => ({ clear }) },
  ),
}));
jest.mock('../../lib/auth/auth-api', () => ({ logout: jest.fn() }));
import { getMe } from '../../lib/me/me-api';
import { logout } from '../../lib/auth/auth-api';

describe('UserMenu', () => {
  beforeEach(() => {
    push.mockReset();
    clear.mockReset();
    (logout as jest.Mock).mockReset().mockResolvedValue(undefined);
    (getMe as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      fullName: 'Ana Gómez',
      avatarUrl: null,
      emailVerifiedAt: null,
      memberships: [{ tenantId: 't1', clinicName: 'Sonrisa', role: 'ADMIN' }],
    });
  });

  it('muestra el nombre y el rol del usuario', async () => {
    render(<UserMenu />);
    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getByText('Administrador/a')).toBeInTheDocument();
  });

  it('el menú está cerrado hasta hacer clic', async () => {
    render(<UserMenu />);
    await screen.findByText('Ana Gómez');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ana gómez/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('el menú expone perfil, switch de tema y cerrar sesión', async () => {
    render(<UserMenu />);
    await screen.findByText('Ana Gómez');
    fireEvent.click(screen.getByRole('button', { name: /ana gómez/i }));
    expect(screen.getByRole('menuitem', { name: /mi perfil/i })).toHaveAttribute(
      'href',
      '/settings/profile',
    );
    // Única entrada a la pantalla de horarios: sin esto la ruta existe pero no
    // se puede llegar a ella desde la app.
    expect(screen.getByRole('menuitem', { name: /horario de atención/i })).toHaveAttribute(
      'href',
      '/settings/horarios',
    );
    expect(screen.getByRole('switch', { name: /cambiar tema/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /cerrar sesión/i })).toBeInTheDocument();
  });

  async function clickLogout() {
    render(<UserMenu />);
    await screen.findByText('Ana Gómez');
    fireEvent.click(screen.getByRole('button', { name: /ana gómez/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /cerrar sesión/i }));
  }

  it('cierra sesión: revoca el refresh token ANTES de limpiar el estado y redirige a /login (DX-061)', async () => {
    const order: string[] = [];
    (logout as jest.Mock).mockImplementation(async () => {
      order.push('logout');
    });
    clear.mockImplementation(() => order.push('clear'));
    push.mockImplementation(() => order.push('push'));
    await clickLogout();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledWith();
    expect(order).toEqual(['logout', 'clear', 'push']);
  });

  it('si logout rechaza, igualmente limpia el estado y redirige a /login (DX-061)', async () => {
    (logout as jest.Mock).mockRejectedValue(new Error('network down'));
    await clickLogout();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(logout).toHaveBeenCalledWith();
    expect(clear).toHaveBeenCalled();
  });

  it('si logout no responde, limpia y redirige tras el timeout corto (DX-061)', async () => {
    (logout as jest.Mock).mockReturnValue(new Promise(() => {}));
    await clickLogout();
    expect(logout).toHaveBeenCalledWith();
    expect(clear).not.toHaveBeenCalled();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'), { timeout: 4000 });
    expect(clear).toHaveBeenCalled();
  }, 10_000);

  it('se cierra al presionar Escape', async () => {
    render(<UserMenu />);
    await screen.findByText('Ana Gómez');
    fireEvent.click(screen.getByRole('button', { name: /ana gómez/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});

describe('UserMenu — plantillas de consentimiento (DX-006)', () => {
  function tokenForRole(role: string): string {
    const part = (value: string) =>
      btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${part('{"alg":"HS256"}')}.${part(JSON.stringify({ sub: 'u1', tenantId: 't1', role }))}.sig`;
  }

  beforeEach(() => {
    (getMe as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      fullName: 'Ana Gómez',
      avatarUrl: null,
      emailVerifiedAt: null,
      memberships: [{ tenantId: 't1', clinicName: 'Sonrisa', role: 'ADMIN' }],
    });
  });
  afterEach(() => {
    mockAccessToken = 'T';
  });

  it('ADMIN ve el acceso a /settings/consentimientos', async () => {
    mockAccessToken = tokenForRole('ADMIN');
    render(<UserMenu />);
    fireEvent.click(await screen.findByRole('button', { name: /ana gómez/i }));
    expect(screen.getByRole('menuitem', { name: 'Consentimientos' })).toHaveAttribute(
      'href',
      '/settings/consentimientos',
    );
    // DX-013: plantillas de receta y país de las sedes.
    expect(screen.getByRole('menuitem', { name: 'Recetas' })).toHaveAttribute(
      'href',
      '/settings/recetas',
    );
    // DX-026: recordatorios por email de cada sede.
    expect(screen.getByRole('menuitem', { name: 'Recordatorios' })).toHaveAttribute(
      'href',
      '/settings/recordatorios',
    );
    // DX-191: búsqueda de implantes por lote.
    expect(screen.getByRole('menuitem', { name: 'Implantes' })).toHaveAttribute(
      'href',
      '/settings/implantes',
    );
    // SEC-009: dominios propios (añadir, verificar, eliminar).
    expect(screen.getByRole('menuitem', { name: 'Dominios propios' })).toHaveAttribute(
      'href',
      '/settings/dominios',
    );
    // SEC-008: accesos de soporte (break-glass) de Dentalix a la clínica.
    expect(screen.getByRole('menuitem', { name: 'Accesos de soporte' })).toHaveAttribute(
      'href',
      '/settings/accesos-de-soporte',
    );
    // DX-222: plantillas de indicaciones postoperatorias.
    expect(screen.getByRole('menuitem', { name: 'Indicaciones postoperatorias' })).toHaveAttribute(
      'href',
      '/settings/indicaciones',
    );
    // DX-153: catálogo de pagadores.
    expect(screen.getByRole('menuitem', { name: 'Pagadores' })).toHaveAttribute(
      'href',
      '/settings/pagadores',
    );
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'])('%s no lo ve', async (role) => {
    mockAccessToken = tokenForRole(role);
    render(<UserMenu />);
    fireEvent.click(await screen.findByRole('button', { name: /ana gómez/i }));
    expect(screen.queryByRole('menuitem', { name: 'Consentimientos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Recetas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Recordatorios' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Dominios propios' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Implantes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Accesos de soporte' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Indicaciones postoperatorias' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Pagadores' })).not.toBeInTheDocument();
  });
});
