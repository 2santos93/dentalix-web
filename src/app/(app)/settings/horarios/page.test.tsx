import { render, screen } from '@testing-library/react';
import BusinessHoursPage from './page';
import { useAuthStore } from '@/lib/auth/auth-store';

let search = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/settings/horarios',
  useSearchParams: () => search,
}));
jest.mock('../../../../components/locations/business-hours-form', () => ({
  BusinessHoursForm: () => <section aria-label="Horario de la sede" />,
}));
jest.mock('../../../../components/locations/provider-schedules-panel', () => ({
  ProviderSchedulesPanel: () => null,
}));
jest.mock('../../../../components/locations/schedule-roster', () => ({
  ScheduleRoster: () => null,
}));

describe('Ajustes → Horarios', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'tok', _hasHydrated: true });
    search = new URLSearchParams();
  });

  it('the Sede tab points to Calendario de la sede for business-day deadlines (DX-316, spec §7.4)', () => {
    render(<BusinessHoursPage />);
    expect(screen.getByRole('region', { name: 'Horario de la sede' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Los días y tramos en que atiende la sede. Las citas fuera de ese horario se rechazan; los plazos en días hábiles están en Calendario de la sede.',
      ),
    ).toBeInTheDocument();
  });
});
