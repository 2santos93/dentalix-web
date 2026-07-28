import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogoutButton } from './logout-button';
import { useAuthStore } from '@/lib/auth/auth-store';
// Relative path: SWC no reescribe el alias '@/' dentro de jest.mock, así que el
// mock debe resolver al mismo módulo absoluto que importa el componente.
import { logout } from '../../lib/auth/auth-api';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));
jest.mock('../../lib/auth/auth-api', () => ({
  logout: jest.fn().mockResolvedValue(undefined),
}));

describe('LogoutButton', () => {
  beforeEach(() => {
    replace.mockClear();
    (logout as jest.Mock).mockClear();
    useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r' });
  });

  it('revokes server-side, clears tokens and redirects to /login', async () => {
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: /cerrar sesión/i }));

    expect(logout).toHaveBeenCalledWith('r');
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('still clears and redirects when there is no refresh token', async () => {
    useAuthStore.getState().clear();
    const user = userEvent.setup();
    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: /cerrar sesión/i }));

    expect(logout).not.toHaveBeenCalled();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
