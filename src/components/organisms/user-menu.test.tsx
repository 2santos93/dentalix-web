import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserMenu } from './user-menu';
import { useAuthStore } from '@/lib/auth/auth-store';
import { logout } from '@/lib/auth/auth-api';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform, so this must use a relative path (see sibling *.test.tsx files).
jest.mock('../../lib/auth/auth-api', () => ({
  logout: jest.fn().mockResolvedValue(undefined),
}));

describe('UserMenu', () => {
  beforeEach(() => {
    replace.mockClear();
    (logout as jest.Mock).mockClear();
    useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r' });
  });

  it('opens the menu and shows "Cerrar sesión"', async () => {
    const user = userEvent.setup();
    render(<UserMenu />);
    // El ítem no está visible hasta abrir el menú.
    expect(screen.queryByRole('menuitem', { name: /cerrar sesión/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: /cuenta/i }));

    expect(
      screen.getByRole('menuitem', { name: /cerrar sesión/i }),
    ).toBeInTheDocument();
  });

  it('logs out: revokes server-side, clears tokens and redirects to /login', async () => {
    const user = userEvent.setup();
    render(<UserMenu />);

    await user.click(screen.getByRole('button', { name: /cuenta/i }));
    await user.click(screen.getByRole('menuitem', { name: /cerrar sesión/i }));

    expect(logout).toHaveBeenCalledWith('r');
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
