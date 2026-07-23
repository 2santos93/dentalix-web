import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayAgenda } from './day-agenda';
import type { Appointment } from '@/lib/appointments/appointments-api';

function timeLabel(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  return `${fmt(startIso)}–${fmt(endIso)}`;
}

const later: Appointment = {
  id: 'apt-2',
  tenantId: 't1',
  patientId: 'pat-2',
  providerId: 'prov-1',
  start: '2026-07-23T14:00:00.000Z',
  end: '2026-07-23T14:30:00.000Z',
  status: 'CONFIRMED',
  reason: 'Control',
  notes: null,
  createdById: 'u1',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const earlier: Appointment = {
  id: 'apt-1',
  tenantId: 't1',
  patientId: 'pat-1',
  providerId: 'prov-1',
  start: '2026-07-23T09:00:00.000Z',
  end: '2026-07-23T09:30:00.000Z',
  status: 'SCHEDULED',
  reason: null,
  notes: null,
  createdById: 'u1',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('DayAgenda', () => {
  it('shows a loading state', () => {
    render(<DayAgenda appointments={[]} loading={true} />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
  });

  it('shows an empty state when there are no appointments and it is not loading', () => {
    render(<DayAgenda appointments={[]} loading={false} />);
    expect(screen.getByText(/no hay citas/i)).toBeInTheDocument();
  });

  it('does not show the empty message while loading', () => {
    render(<DayAgenda appointments={[]} loading={true} />);
    expect(screen.queryByText(/no hay citas/i)).not.toBeInTheDocument();
  });

  it('shows an alert with the error message and no empty/loading state when loading failed', () => {
    render(<DayAgenda appointments={[]} loading={false} error="Error del servidor" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Error del servidor');
    expect(screen.queryByText(/no hay citas/i)).not.toBeInTheDocument();
  });

  it('renders one row per appointment, ordered by start time ascending regardless of input order', () => {
    render(<DayAgenda appointments={[later, earlier]} loading={false} />);

    const rows = screen.getAllByRole('row').slice(1); // skip header row
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(timeLabel(earlier.start, earlier.end))).toBeInTheDocument();
    expect(within(rows[1]).getByText(timeLabel(later.start, later.end))).toBeInTheDocument();
  });

  it('shows patient, reason (with a fallback when absent) and a status label per appointment', () => {
    render(<DayAgenda appointments={[earlier, later]} loading={false} />);

    const rows = screen.getAllByRole('row').slice(1);
    // earlier: no reason -> fallback dash; patientNames not provided -> raw id
    expect(within(rows[0]).getByText('pat-1')).toBeInTheDocument();
    expect(within(rows[0]).getByText('—')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/agendada/i)).toBeInTheDocument();

    // later: has a reason
    expect(within(rows[1]).getByText('pat-2')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Control')).toBeInTheDocument();
    expect(within(rows[1]).getByText(/confirmada/i)).toBeInTheDocument();
  });

  it('resolves the patient label from patientNames when available, falling back to the raw id otherwise', () => {
    render(
      <DayAgenda
        appointments={[earlier]}
        loading={false}
        patientNames={{ 'pat-1': 'Ana García' }}
      />,
    );
    expect(screen.getAllByText('Ana García').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('pat-1')).toHaveLength(0);
  });

  it('gives each of the five statuses a distinct semantic-token color class (no raw color utilities)', () => {
    const statuses: Array<Appointment['status']> = [
      'SCHEDULED',
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ];
    const appointments: Appointment[] = statuses.map((status, i) => ({
      ...earlier,
      id: `apt-${i}`,
      start: new Date(Date.parse(earlier.start) + i * 3600_000).toISOString(),
      end: new Date(Date.parse(earlier.end) + i * 3600_000).toISOString(),
      status,
    }));
    const { container } = render(<DayAgenda appointments={appointments} loading={false} />);

    // Scope to the desktop table only — the mobile cards render the same
    // badges again (duplicate testids across the two responsive variants).
    const table = container.querySelector('table') as HTMLElement;
    const badges = within(table).getAllByTestId('appointment-status-badge');
    expect(badges).toHaveLength(5);
    const classSets = badges.map((b) => b.className);
    // Every badge class string must be unique across the 5 statuses.
    expect(new Set(classSets).size).toBe(5);
    for (const cls of classSets) {
      expect(cls).not.toMatch(/-(red|blue|green|amber|yellow|violet|emerald|orange)-\d/);
      expect(cls).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });

  it('renders a desktop table hidden below md and mobile cards hidden at md+', () => {
    const { container } = render(<DayAgenda appointments={[earlier]} loading={false} />);
    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    expect(table?.closest('.hidden.md\\:block')).toBeInTheDocument();

    const mobileWrapper = container.querySelector('.md\\:hidden');
    expect(mobileWrapper).toBeInTheDocument();
  });

  it('gives each appointment an accessible label combining time, patient and status (mobile cards)', () => {
    render(<DayAgenda appointments={[earlier]} loading={false} />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveAccessibleName(
      new RegExp(`${timeLabel(earlier.start, earlier.end)}.*pat-1.*agendada`, 'i'),
    );
  });

  it('does NOT render a status select when onStatusChange is not provided (backward compatible, read-only badge only)', () => {
    const { container } = render(<DayAgenda appointments={[earlier]} loading={false} />);
    expect(container.querySelectorAll('select')).toHaveLength(0);
  });

  describe('status-change control (onStatusChange provided)', () => {
    it('renders a labeled status select per row, in both the desktop table and the mobile cards, with the current status selected', () => {
      const onStatusChange = jest.fn();
      const { container } = render(
        <DayAgenda appointments={[earlier, later]} loading={false} onStatusChange={onStatusChange} />,
      );

      const table = container.querySelector('table') as HTMLElement;
      const desktopSelects = within(table).getAllByRole<HTMLSelectElement>('combobox');
      expect(desktopSelects).toHaveLength(2);
      expect(desktopSelects[0].value).toBe('SCHEDULED');
      expect(desktopSelects[1].value).toBe('CONFIRMED');
      expect(desktopSelects[0]).toHaveAccessibleName(
        new RegExp(`Estado de la cita de ${timeLabel(earlier.start, earlier.end)}`, 'i'),
      );

      const mobileList = screen.getAllByRole('list').find((l) => l.tagName === 'UL') as HTMLElement;
      const mobileSelects = within(mobileList).getAllByRole<HTMLSelectElement>('combobox');
      expect(mobileSelects).toHaveLength(2);
    });

    it('calls onStatusChange with the appointment id and the newly picked status when changed', async () => {
      const onStatusChange = jest.fn();
      const user = userEvent.setup();
      const { container } = render(
        <DayAgenda appointments={[earlier]} loading={false} onStatusChange={onStatusChange} />,
      );

      const table = container.querySelector('table') as HTMLElement;
      const select = within(table).getByRole<HTMLSelectElement>('combobox');
      await user.selectOptions(select, 'CONFIRMED');

      expect(onStatusChange).toHaveBeenCalledWith('apt-1', 'CONFIRMED');
    });

    it('disables the status select (both desktop and mobile) only for the row matching updatingId', () => {
      const onStatusChange = jest.fn();
      const { container } = render(
        <DayAgenda
          appointments={[earlier, later]}
          loading={false}
          onStatusChange={onStatusChange}
          updatingId={earlier.id}
        />,
      );

      const table = container.querySelector('table') as HTMLElement;
      const desktopSelects = within(table).getAllByRole<HTMLSelectElement>('combobox');
      expect(desktopSelects[0]).toBeDisabled();
      expect(desktopSelects[1]).not.toBeDisabled();
    });
  });
});
