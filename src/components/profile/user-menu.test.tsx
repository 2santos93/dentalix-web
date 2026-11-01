import { auditRenderedControls } from '@/lib/test/rendered-a11y';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/lib/test/user';
import { UserMenu } from './user-menu';

const push = jest.fn();
const clear = jest.fn();
const setTheme = jest.fn();
let mockAccessToken = 'T';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push }) }));
jest.mock('../../lib/me/me-api', () => ({ getMe: jest.fn() }));
jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme }),
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

function tokenForRole(role: string): string {
  const part = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part('{"alg":"HS256"}')}.${part(JSON.stringify({ sub: 'u1', tenantId: 't1', role }))}.sig`;
}

describe('UserMenu', () => {
  beforeEach(() => {
    push.mockReset();
    clear.mockReset();
    setTheme.mockReset();
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
  afterEach(() => {
    mockAccessToken = 'T';
  });

  it('DX-297 audits initials and image/fallback states with account purpose and full identity', async () => {
    const snapshots = [];
    for (const variant of ['compact', 'rail'] as const) {
      const view = render(<UserMenu variant={variant} />);
      await screen.findByText('AG');
      expect(screen.getByRole('button')).toHaveAccessibleName('AG · Cuenta · Ana Gómez');
      snapshots.push({ html: view.container.innerHTML, selector: 'button[aria-haspopup="menu"]' });
      view.unmount();
    }
    auditRenderedControls(snapshots);
  });

  it('DX-297 retains full account identity with an image and a loading fallback', async () => {
    (getMe as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
    const loading = render(<UserMenu variant="compact" />);
    expect(screen.getByRole('button', { name: 'Cuenta' })).toHaveTextContent('·');
    auditRenderedControls([{ html: loading.container.innerHTML, selector: 'button' }]);
    loading.unmount();
    (getMe as jest.Mock).mockResolvedValueOnce({ id: 'u1', fullName: 'Ana Gómez', avatarUrl: '/synthetic-avatar.png', memberships: [] });
    const image = render(<UserMenu variant="compact" />);
    await waitFor(() => expect(image.container.querySelector('img')).not.toBeNull());
    expect(screen.getByRole('button', { name: 'Cuenta · Ana Gómez' })).toBeInTheDocument();
    auditRenderedControls([{ html: image.container.innerHTML, selector: 'button' }]);
  });

  it('muestra el nombre y el rol del usuario', async () => {
    render(<UserMenu />);
    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getByText('Administrador/a')).toBeInTheDocument();
  });

  it('el menú está cerrado hasta hacer clic', async () => {
    const user = setupUser();
    render(<UserMenu />);
    await screen.findByText('Ana Gómez');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /ana gómez/i }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
  });

  it('DX-282: solo Mi perfil, Ajustes, el tema y Cerrar sesión — también para ADMIN', async () => {
    // Con 21 entradas el menú no cabía en una pantalla de 1366×768 (FE-062):
    // los ajustes de la clínica viven ahora en /settings.
    mockAccessToken = tokenForRole('ADMIN');
    const user = setupUser();
    render(<UserMenu />);
    await user.click(await screen.findByRole('button', { name: /ana gómez/i }));
    await screen.findByRole('menu');

    expect(screen.getByRole('menuitem', { name: 'Mi perfil' })).toHaveAttribute(
      'href',
      '/settings/profile',
    );
    expect(screen.getByRole('menuitem', { name: 'Ajustes' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Tema oscuro' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('menuitem', { name: /cerrar sesión/i })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    for (const gone of ['Horarios', 'Sedes', 'Consentimientos', 'Recordatorios', 'Convenios']) {
      expect(screen.queryByRole('menuitem', { name: gone })).not.toBeInTheDocument();
    }
  });

  it('los cuatro roles ven el mismo menú: «Ajustes» no depende del rol', async () => {
    // Horarios, Sedes y Privacidad de datos los leen todos: el índice decide
    // qué enseña a cada uno, el menú no.
    const user = setupUser();
    for (const role of ['ADMIN', 'DENTIST', 'ASSISTANT', 'RECEPTION']) {
      mockAccessToken = tokenForRole(role);
      const { unmount } = render(<UserMenu />);
      await user.click(await screen.findByRole('button', { name: /ana gómez/i }));
      const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
      expect({ role, items }).toEqual({ role, items: ['Mi perfil', 'Ajustes', 'Cerrar sesión'] });
      unmount();
    }
  });

  it('cambiar el tema no cierra el menú', async () => {
    const user = setupUser();
    render(<UserMenu />);
    await user.click(await screen.findByRole('button', { name: /ana gómez/i }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Tema oscuro' }));
    expect(setTheme).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  describe('teclado', () => {
    it('Enter abre con el foco en el primer ítem; las flechas recorren y Escape devuelve el foco al disparador', async () => {
      const user = setupUser();
      render(<UserMenu />);
      const trigger = await screen.findByRole('button', { name: /ana gómez/i });
      trigger.focus();

      await user.keyboard('{Enter}');
      await screen.findByRole('menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Mi perfil' })).toHaveFocus());

      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: 'Ajustes' })).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitemcheckbox', { name: 'Tema oscuro' })).toHaveFocus();
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('menuitem', { name: /cerrar sesión/i })).toHaveFocus();
      await user.keyboard('{ArrowUp}');
      expect(screen.getByRole('menuitemcheckbox', { name: 'Tema oscuro' })).toHaveFocus();

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
    });

    it('la flecha hacia arriba en el primero salta al último (bucle)', async () => {
      const user = setupUser();
      render(<UserMenu variant="compact" />);
      const trigger = await screen.findByRole('button', { name: 'Cuenta' });
      trigger.focus();
      await user.keyboard('{Enter}');
      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Mi perfil' })).toHaveFocus());
      await user.keyboard('{ArrowUp}');
      expect(screen.getByRole('menuitem', { name: /cerrar sesión/i })).toHaveFocus();
    });
  });

  async function clickLogout() {
    const user = setupUser();
    render(<UserMenu />);
    await user.click(await screen.findByRole('button', { name: /ana gómez/i }));
    await user.click(await screen.findByRole('menuitem', { name: /cerrar sesión/i }));
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

  it('mientras se cierra la sesión el menú sigue abierto con el ítem ocupado y deshabilitado', async () => {
    (logout as jest.Mock).mockReturnValue(new Promise(() => {}));
    await clickLogout();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    const item = screen.getByRole('menuitem', { name: 'Cerrando sesión…' });
    expect(item).toHaveAttribute('aria-busy', 'true');
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(push).not.toHaveBeenCalled();
    // Un segundo clic no vuelve a pedir el logout.
    const user = setupUser();
    await user.click(item);
    expect(logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'), { timeout: 4000 });
  }, 10_000);

  it('si logout no responde, limpia y redirige tras el timeout corto (DX-061)', async () => {
    (logout as jest.Mock).mockReturnValue(new Promise(() => {}));
    await clickLogout();
    expect(logout).toHaveBeenCalledWith();
    expect(clear).not.toHaveBeenCalled();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'), { timeout: 4000 });
    expect(clear).toHaveBeenCalled();
  }, 10_000);
});
