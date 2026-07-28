import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserMenu } from './user-menu';

const push = jest.fn();
const clear = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push }) }));
jest.mock('../../lib/me/me-api', () => ({ getMe: jest.fn() }));
jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: jest.fn() }),
}));
jest.mock('../../lib/auth/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { accessToken: string | null; clear: () => void }) => unknown) =>
      selector({ accessToken: 'T', clear }),
    { getState: () => ({ clear }) },
  ),
}));
import { getMe } from '../../lib/me/me-api';

describe('UserMenu', () => {
  beforeEach(() => {
    push.mockReset();
    clear.mockReset();
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
    expect(screen.getByRole('switch', { name: /cambiar tema/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /cerrar sesión/i })).toBeInTheDocument();
  });

  it('cierra sesión: limpia el estado y redirige a /login', async () => {
    render(<UserMenu />);
    await screen.findByText('Ana Gómez');
    fireEvent.click(screen.getByRole('button', { name: /ana gómez/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /cerrar sesión/i }));
    await waitFor(() => expect(clear).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith('/login');
  });

  it('se cierra al presionar Escape', async () => {
    render(<UserMenu />);
    await screen.findByText('Ana Gómez');
    fireEvent.click(screen.getByRole('button', { name: /ana gómez/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});
