import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekTimeGrid } from './week-time-grid';
import type { Appointment } from '@/lib/appointments/appointments-api';
import { caracasSede, testAgendaClock } from '@/lib/test/sede-clock';
import { ROW_HEIGHT_PX, SLOT_MINUTES } from '@/lib/appointments/week-grid-layout';

/** Reloj de la sede de pruebas (UTC, 24 h): estas pruebas no tratan del reloj. */
const CLOCK = testAgendaClock();

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
    confirmationSentAt: null, callbackRequestedAt: null, wantsEarlier: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...o,
  };
}

function noop() {}

it('renders 7 day headers Mon..Sun', () => {
  render(
    <WeekTimeGrid clock={CLOCK}
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
    <WeekTimeGrid clock={CLOCK}
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
    <WeekTimeGrid clock={CLOCK}
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
    <WeekTimeGrid clock={CLOCK}
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
    <WeekTimeGrid clock={CLOCK}
      appointments={[a, b]} weekStart={WEEK_START}
      onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={noop}
    />,
  );
  const blocks = screen.getAllByTestId('week-grid-appointment');
  expect(blocks).toHaveLength(2);
  // Anchos ~50% (2 carriles) — se comprueba que declaran width con "50"
  // El ancho lo lleva el contenedor de la tarjeta (DX-247: el icono de alerta
  // va a su lado, no dentro del botón).
  expect(blocks[0].parentElement?.style.width).toContain('50');
});

it('marca en el bloque de la cita "pide llamada" (DX-005), con texto para lectores de pantalla', () => {
  render(
    <WeekTimeGrid clock={CLOCK}
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
    <WeekTimeGrid clock={CLOCK}
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
    <WeekTimeGrid clock={CLOCK}
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
    <WeekTimeGrid clock={CLOCK}
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

it('DX-153: la tarjeta con cobertura vencida lleva la marca «Cobertura vencida»; vigente, nada', () => {
  render(
    <WeekTimeGrid clock={CLOCK}
      appointments={[
        appointment({
          id: 'a1',
          coverage: { status: 'EXPIRED', payerName: 'Sura EPS', planName: null, validTo: '2026-01-31' },
        }),
        appointment({
          id: 'a2',
          start: '2026-03-10T09:00:00.000Z',
          end: '2026-03-10T09:30:00.000Z',
          coverage: { status: 'ACTIVE', payerName: 'Sura EPS', planName: null, validTo: null },
        }),
      ]}
      weekStart={WEEK_START}
      onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={noop}
    />,
  );
  // Ambas son de 30 min: la marca va en la fila de la hora y el nombre accesible la anuncia.
  expect(screen.getAllByTestId('coverage-marker')).toHaveLength(1);
  expect(screen.getByTestId('coverage-marker')).toHaveAttribute('title', 'Cobertura vencida');
  const cards = screen.getAllByTestId('week-grid-appointment');
  expect(cards[0]).toHaveAccessibleName(/Cobertura vencida/);
  expect(cards[1]).not.toHaveAccessibleName(/Cobertura vencida/);
});

it('DX-247: una cita de 15 min con alerta lleva el icono, fuera del botón de la tarjeta, y abre las alertas con el teclado', async () => {
  const user = userEvent.setup();
  const onSelectAppointment = jest.fn();
  render(
    <WeekTimeGrid clock={CLOCK}
      appointments={[
        appointment({
          id: 'a1',
          start: '2026-03-09T09:00:00.000Z',
          end: '2026-03-09T09:15:00.000Z',
          medicalAlerts: {
            hasCriticalAlert: true,
            requiresPremedication: true,
            anamnesisStatus: 'CURRENT',
            alerts: ['profilaxisAntibiotica'],
            anamnesisReviewedAt: '2026-02-01T00:00:00.000Z',
          },
        }),
        appointment({ id: 'a2', start: '2026-03-10T09:00:00.000Z', end: '2026-03-10T09:30:00.000Z' }),
      ]}
      weekStart={WEEK_START}
      patientNames={{ 'pat-1': 'Ana García' }}
      onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={onSelectAppointment}
    />,
  );
  const indicators = screen.getAllByTestId('medical-alert-indicator');
  expect(indicators).toHaveLength(1);
  const [card] = screen.getAllByTestId('week-grid-appointment');
  expect(card).not.toContainElement(indicators[0]);
  act(() => indicators[0].focus());
  expect(screen.getByTestId('medical-alert-popover')).toHaveTextContent('Requiere profilaxis antibiótica');
  await user.keyboard('{Escape}');
  expect(screen.queryByTestId('medical-alert-popover')).not.toBeInTheDocument();
  expect(onSelectAppointment).not.toHaveBeenCalled();
});


it.each(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'ARRIVED', 'IN_CHAIR', 'READY_FOR_CHECKOUT'] as const)('DX-242: %s tiene estado visible y nombre accesible con tipo', (status) => {
  const labels = { SCHEDULED:'Agendada', CONFIRMED:'Confirmada', COMPLETED:'Completada', CANCELLED:'Cancelada', NO_SHOW:'No asistió', ARRIVED:'En espera', IN_CHAIR:'En sillón', READY_FOR_CHECKOUT:'Listo para cobrar' };
  render(<WeekTimeGrid clock={CLOCK} appointments={[appointment({ id: status, status, appointmentType: { id:'t', name:'Control', color:'#123456', durationMinutes:30 } })]} weekStart={WEEK_START} onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={noop} />);
  const card = screen.getByTestId('week-grid-appointment');
  expect(card).toHaveAccessibleName(expect.stringContaining(labels[status]));
  expect(card).toHaveAccessibleName(expect.stringContaining('Control'));
  expect(card.querySelector('[data-appointment-status]')).not.toBeNull();
});

it('DX-378: el día, la fila y la hora de cada cita salen del reloj de la sede (12 h), no del navegador', () => {
  // 02:30 UTC del martes 10 son las 10:30 p. m. del lunes 9 en Caracas.
  const late = appointment({ id: 'late', start: '2026-03-10T02:30:00.000Z', end: '2026-03-10T03:00:00.000Z' });
  render(
    <WeekTimeGrid
      clock={testAgendaClock([caracasSede()])}
      appointments={[late]} weekStart={WEEK_START}
      onSelectDay={noop} onSelectSlot={noop} onSelectAppointment={noop}
    />,
  );
  const [monday, tuesday] = screen.getAllByTestId('week-grid-day-column');
  const card = screen.getByTestId('week-grid-appointment');
  expect(monday).toContainElement(card);
  expect(tuesday).not.toContainElement(card);
  expect(card.parentElement).toHaveStyle({ top: `${((22 * 60 + 30) / SLOT_MINUTES) * ROW_HEIGHT_PX}px` });
  expect(card).toHaveAccessibleName(/^10:30 p\. m\. – 11:00 p\. m\./);
  expect(screen.getByText('9:00 a. m.')).toBeInTheDocument();
});
