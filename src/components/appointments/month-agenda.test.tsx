import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgendaStatusLegend, MonthAgenda } from './month-agenda';
import type { Appointment } from '@/lib/appointments/appointments-api';
import type { MedicalAlertFlags } from '@/lib/clinical/medical-alerts';
import { caracasSede, testAgendaClock } from '@/lib/test/sede-clock';

/** Reloj de la sede de pruebas (UTC, 24 h): estas pruebas no tratan del reloj. */
const CLOCK = testAgendaClock();

const flags = (anamnesisStatus: MedicalAlertFlags['anamnesisStatus'], premed = false): MedicalAlertFlags => ({
  anamnesisStatus, hasCriticalAlert: premed, requiresPremedication: premed,
  alerts: premed ? ['profilaxisAntibiotica'] : [], anamnesisReviewedAt: null,
});
const appointments = [
  ['Jorge Eduardo', 'Ramírez', flags('CURRENT', true)],
  ['Ana María', 'Zapata', flags('EXPIRED')],
  ['Daniela', 'Montoya', flags('MISSING')],
  ['Clara', 'Al Día', flags('CURRENT')],
].map(([first, last, medicalAlerts], i) => ({
  id: `a${i}`, patientId: `p${i}`, patientFirstName: first, patientLastName: last,
  start: `2026-10-22T${String(9 + i).padStart(2, '0')}:00:00`, status: 'SCHEDULED', medicalAlerts,
}) as Appointment);

it('chips de una línea con nombre corto; solo la alerta crítica deja marca; +1 más, sin botones anidados', async () => {
  const select = jest.fn();
  const { container } = render(<MonthAgenda clock={CLOCK} appointments={appointments} monthDate="2026-10-22" selectedDate="2026-10-21" today="2026-10-21" onSelectDay={select} loading={false} />);
  const day = container.querySelector('[data-date="2026-10-22"]') as HTMLElement;
  const chips = within(day).getAllByTestId('month-appointment');
  expect(chips).toHaveLength(3);
  // «Jorge R.»: primer nombre + inicial (el nombre completo, en el título y la lista del día).
  expect(chips[0]).toHaveTextContent('Jorge R.');
  expect(chips[0]).not.toHaveTextContent('Eduardo');
  expect(chips[1]).toHaveTextContent('Ana Z.');
  // Solo la alerta crítica deja marca (y no es un botón: la celda es el objetivo);
  // la anamnesis caducada o ausente vive en el Día, la Semana y el detalle.
  expect(within(day).queryAllByTestId('medical-alert-indicator')).toHaveLength(0);
  const markers = within(day).getAllByTestId('month-alert-marker');
  expect(markers).toHaveLength(1);
  expect(chips[0]).toContainElement(markers[0]);
  expect(markers[0]).toHaveTextContent(/Requiere premedicación/);
  expect(within(day).getByText('+1 más')).toBeInTheDocument();
  expect(container.querySelector('button button')).toBeNull();
  const user = userEvent.setup();
  await user.click(within(day).getByRole('button', { name: /22 de octubre · 4 citas/ }));
  expect(select).toHaveBeenCalledWith('2026-10-22');
});

it('el punto de estado sale del tono del mapa (nunca el acento) y las anuladas van tachadas', () => {
  const list = [
    { ...appointments[3], id: 'c', status: 'CONFIRMED' },
    { ...appointments[3], id: 'x', status: 'CANCELLED', start: '2026-10-22T15:00:00' },
  ] as Appointment[];
  const { container } = render(<MonthAgenda clock={CLOCK} appointments={list} monthDate="2026-10-22" selectedDate="2026-10-21" today="2026-10-21" onSelectDay={jest.fn()} loading={false} />);
  const [confirmed, cancelled] = container.querySelectorAll('[data-testid="month-appointment"]');
  expect(confirmed.querySelector('.bg-info')).not.toBeNull();
  expect(container.querySelector('[data-testid="month-appointment"] .bg-primary')).toBeNull();
  expect(cancelled.querySelector('.line-through')).not.toBeNull();
  expect(cancelled).toHaveTextContent('Cancelada');
});

it('en el teléfono (compact) cada cita es un punto: sin texto ni iconos en la celda', () => {
  const { container } = render(<MonthAgenda compact clock={CLOCK} appointments={appointments} monthDate="2026-10-22" selectedDate="2026-10-21" today="2026-10-21" onSelectDay={jest.fn()} loading={false} />);
  const day = container.querySelector('[data-date="2026-10-22"]') as HTMLElement;
  expect(within(day).getAllByTestId('month-appointment')).toHaveLength(3);
  expect(within(day).queryAllByTestId('month-alert-marker')).toHaveLength(0);
  expect(day).not.toHaveTextContent('Jorge');
  expect(within(day).getByRole('button', { name: /22 de octubre · 4 citas/ })).toBeInTheDocument();
});

it('la leyenda nombra cada tono con las etiquetas del mapa único', () => {
  render(<AgendaStatusLegend showAlert />);
  const legend = screen.getByRole('list', { name: 'Leyenda de estados' });
  expect(legend).toHaveTextContent('Agendada · Cancelada');
  expect(legend).toHaveTextContent('Confirmada · En sillón');
  expect(legend).toHaveTextContent('No asistió');
  expect(legend).toHaveTextContent('Alertas médicas');
});

it('no inventa alertas para citas al día o sin banderas', () => {
  const { container } = render(<MonthAgenda clock={CLOCK} appointments={[appointments[3], { ...appointments[0], medicalAlerts: undefined }]} monthDate="2026-10-22" selectedDate="2026-10-22" today="2026-10-21" onSelectDay={jest.fn()} loading={false} />);
  expect(container.querySelectorAll('[data-testid="month-alert-marker"]')).toHaveLength(0);
});

it('DX-378: agrupa por el día de la sede y pinta la hora con su reloj (12 h)', () => {
  // 02:00 UTC del 23 son las 10:00 p. m. del 22 en Caracas; el navegador (UTC) diría el 23.
  const late = { ...appointments[3], id: 'late', start: '2026-10-23T02:00:00.000Z', locationId: 'loc-1' } as Appointment;
  const { container } = render(
    <MonthAgenda
      clock={testAgendaClock([caracasSede()])}
      appointments={[late]}
      monthDate="2026-10-22"
      selectedDate="2026-10-22"
      today="2026-10-22"
      onSelectDay={jest.fn()}
      loading={false}
    />,
  );
  const day22 = container.querySelector('[data-date="2026-10-22"]') as HTMLElement;
  const day23 = container.querySelector('[data-date="2026-10-23"]') as HTMLElement;
  expect(within(day22).getByText('10:00 p. m.')).toBeInTheDocument();
  expect(within(day23).queryAllByTestId('month-appointment')).toHaveLength(0);
});
