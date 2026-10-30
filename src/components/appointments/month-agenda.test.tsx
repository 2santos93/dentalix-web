import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthAgenda } from './month-agenda';
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

it('muestra las tres alertas con su texto accesible y +1 más, sin botones anidados', async () => {
  const select = jest.fn();
  const { container } = render(<MonthAgenda clock={CLOCK} appointments={appointments} monthDate="2026-10-22" selectedDate="2026-10-21" today="2026-10-21" onSelectDay={select} loading={false} />);
  const day = container.querySelector('[data-date="2026-10-22"]') as HTMLElement;
  const icons = within(day).getAllByTestId('medical-alert-indicator');
  expect(icons).toHaveLength(3);
  expect(icons[0]).toHaveAccessibleName('Alertas médicas de Jorge Eduardo Ramírez');
  expect(icons[0]).toHaveAccessibleDescription(/Requiere premedicación/);
  expect(icons[1]).toHaveAccessibleDescription(/Anamnesis caducada/);
  expect(icons[2]).toHaveAccessibleDescription(/Sin anamnesis/);
  expect(within(day).getByText('+1 más')).toBeInTheDocument();
  expect(container.querySelector('button button')).toBeNull();
  const user = userEvent.setup();
  await user.click(icons[0]);
  expect(screen.getByTestId('medical-alert-popover')).toHaveTextContent('Requiere premedicación');
  expect(select).not.toHaveBeenCalled();
  await user.keyboard('{Escape}');
  await user.click(within(day).getByRole('button', { name: /22 de octubre · 4 citas/ }));
  expect(select).toHaveBeenCalledWith('2026-10-22');
});

it('no inventa alertas para citas al día o sin banderas', () => {
  const { container } = render(<MonthAgenda clock={CLOCK} appointments={[appointments[3], { ...appointments[0], medicalAlerts: undefined }]} monthDate="2026-10-22" selectedDate="2026-10-22" today="2026-10-21" onSelectDay={jest.fn()} loading={false} />);
  expect(container.querySelectorAll('[data-testid="medical-alert-indicator"]')).toHaveLength(0);
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
