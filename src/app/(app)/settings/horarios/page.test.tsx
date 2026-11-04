import { render, screen } from '@testing-library/react';
import BusinessHoursPage from './page';
import { useAuthStore } from '@/lib/auth/auth-store';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';

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
  ScheduleRoster: ({ today }: { today: string }) => <p data-testid="roster-today">{today}</p>,
}));
jest.mock('../../../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

describe('Ajustes → Horarios', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'tok', _hasHydrated: true });
    search = new URLSearchParams();
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([clinicLocation()]);
  });

  describe('Cuadrante: el «hoy» es el de la sede (DX-354b, E9)', () => {
    afterEach(() => jest.useRealTimers());

    it('con el navegador ya en el día 5, la sede de Caracas (22:30 del 4) abre en el día 4', async () => {
      jest.useFakeTimers({
        now: new Date('2026-11-05T02:30:00Z'),
        doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
      });
      search = new URLSearchParams('tab=cuadrante');
      render(<BusinessHoursPage />);
      expect(await screen.findByTestId('roster-today')).toHaveTextContent('2026-11-04');
    });

    it('sin la zona de la sede muestra el error con Reintentar, no un cuadrante con el día del navegador', async () => {
      (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([clinicLocation({ timeZone: null })]);
      search = new URLSearchParams('tab=cuadrante');
      render(<BusinessHoursPage />);
      expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
      expect(screen.queryByTestId('roster-today')).not.toBeInTheDocument();
    });
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
