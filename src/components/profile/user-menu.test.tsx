import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserMenu } from './user-menu';

const push = jest.fn();
const clear = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: push }) }));
jest.mock('../../lib/me/me-api', () => ({ getMe: jest.fn() }));
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
      id: 'u1', email: 'a@b.com', fullName: 'Ana Gómez', avatarUrl: null, emailVerifiedAt: null, memberships: [],
    });
  });

  it('shows the user name and logs out', async () => {
    render(<UserMenu />);
    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ana gómez|menú|cuenta/i }));
    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    await waitFor(() => expect(clear).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith('/login');
  });
});
