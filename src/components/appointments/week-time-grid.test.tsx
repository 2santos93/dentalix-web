import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekTimeGrid } from './week-time-grid';
import type { Appointment } from '@/lib/appointments/appointments-api';

const WEEK_START = '2026-03-09'; // lunes

function appointment(o: Partial<Appointment> & { id: string }): Appointment {
  return {
    tenantId: 't1', patientId: 'pat-1', providerId: 'prov-1',
    patientFirstName: null, patientLastName: null,
    start: '2026-03-09T09:00:00.000Z', end: '2026-03-09T09:30:00.000Z',
    status: 'SCHEDULED', reason: null, notes: null, createdById: 'u1',
    locationId: 'loc-1',
    appointmentTypeId: null,
    appointmentType: null,
    confirmationSentAt: null, callbackRequestedAt: null,
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

it('renders an appointment block and calls onSelectAppointment on click', async () => {
  const onSelectAppointment = jest.fn();
  const apt = appointment({ id: 'apt-1', start: '2026-03-09T09:00:00.000Z', end: '2026-03-09T10:00:00.000Z' });
  render(
    <WeekTimeGrid
      appointments={[apt]} weekStart={WEEK_START} patientNames={{ 'pat-1': 'Ana García' }}
      onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={onSelectAppointment}
    />,
  );
  const block = screen.getByTestId('week-grid-appointment');
  expect(block).toHaveAttribute('data-id', 'apt-1');
  expect(block).toHaveTextContent('Ana García');
  await userEvent.click(block);
  expect(onSelectAppointment).toHaveBeenCalledWith(expect.objectContaining({ id: 'apt-1' }));
});

it('places two overlapping same-day appointments in two lanes', () => {
  const a = appointment({ id: 'a', start: '2026-03-09T09:00:00.000Z', end: '2026-03-09T10:00:00.000Z' });
  const b = appointment({ id: 'b', start: '2026-03-09T09:30:00.000Z', end: '2026-03-09T10:30:00.000Z' });
  render(
    <WeekTimeGrid
      appointments={[a, b]} weekStart={WEEK_START}
      onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={noop}
    />,
  );
  const blocks = screen.getAllByTestId('week-grid-appointment');
  expect(blocks).toHaveLength(2);
  // Anchos ~50% (2 carriles) — se comprueba que declaran width con "50"
  expect(blocks[0].style.width).toContain('50');
});

it('marca en el bloque de la cita "pide llamada" (DX-005), con texto para lectores de pantalla', () => {
  render(
    <WeekTimeGrid
      appointments={[
        appointment({ id: 'a1', callbackRequestedAt: '2026-03-01T00:00:00.000Z' }),
      ]}
      weekStart={WEEK_START}
      onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={noop}
    />,
  );
  const indicator = screen.getByTestId('appointment-confirmation-indicator');
  expect(indicator).toHaveAttribute('data-indicator', 'callback');
  expect(indicator).toHaveTextContent('Pide llamada');
});

const VACATION_BLOCK = {
  id: 'b-1',
  providerId: 'prov-1',
  locationId: null,
  start: new Date('2026-03-10T00:00:00').toISOString(),
  end: new Date('2026-03-12T00:00:00').toISOString(),
  kind: 'VACATION' as const,
  allowsBooking: false,
  note: null,
};

it('DX-122: pinta los bloqueos del profesional elegido con su etiqueta, sin tapar los huecos', async () => {
  const onSelectSlot = jest.fn();
  render(
    <WeekTimeGrid
      appointments={[]}
      weekStart={WEEK_START}
      onSelectDay={noop}
      onSelectSlot={onSelectSlot}
      onSelectAppointment={noop}
      providerName={(id) => (id === 'prov-1' ? 'Dra. Ana Ríos' : undefined)}
      selectedProviderId="prov-1"
      blocks={[VACATION_BLOCK]}
    />,
  );
  // Martes y miércoles.
  expect(screen.getAllByTestId('week-schedule-block')).toHaveLength(2);
  expect(screen.getAllByRole('note', { name: 'Bloqueo: Vacaciones · Dra. Ana Ríos' })).toHaveLength(2);
  await userEvent.click(screen.getByTestId('week-grid-slot-2026-03-10-10:00'));
  expect(onSelectSlot).toHaveBeenCalledWith('2026-03-10', '10:00');
});

it('DX-122: con «Todos» el bloqueo de un profesional no tapa el día, pero se anuncia en la cabecera', () => {
  render(
    <WeekTimeGrid
      appointments={[]}
      weekStart={WEEK_START}
      onSelectDay={noop}
      onSelectSlot={noop}
      onSelectAppointment={noop}
      providerName={(id) => (id === 'prov-1' ? 'Dra. Ana Ríos' : undefined)}
      blocks={[VACATION_BLOCK]}
    />,
  );
  expect(screen.queryAllByTestId('week-schedule-block')).toHaveLength(0);
  const chips = screen.getAllByTestId('week-block-chip');
  expect(chips).toHaveLength(2);
  for (const chip of chips) expect(chip).toHaveTextContent('Vacaciones · Dra. Ana Ríos');
});

it('DX-150: la tarjeta lleva el chip «Saldo vencido» (también en su nombre accesible); sin saldo vencido, nada', () => {
  render(
    <WeekTimeGrid
      appointments={[
        appointment({ id: 'a1', balance: { hasOverdue: true, overdueDays: 40 } }),
        appointment({
          id: 'a2',
          start: '2026-03-10T09:00:00.000Z',
          end: '2026-03-10T09:30:00.000Z',
          balance: { hasOverdue: false, overdueDays: null },
        }),
      ]}
      weekStart={WEEK_START}
      onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={noop}
    />,
  );
  const chips = screen.getAllByTestId('overdue-chip');
  expect(chips).toHaveLength(1);
  expect(chips[0]).toHaveTextContent('Saldo vencido · 40 días');
  const cards = screen.getAllByTestId('week-grid-appointment');
  expect(cards[0]).toHaveAccessibleName(/Saldo vencido · 40 días/);
});
