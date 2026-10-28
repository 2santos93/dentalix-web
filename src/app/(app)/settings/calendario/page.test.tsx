import { render, screen } from '@testing-library/react';
import LocationCalendarPage from './page';
import { useAuthStore } from '@/lib/auth/auth-store';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));
jest.mock('../../../../components/location-calendar/location-calendar-view', () => ({
  LocationCalendarView: ({ token }: { token: string }) => <section aria-label="Calendario" data-token={token} />,
}));

describe('Ajustes → Calendario de la sede (DX-316)', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('shows the header with «← Ajustes» and the view with the session token', () => {
    useAuthStore.setState({ accessToken: 'tok', _hasHydrated: true });
    render(<LocationCalendarPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Calendario de la sede' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Qué días cuentan como hábiles y qué días son festivo en cada sede. Lo usan los plazos que se cuentan en días hábiles.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ajustes/ })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('region', { name: 'Calendario' })).toHaveAttribute('data-token', 'tok');
  });

  it('without a session goes to /login', () => {
    useAuthStore.setState({ accessToken: null, _hasHydrated: true });
    render(<LocationCalendarPage />);
    expect(replace).toHaveBeenCalledWith('/login');
    expect(screen.queryByRole('region', { name: 'Calendario' })).not.toBeInTheDocument();
  });
});
