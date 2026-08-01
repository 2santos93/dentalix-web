import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekAgenda } from './week-agenda';
import type { Appointment } from '@/lib/appointments/appointments-api';

// Week of Monday 2026-03-09 .. Sunday 2026-03-15 (matches day-range.test.ts's
// localWeekRange fixture, so the two stay consistent with each other).
const WEEK_START = '2026-03-09';

function appointment(overrides: Partial<Appointment> & { id: string }): Appointment {
  return {
    tenantId: 't1',
    patientId: 'pat-1',
    patientFirstName: null,
    patientLastName: null,
    providerId: 'prov-1',
    start: '2026-03-09T14:00:00.000Z',
    end: '2026-03-09T14:30:00.000Z',
    status: 'SCHEDULED',
    reason: null,
    notes: null,
    createdById: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Monday 2026-03-09, 09:00 local.
const mondayApt = appointment({ id: 'apt-mon', patientId: 'pat-1', start: '2026-03-09T09:00:00.000Z', end: '2026-03-09T09:30:00.000Z' });
// Wednesday 2026-03-11, 14:00 local.
const wedApt = appointment({ id: 'apt-wed', patientId: 'pat-2', start: '2026-03-11T14:00:00.000Z', end: '2026-03-11T14:30:00.000Z', status: 'CONFIRMED' });

const patientNames = { 'pat-1': 'Ana García', 'pat-2': 'Luis Pérez' };

describe('WeekAgenda', () => {
  it('shows a loading state', () => {
    render(
      <WeekAgenda
        appointments={[]}
        weekStart={WEEK_START}
        loading={true}
        onSelectDay={jest.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
  });

  it('shows an alert with the error message when loading failed', () => {
    render(
      <WeekAgenda
        appointments={[]}
        weekStart={WEEK_START}
        loading={false}
        error="Error del servidor"
        onSelectDay={jest.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Error del servidor');
  });

  it('renders all 7 day columns with an empty placeholder when there are no appointments', () => {
    render(
      <WeekAgenda
        appointments={[]}
        weekStart={WEEK_START}
        loading={false}
        onSelectDay={jest.fn()}
      />,
    );

    const headers = screen.getAllByTestId('week-day-header');
    expect(headers).toHaveLength(7);
    expect(headers.map((h) => h.getAttribute('data-date'))).toEqual([
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
      '2026-03-14',
      '2026-03-15',
    ]);
    expect(screen.getAllByText(/sin citas/i)).toHaveLength(7);
  });

  it('groups appointments into the column matching their local day', () => {
    render(
      <WeekAgenda
        appointments={[wedApt, mondayApt]}
        weekStart={WEEK_START}
        patientNames={patientNames}
        loading={false}
        onSelectDay={jest.fn()}
      />,
    );

    const mondayHeader = screen
      .getAllByTestId('week-day-header')
      .find((h) => h.getAttribute('data-date') === '2026-03-09') as HTMLElement;
    const mondayColumn = mondayHeader.closest('[data-testid="week-day-column"]') as HTMLElement;
    expect(within(mondayColumn).getByText('Ana García')).toBeInTheDocument();
    expect(within(mondayColumn).getByText(/agendada/i)).toBeInTheDocument();
    expect(within(mondayColumn).queryByText('Luis Pérez')).not.toBeInTheDocument();

    const wedHeader = screen
      .getAllByTestId('week-day-header')
      .find((h) => h.getAttribute('data-date') === '2026-03-11') as HTMLElement;
    const wedColumn = wedHeader.closest('[data-testid="week-day-column"]') as HTMLElement;
    expect(within(wedColumn).getByText('Luis Pérez')).toBeInTheDocument();
    expect(within(wedColumn).getByText(/confirmada/i)).toBeInTheDocument();
    expect(within(wedColumn).queryByText('Ana García')).not.toBeInTheDocument();
  });

  it('falls back to the raw patientId when patientNames does not have an entry', () => {
    render(
      <WeekAgenda
        appointments={[mondayApt]}
        weekStart={WEEK_START}
        loading={false}
        onSelectDay={jest.fn()}
      />,
    );
    expect(screen.getByText('pat-1')).toBeInTheDocument();
  });

  it('calls onSelectDay with that column\'s date when a day header is clicked', async () => {
    const onSelectDay = jest.fn();
    const user = userEvent.setup();
    render(
      <WeekAgenda
        appointments={[]}
        weekStart={WEEK_START}
        loading={false}
        onSelectDay={onSelectDay}
      />,
    );

    const wedHeader = screen
      .getAllByTestId('week-day-header')
      .find((h) => h.getAttribute('data-date') === '2026-03-11') as HTMLElement;
    await user.click(wedHeader);

    expect(onSelectDay).toHaveBeenCalledWith('2026-03-11');
  });

  it('does NOT render a status <select> (no status-change control in week view)', () => {
    const { container } = render(
      <WeekAgenda
        appointments={[mondayApt]}
        weekStart={WEEK_START}
        loading={false}
        onSelectDay={jest.fn()}
      />,
    );
    expect(container.querySelectorAll('select')).toHaveLength(0);
  });
});
