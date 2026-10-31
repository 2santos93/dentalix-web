import { render, screen } from '@testing-library/react';
import LocationCalendarPage from './page';
import { useAuthStore } from '@/lib/auth/auth-store';
import { tokenFor } from '@/lib/test/prescriptions';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));
jest.mock('../../../../components/location-calendar/location-calendar-view', () => ({
  LocationCalendarView: ({ token, allowed }: { token: string; allowed: boolean }) => (
    <section aria-label="Calendario" data-token={token} data-allowed={String(allowed)} />
  ),
}));

describe('Ajustes → Calendario de la sede (DX-316)', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('shows the header with «← Ajustes» and the view with the session token', () => {
    const tok = tokenFor('ADMIN', 'u-admin');
    useAuthStore.setState({ accessToken: tok, _hasHydrated: true });
    render(<LocationCalendarPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Calendario de la sede' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Qué días cuentan como hábiles y qué días son festivos en cada sede. Lo usan los plazos que se cuentan en días hábiles.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ajustes/ })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('region', { name: 'Calendario' })).toHaveAttribute('data-token', tok);
    expect(screen.getByRole('region', { name: 'Calendario' })).toHaveAttribute('data-allowed', 'true');
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'])('a %s token is not allowed (the view locks itself)', (role) => {
    useAuthStore.setState({ accessToken: tokenFor(role), _hasHydrated: true });
    render(<LocationCalendarPage />);
    expect(screen.getByRole('region', { name: 'Calendario' })).toHaveAttribute('data-allowed', 'false');
  });

  it('without a session goes to /login', () => {
    useAuthStore.setState({ accessToken: null, _hasHydrated: true });
    render(<LocationCalendarPage />);
    expect(replace).toHaveBeenCalledWith('/login');
    expect(screen.queryByRole('region', { name: 'Calendario' })).not.toBeInTheDocument();
  });
});
