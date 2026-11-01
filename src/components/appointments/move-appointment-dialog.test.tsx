import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readDate, readTime, typeTime } from './date-segments-for-tests';
import { MoveAppointmentDialog } from './move-appointment-dialog';
import { ApiError } from '@/lib/api/client';
import { updateAppointment, type Appointment } from '@/lib/appointments/appointments-api';
import { caracasSede, testAgendaClock } from '@/lib/test/sede-clock';
import { wallInstant } from '@/lib/time/wall-clock';

/** Reloj de la sede de pruebas (UTC, 24 h): estas pruebas no tratan del reloj. */
const CLOCK = testAgendaClock();

jest.mock('../../lib/appointments/appointments-api', () => ({
  updateAppointment: jest.fn(),
}));
const mockedUpdate = updateAppointment as jest.MockedFunction<typeof updateAppointment>;

const FUTURE = (() => {
  const d = new Date(Date.now() + 5 * 24 * 3600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const providers = [
  { userId: 'prov-1', fullName: 'Dra. Ana Ríos', role: 'DENTIST' as const, locationIds: null },
  { userId: 'prov-2', fullName: 'Dr. Luis Gómez', role: 'DENTIST' as const, locationIds: null },
];

const appointment: Appointment = {
  id: 'apt-1',
  tenantId: 't1',
  locationId: 'loc-1',
  patientId: 'pat-1',
  patientFirstName: 'María',
  patientLastName: 'López',
  providerId: 'prov-1',
  start: new Date(`${FUTURE}T09:00:00`).toISOString(),
  end: new Date(`${FUTURE}T10:30:00`).toISOString(),
  status: 'SCHEDULED',
  reason: null,
  notes: null,
  createdById: null,
  appointmentTypeId: null,
  appointmentType: null,
  confirmationSentAt: null,
  callbackRequestedAt: null,
  wantsEarlier: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderDialog(onMoved = jest.fn()) {
  render(
    <MoveAppointmentDialog clock={CLOCK}
      open
      onOpenChange={jest.fn()}
      token="tok"
      appointment={appointment}
      providers={providers}
      hours={null}
      onMoved={onMoved}
    />,
  );
  return onMoved;
}

describe('MoveAppointmentDialog (DX-121)', () => {
  beforeEach(() => mockedUpdate.mockReset());

  it('parte de la fecha, hora y profesional actuales', () => {
    renderDialog();
    expect(readDate('Fecha')).toBe(FUTURE);
    expect(readTime('Hora de inicio')).toBe('09:00');
    expect(screen.getByLabelText('Profesional')).toHaveValue('prov-1');
    expect(screen.getByText('Dura 90 min: terminaría a las 10:30.')).toBeInTheDocument();
  });

  it('solo con teclado: cambia hora y profesional y hace UN PATCH conservando la duración', async () => {
    const user = userEvent.setup();
    const moved = { ...appointment, notes: appointment.notes ?? null, providerId: 'prov-2' };
    mockedUpdate.mockResolvedValue(moved);
    const onMoved = renderDialog();

    await user.selectOptions(screen.getByLabelText('Profesional'), 'prov-2');
    await typeTime(user, 'Hora de inicio', '15:00');
    // Envío implícito con Enter desde el campo de hora (primitiva de fecha).
    await user.keyboard('{Enter}');

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'apt-1', {
      start: new Date(`${FUTURE}T15:00:00`).toISOString(),
      end: new Date(`${FUTURE}T16:30:00`).toISOString(),
      providerId: 'prov-2',
    });
    expect(onMoved).toHaveBeenCalledWith(moved);
  });

  it('un 409 deja el modal abierto con el mensaje del servidor', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValue(
      new ApiError(409, 'El profesional ya tiene una cita en ese horario'),
    );
    const onMoved = renderDialog();

    await user.selectOptions(screen.getByLabelText('Profesional'), 'prov-2');
    await user.click(screen.getByRole('button', { name: 'Mover cita' }));

    expect(await screen.findByText('El profesional ya tiene una cita en ese horario')).toBeInTheDocument();
    expect(onMoved).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('MoveAppointmentDialog con el reloj de la sede (DX-378)', () => {
  beforeEach(() => mockedUpdate.mockReset());

  it('la fecha y la hora son las de la sede de la cita; el destino se calcula en su zona', async () => {
    const user = userEvent.setup();
    const ccs = (minute: number) => wallInstant(FUTURE, minute, 'America/Caracas').toISOString();
    const inCaracas = { ...appointment, notes: null, start: ccs(9 * 60), end: ccs(10 * 60 + 30) };
    mockedUpdate.mockResolvedValue(inCaracas);
    render(
      <MoveAppointmentDialog
        clock={testAgendaClock([caracasSede()])}
        open
        onOpenChange={jest.fn()}
        token="tok"
        appointment={inCaracas}
        providers={providers}
        hours={null}
        onMoved={jest.fn()}
      />,
    );
    expect(readTime('Hora de inicio')).toBe('09:00');
    expect(screen.getByText('Dura 90 min: terminaría a las 10:30 a. m.')).toBeInTheDocument();
    await typeTime(user, 'Hora de inicio', '15:00');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'apt-1', {
      start: ccs(15 * 60),
      end: ccs(16 * 60 + 30),
      providerId: 'prov-1',
    });
  });
});

describe('MoveAppointmentDialog con sillones (DX-211)', () => {
  beforeEach(() => mockedUpdate.mockReset());
  const base = {
    tenantId: 't1',
    locationId: 'loc-1',
    sortOrder: 0,
    defaultProviderId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const chairs = [
    { ...base, id: 'ch-1', name: 'Sillón 1', active: true },
    { ...base, id: 'ch-2', name: 'Sillón 2', active: true },
    { ...base, id: 'ch-old', name: 'Viejo', active: false },
  ];
  const withChair: Appointment = {
    ...appointment,
    chairId: 'ch-old',
    chair: { id: 'ch-old', name: 'Viejo', active: false },
  };

  function renderWithChairs(appt: Appointment) {
    render(
      <MoveAppointmentDialog clock={CLOCK}
        open
        onOpenChange={jest.fn()}
        token="tok"
        appointment={appt}
        providers={providers}
        hours={null}
        onMoved={jest.fn()}
        chairs={chairs}
      />,
    );
  }

  it('ofrece los sillones activos y el de la cita aunque esté inactivo', () => {
    renderWithChairs(withChair);
    const select = screen.getByLabelText('Sillón');
    expect(select).toHaveValue('ch-old');
    expect(screen.getByRole('option', { name: 'Viejo (inactivo)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sillón 2' })).toBeInTheDocument();
  });

  it('cambiar de sillón manda chairId en el mismo PATCH; quitarlo manda null', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockResolvedValue({ ...withChair, notes: null });
    renderWithChairs(withChair);
    await user.selectOptions(screen.getByLabelText('Sillón'), 'ch-2');
    await user.click(screen.getByRole('button', { name: 'Mover cita' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'apt-1', expect.objectContaining({ chairId: 'ch-2' })),
    );
    mockedUpdate.mockClear();
    await user.selectOptions(screen.getByLabelText('Sillón'), '');
    await user.click(screen.getByRole('button', { name: 'Mover cita' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'apt-1', expect.objectContaining({ chairId: null })),
    );
  });

  it('sin cambiar el sillón no lo manda (una cita sin sillones sigue igual)', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockResolvedValue({ ...appointment, notes: null });
    renderWithChairs(appointment);
    await user.click(screen.getByRole('button', { name: 'Mover cita' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalled());
    expect(mockedUpdate.mock.calls[0][2]).not.toHaveProperty('chairId');
  });

  it('revisión A1: si solo cambia el sillón, manda solo {chairId} (sin hora ni profesional), también en una cita ya empezada', async () => {
    const user = userEvent.setup();
    const started = new Date(Date.now() - 10 * 60_000);
    const inClinic: Appointment = {
      ...withChair,
      chairId: 'ch-1',
      chair: { id: 'ch-1', name: 'Sillón 1', active: true },
      status: 'ARRIVED',
      start: started.toISOString(),
      end: new Date(started.getTime() + 30 * 60_000).toISOString(),
    };
    mockedUpdate.mockResolvedValue({ ...inClinic, notes: null, chairId: 'ch-2' });
    renderWithChairs(inClinic);
    await user.selectOptions(screen.getByLabelText('Sillón'), 'ch-2');
    await user.click(screen.getByRole('button', { name: 'Mover cita' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'apt-1', { chairId: 'ch-2' }));
  });
});
