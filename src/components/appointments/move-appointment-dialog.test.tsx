import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readDate, readTime, typeTime } from './date-segments-for-tests';
import { MoveAppointmentDialog } from './move-appointment-dialog';
import { ApiError } from '@/lib/api/client';
import { updateAppointment, type Appointment } from '@/lib/appointments/appointments-api';
import { caracasSede, testAgendaClock } from '@/lib/test/sede-clock';
import { wallInstant } from '@/lib/time/wall-clock';
import { findOpenings } from '@/lib/appointments/waitlist-api';

/** Reloj de la sede de pruebas (UTC, 24 h): estas pruebas no tratan del reloj. */
const CLOCK = testAgendaClock();

jest.mock('../../lib/appointments/appointments-api', () => ({
  updateAppointment: jest.fn(),
}));
const mockedUpdate = updateAppointment as jest.MockedFunction<typeof updateAppointment>;
jest.mock('../../lib/appointments/waitlist-api', () => ({
  findOpenings: jest.fn(),
}));

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

describe('MoveAppointmentDialog · sobrecupo que choca (DX-509-bis)', () => {
  const mockedOpenings = findOpenings as jest.MockedFunction<typeof findOpenings>;
  const overbooked: Appointment = { ...appointment, overbooked: true };
  const overlap = () =>
    new ApiError(409, 'El profesional ya tiene una cita en ese horario', { code: 'APPOINTMENT_OVERLAP' });
  const at = (hhmm: string) => new Date(`${FUTURE}T${hhmm}:00`).toISOString();

  beforeEach(() => {
    mockedUpdate.mockReset();
    mockedOpenings.mockReset();
  });

  function renderOverbooked(props: Partial<React.ComponentProps<typeof MoveAppointmentDialog>> = {}) {
    render(
      <MoveAppointmentDialog
        clock={CLOCK}
        open
        onOpenChange={jest.fn()}
        token="tok"
        appointment={overbooked}
        providers={providers}
        hours={null}
        onMoved={jest.fn()}
        {...props}
      />,
    );
  }

  it('ofrece el primer hueco libre desde la hora pedida (la propia cita no ocupa) y «Usar este hueco» lo pone en el formulario', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValueOnce(overlap());
    mockedOpenings.mockResolvedValue({
      timeZone: 'UTC',
      durationMinutes: 90,
      truncated: false,
      openings: [
        // Antes de la hora pedida: no vale. Corto: no cabe.
        { start: at('07:00'), end: at('08:30') },
        { start: at('11:00'), end: at('12:00') },
        { start: at('13:15'), end: at('16:00') },
      ],
    });
    renderOverbooked();
    await user.click(screen.getByRole('button', { name: 'Mover cita' }));

    expect(await screen.findByText('El profesional ya tiene una cita en ese horario')).toBeInTheDocument();
    const offer = await screen.findByTestId('move-next-opening');
    await waitFor(() => expect(offer).toHaveTextContent('Siguiente hueco libre'));
    expect(offer).toHaveTextContent('13:15 con Dra. Ana Ríos');
    expect(mockedOpenings).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({
        providerId: 'prov-1',
        locationId: 'loc-1',
        from: FUTURE,
        durationMinutes: 90,
        patientId: 'pat-1',
        excludeAppointmentId: 'apt-1',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Usar este hueco' }));
    expect(readTime('Hora de inicio')).toBe('13:15');
    expect(screen.queryByTestId('move-next-opening')).not.toBeInTheDocument();
    mockedUpdate.mockResolvedValueOnce({ ...overbooked, notes: null, start: at('13:15'), overbooked: false });
    await user.click(screen.getByRole('button', { name: 'Mover cita' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenLastCalledWith('tok', 'apt-1', {
        start: at('13:15'),
        end: at('14:45'),
        providerId: 'prov-1',
      }),
    );
  });

  it('sin hueco en 14 días lo dice; una cita normal o otro 409 no busca', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValueOnce(overlap());
    mockedOpenings.mockResolvedValue({ timeZone: 'UTC', durationMinutes: 90, truncated: false, openings: [] });
    renderOverbooked();
    await user.click(screen.getByRole('button', { name: 'Mover cita' }));
    expect(await screen.findByText(/No hay huecos libres de ese profesional en los próximos 14 días/)).toBeInTheDocument();
  });

  it('otro 409 (sin código de solape) no ofrece hueco', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValueOnce(new ApiError(409, 'El paciente ya está en la clínica'));
    renderOverbooked();
    await user.click(screen.getByRole('button', { name: 'Mover cita' }));
    expect(await screen.findByText('El paciente ya está en la clínica')).toBeInTheDocument();
    expect(mockedOpenings).not.toHaveBeenCalled();
    expect(screen.queryByTestId('move-next-opening')).not.toBeInTheDocument();
  });

  it('una cita que no es sobrecupo tampoco', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValueOnce(overlap());
    render(
      <MoveAppointmentDialog clock={CLOCK} open onOpenChange={jest.fn()} token="tok" appointment={appointment}
        providers={providers} hours={null} onMoved={jest.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Mover cita' }));
    expect(await screen.findByText('El profesional ya tiene una cita en ese horario')).toBeInTheDocument();
    expect(mockedOpenings).not.toHaveBeenCalled();
  });

  it('abierto tras el choque de un arrastre: parte del destino arrastrado, con el mensaje y el hueco', async () => {
    mockedOpenings.mockResolvedValue({
      timeZone: 'UTC',
      durationMinutes: 90,
      truncated: false,
      openings: [{ start: at('12:00'), end: at('18:00') }],
    });
    renderOverbooked({
      collision: {
        target: { start: at('11:00'), end: at('12:30'), providerId: 'prov-2' },
        error: overlap(),
        message: 'El profesional ya tiene una cita en ese horario',
      },
    });
    expect(readTime('Hora de inicio')).toBe('11:00');
    expect(screen.getByLabelText('Profesional')).toHaveValue('prov-2');
    expect(screen.getByText('El profesional ya tiene una cita en ese horario')).toBeInTheDocument();
    const offer = await screen.findByTestId('move-next-opening');
    await waitFor(() => expect(offer).toHaveTextContent('12:00 con Dr. Luis Gómez'));
  });
});
