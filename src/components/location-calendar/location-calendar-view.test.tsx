import { useSyncExternalStore } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { LocationCalendarView } from './location-calendar-view';
import { listLocations } from '@/lib/locations/locations-api';
import { getLocationCalendar } from '@/lib/locations/location-calendar-api';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { ApiError } from '@/lib/api/api-error';
import { clinicLocation } from '@/lib/test/locations';
import { setupUser } from '@/lib/test/user';

// La URL de prueba: `router.replace` la cambia y la vista vuelve a leerla.
let search = new URLSearchParams();
const listeners = new Set<() => void>();
const replace = jest.fn((href: string) => {
  search = new URLSearchParams(href.split('?')[1] ?? '');
  listeners.forEach((l) => l());
});
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/settings/calendario',
  useSearchParams: () =>
    useSyncExternalStore(
      (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      () => search,
    ),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
}));
jest.mock('../../lib/locations/location-calendar-api', () => ({
  ...jest.requireActual('../../lib/locations/location-calendar-api'),
  getLocationCalendar: jest.fn(),
}));
const mockedList = jest.mocked(listLocations);
const mockedGet = jest.mocked(getLocationCalendar);

const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', locale: 'de-DE', hourCycle: 'h23' });
const sur = clinicLocation({ id: 'sur', name: 'Sede Sur', locale: 'en-US', hourCycle: 'h12' });
const vieja = clinicLocation({ id: 'vieja', name: 'Sede Vieja', isActive: false });

function calendar(locationId: string, workingWeekdays = [1, 2, 3, 4, 5]) {
  return { locationId, workingWeekdays, holidays: [] };
}

const sedeSelect = () => screen.getByRole('combobox', { name: 'Sede' }) as HTMLSelectElement;

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  search = new URLSearchParams();
  mockedList.mockResolvedValue([norte, sur, vieja]);
  mockedGet.mockImplementation(async (_token, id) =>
    calendar(id, id === 'sur' ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5]),
  );
});

describe('LocationCalendarView (DX-316, spec §7.1–§7.2)', () => {
  it('defaults to the active location and switches with the Sede select, updating ?sede=', async () => {
    setActiveLocationId('sur');
    const user = setupUser();
    render(<LocationCalendarView token="tok" />);
    expect(await screen.findByTestId('working-weekdays-summary')).toHaveTextContent('Domingo a jueves');
    expect(sedeSelect().value).toBe('sur');
    expect(mockedGet).toHaveBeenCalledWith('tok', 'sur');

    await user.selectOptions(sedeSelect(), 'Sede Norte');
    expect(replace).toHaveBeenCalledWith('/settings/calendario?sede=norte', { scroll: false });
    await waitFor(() => expect(screen.getByTestId('working-weekdays-summary')).toHaveTextContent('Lunes a viernes'));
    expect(sedeSelect().value).toBe('norte');
    expect(mockedGet).toHaveBeenLastCalledWith('tok', 'norte');
  });

  it('without an active location («Todas las sedes») picks the first active one', async () => {
    mockedList.mockResolvedValue([vieja, norte, sur]);
    render(<LocationCalendarView token="tok" />);
    await screen.findByTestId('working-weekdays-summary');
    expect(sedeSelect().value).toBe('norte');
  });

  it('?sede=<id> preselects that location', async () => {
    setActiveLocationId('norte');
    search = new URLSearchParams('sede=sur');
    render(<LocationCalendarView token="tok" />);
    expect(await screen.findByTestId('working-weekdays-summary')).toHaveTextContent('Domingo a jueves');
    expect(sedeSelect().value).toBe('sur');
    expect(mockedGet).toHaveBeenCalledWith('tok', 'sur');
    expect(mockedGet).not.toHaveBeenCalledWith('tok', 'norte');
  });

  it('an inactive location reads «(inactiva)» in the Sede select', async () => {
    render(<LocationCalendarView token="tok" />);
    await screen.findByTestId('working-weekdays-summary');
    const options = within(sedeSelect()).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Sede Norte', 'Sede Sur', 'Sede Vieja (inactiva)']);
  });

  it('load failure shows SectionError with retry', async () => {
    const user = setupUser();
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    render(<LocationCalendarView token="tok" />);
    expect(await screen.findByText('No pudimos cargar el calendario de la sede.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('working-weekdays-summary')).toHaveTextContent('Lunes a viernes');
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('a failed list of locations shows SectionError with retry', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    render(<LocationCalendarView token="tok" />);
    expect(await screen.findByText('No pudimos cargar las sedes.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('working-weekdays-summary')).toBeInTheDocument();
  });

  it('a non-ADMIN token shows the 403 message', async () => {
    const message = 'Solo un administrador de la clínica puede ver o cambiar el calendario de la sede.';
    mockedGet.mockRejectedValue(new ApiError(403, message));
    render(<LocationCalendarView token="tok" />);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Días hábiles' })).not.toBeInTheDocument();
  });

  it('a location without a usable format shows «—» and SedeConfigError instead of the weekdays form', async () => {
    mockedList.mockResolvedValue([clinicLocation({ id: 'sin', name: 'Sede Sin Formato', locale: null })]);
    render(<LocationCalendarView token="tok" />);
    expect(await screen.findByText(/No se pudo saber el formato regional o el reloj de la sede/)).toBeInTheDocument();
    expect(screen.getByTestId('working-weekdays-summary')).toHaveTextContent('—');
    expect(screen.queryByRole('group', { name: 'Días hábiles' })).not.toBeInTheDocument();
  });
});
