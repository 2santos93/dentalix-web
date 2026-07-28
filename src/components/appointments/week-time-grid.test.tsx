import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekTimeGrid } from './week-time-grid';
import type { Appointment } from '@/lib/appointments/appointments-api';

const WEEK_START = '2026-03-09'; // lunes

function appointment(o: Partial<Appointment> & { id: string }): Appointment {
  return {
    tenantId: 't1', patientId: 'pat-1', providerId: 'prov-1',
    start: '2026-03-09T09:00:00.000Z', end: '2026-03-09T09:30:00.000Z',
    status: 'SCHEDULED', reason: null, notes: null, createdById: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...o,
  };
}

function noop() {}

it('renders 7 day headers Mon..Sun', () => {
  render(
    <WeekTimeGrid
      appointments={[]} weekStart={WEEK_START}
      onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={noop}
    />,
  );
  // Reusa el mismo testid que WeekAgenda ('week-day-header') para que los
  // tests de agenda-view que ya lo usan sigan pasando tras el swap (Task 5).
  const headers = screen.getAllByTestId('week-day-header');
  expect(headers).toHaveLength(7);
  expect(headers[0]).toHaveAttribute('data-date', '2026-03-09');
  expect(headers[6]).toHaveAttribute('data-date', '2026-03-15');
});

it('clicking a day header calls onSelectDay with its date', async () => {
  const onSelectDay = jest.fn();
  render(
    <WeekTimeGrid
      appointments={[]} weekStart={WEEK_START}
      onSelectDay={onSelectDay} onSelectSlot={noop} onSelectAppointment={noop}
    />,
  );
  await userEvent.click(screen.getAllByTestId('week-day-header')[2]);
  expect(onSelectDay).toHaveBeenCalledWith('2026-03-11');
});

it('clicking an empty slot calls onSelectSlot with that day and time', async () => {
  const onSelectSlot = jest.fn();
  render(
    <WeekTimeGrid
      appointments={[]} weekStart={WEEK_START}
      onSelectDay={noop} onSelectSlot={onSelectSlot} onSelectAppointment={noop}
    />,
  );
  // Slots are testid="week-grid-slot" with data-date + data-time.
  const slot = screen.getByTestId('week-grid-slot-2026-03-09-09:00');
  await userEvent.click(slot);
  expect(onSelectSlot).toHaveBeenCalledWith('2026-03-09', '09:00');
});
