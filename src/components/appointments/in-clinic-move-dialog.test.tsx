import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InClinicMoveDialog } from './in-clinic-move-dialog';
import { getAppointment, updateAppointment, type AppointmentDetail } from '@/lib/appointments/appointments-api';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { listChairs, type Chair } from '@/lib/chairs/chairs-api';
import { getLocationSchedule } from '@/lib/locations/schedule-api';
import { notifyError } from '@/components/errors/notify';
import { testAgendaClock } from '@/lib/test/sede-clock';

jest.mock('../../lib/appointments/appointments-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointments-api'),
  getAppointment: jest.fn(),
  updateAppointment: jest.fn(),
}));
jest.mock('../../lib/appointments/staff-api', () => ({ listStaff: jest.fn() }));
jest.mock('../../lib/chairs/chairs-api', () => ({ listChairs: jest.fn() }));
jest.mock('../../lib/locations/schedule-api', () => ({
  ...jest.requireActual('../../lib/locations/schedule-api'),
  getLocationSchedule: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const appointment = {
  id: 'a1',
  locationId: 'loc-1',
  patientFirstName: 'Ana',
  patientLastName: 'Ríos',
  providerId: 'dent-1',
  chairId: 'c1',
  chair: { id: 'c1', name: 'Sillón 1', active: true },
  start: '2026-11-02T14:00:00.000Z',
  end: '2026-11-02T14:30:00.000Z',
  status: 'ARRIVED',
} as AppointmentDetail;
const staff: StaffMember[] = [
  { userId: 'dent-1', fullName: 'Dra. Lina', role: 'DENTIST', locationIds: null },
  { userId: 'rec-1', fullName: 'Recepción', role: 'RECEPTION', locationIds: null },
];
const chairs = [
  { id: 'c1', name: 'Sillón 1', active: true, locationId: 'loc-1' },
  { id: 'c2', name: 'Sillón 2', active: true, locationId: 'loc-1' },
] as Chair[];

function renderDialog() {
  const onClose = jest.fn();
  const onMoved = jest.fn();
  render(
    <InClinicMoveDialog
      token="T"
      appointmentId="a1"
      locationId="loc-1"
      clock={testAgendaClock()}
      onClose={onClose}
      onMoved={onMoved}
    />,
  );
  return { onClose, onMoved };
}

describe('InClinicMoveDialog (DX-492)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAppointment as jest.Mock).mockResolvedValue(appointment);
    (listStaff as jest.Mock).mockResolvedValue(staff);
    (listChairs as jest.Mock).mockResolvedValue(chairs);
    (getLocationSchedule as jest.Mock).mockRejectedValue(new Error('sin horario'));
  });

  it('cambia solo el sillón, sin horario a mano, con el paciente ya en la clínica', async () => {
    (updateAppointment as jest.Mock).mockResolvedValue(appointment);
    const { onMoved } = renderDialog();
    const select = await screen.findByLabelText('Sillón');
    expect(listChairs).toHaveBeenCalledWith('T', 'loc-1', { includeInactive: true });
    expect(screen.queryByRole('option', { name: 'Recepción' })).not.toBeInTheDocument();
    await userEvent.selectOptions(select, 'c2');
    await userEvent.click(screen.getByRole('button', { name: 'Mover cita' }));
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    expect(updateAppointment).toHaveBeenCalledWith('T', 'a1', { chairId: 'c2' });
  });

  it('si no puede abrir, avisa y se cierra', async () => {
    (getAppointment as jest.Mock).mockRejectedValue(new Error('caído'));
    const { onClose } = renderDialog();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(notifyError).toHaveBeenCalled();
  });
});
