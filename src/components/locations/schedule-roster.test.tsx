import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleRoster } from './schedule-roster';
import { getRoster, type Roster } from '@/lib/locations/provider-schedule-api';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/locations/provider-schedule-api', () => {
  const actual = jest.requireActual('../../lib/locations/provider-schedule-api');
  return { ...actual, getRoster: jest.fn() };
});

const mockedRoster = getRoster as jest.MockedFunction<typeof getRoster>;

const A = 'loc-a';
const B = 'loc-b';
const dates = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];

function days(byDate: Record<string, Roster['providers'][number]['days'][number]['assignments']>, unrestricted = false) {
  return dates.map((date, i) => ({
    date,
    weekday: (i + 1) % 7,
    unrestricted,
    assignments: byDate[date] ?? [],
    worksAtLocation: null,
    locationRanges: null,
  }));
}

const roster: Roster = {
  from: '2026-10-19',
  to: '2026-10-25',
  locationId: null,
  locations: [
    { id: A, name: 'Sede A', timeZone: 'America/Bogota' },
    { id: B, name: 'Sede B', timeZone: 'America/Bogota' },
  ],
  providers: [
    {
      providerId: 'dra-x',
      fullName: 'Dra. Ximena',
      role: 'DENTIST',
      configured: true,
      days: days({
        '2026-10-19': [{ locationId: A, source: 'WEEKLY', overrideId: null, ranges: [{ startMinute: 480, endMinute: 780 }] }],
        '2026-10-21': [{ locationId: A, source: 'WEEKLY', overrideId: null, ranges: [{ startMinute: 480, endMinute: 780 }] }],
        '2026-10-22': [{ locationId: B, source: 'OVERRIDE', overrideId: 'o1', ranges: [] }],
      }),
    },
    { providerId: 'dr-y', fullName: 'Dr. Yepes', role: 'ADMIN', configured: false, days: days({}, true) },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedRoster.mockResolvedValue(roster);
});

describe('ScheduleRoster', () => {
  it('pinta profesional × día con la sede y los tramos; marca excepciones y «Sin horario»', async () => {
    render(<ScheduleRoster token="tok" today="2026-10-22" />);
    const ximena = await screen.findByRole('region', { name: 'Dra. Ximena' });
    expect(mockedRoster).toHaveBeenCalledWith('tok', { weekStart: '2026-10-19' });
    const lunes = within(ximena).getByRole('group', { name: /lunes/i });
    expect(lunes).toHaveTextContent('Sede A');
    expect(lunes).toHaveTextContent('08:00–13:00');
    const jueves = within(ximena).getByRole('group', { name: /jueves/i });
    expect(jueves).toHaveTextContent('Sede B');
    expect(jueves).toHaveTextContent('No trabaja');
    expect(jueves).toHaveTextContent('Excepción');
    expect(within(ximena).getByRole('group', { name: /martes/i })).toHaveTextContent('Libre');
    const yepes = screen.getByRole('region', { name: 'Dr. Yepes' });
    expect(within(yepes).getAllByText('Sin horario').length).toBe(7);
  });

  it('cambia de semana', async () => {
    const user = userEvent.setup();
    render(<ScheduleRoster token="tok" today="2026-10-22" />);
    await screen.findByRole('region', { name: 'Dra. Ximena' });
    await user.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    await waitFor(() => expect(mockedRoster).toHaveBeenLastCalledWith('tok', { weekStart: '2026-10-26' }));
  });

  it('error con reintento', async () => {
    mockedRoster.mockRejectedValueOnce(new ApiError(500, 'x'));
    const user = userEvent.setup();
    render(<ScheduleRoster token="tok" today="2026-10-22" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el cuadrante.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Dra. Ximena' })).toBeInTheDocument();
  });
});
