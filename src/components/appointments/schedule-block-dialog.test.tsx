import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleBlockDialog } from './schedule-block-dialog';
import { ApiError } from '@/lib/api/client';
import {
  createScheduleBlock,
  listAffectedAppointments,
  type ScheduleBlock,
} from '@/lib/appointments/schedule-blocks-api';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/appointments/schedule-blocks-api', () => ({
  createScheduleBlock: jest.fn(),
  listAffectedAppointments: jest.fn(),
}));
const mockedCreate = createScheduleBlock as jest.MockedFunction<typeof createScheduleBlock>;
const mockedAffected = listAffectedAppointments as jest.MockedFunction<typeof listAffectedAppointments>;

const tokenWithLoc = (loc: string[]): string => {
  const b64url = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"HS256"}')}.${b64url(
    JSON.stringify({ sub: 'u1', role: 'RECEPTION', loc }),
  )}.firma`;
};

const DAY = '2031-03-04';
const staff = [
  { userId: 'prov-1', fullName: 'Dra. Ana Ríos', role: 'DENTIST' as const, locationIds: null },
  { userId: 'prov-2', fullName: 'Dr. Luis Gómez', role: 'DENTIST' as const, locationIds: null },
];
const locations = [
  clinicLocation({ id: 'loc-1', name: 'Sede principal', address: null, country: 'CO' as const, isActive: true, timeZone: 'America/Bogota', createdAt: '' }),
  clinicLocation({ id: 'loc-2', name: 'Sede Norte', address: null, country: 'CO' as const, isActive: true, timeZone: 'America/Bogota', createdAt: '' }),
];
const created = { id: 'b-1' } as ScheduleBlock;
const local = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).toISOString();

function renderDialog(props: Partial<React.ComponentProps<typeof ScheduleBlockDialog>> = {}) {
  const onCreated = jest.fn();
  render(
    <ScheduleBlockDialog
      open
      onOpenChange={jest.fn()}
      token="tok"
      staff={staff}
      locations={locations}
      activeLocationId="loc-1"
      defaultDate={DAY}
      defaultProviderId="prov-2"
      onCreated={onCreated}
      {...props}
    />,
  );
  return onCreated;
}

describe('ScheduleBlockDialog (DX-122)', () => {
  beforeEach(() => {
    mockedCreate.mockReset().mockResolvedValue(created);
    mockedAffected.mockReset().mockResolvedValue({ items: [], total: 0 });
  });

  it('bloquea las vacaciones de un profesional en días completos, en todas las sedes', async () => {
    const onCreated = renderDialog();
    await userEvent.clear(screen.getByLabelText('Hasta (incluido)'));
    await userEvent.type(screen.getByLabelText('Hasta (incluido)'), '2031-03-07');
    await userEvent.type(screen.getByLabelText('Nota (opcional)'), 'Congreso');
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    const range = { start: local(DAY, '00:00'), end: local('2031-03-08', '00:00') };
    expect(mockedAffected).toHaveBeenCalledWith('tok', { ...range, providerId: 'prov-2', locationId: undefined });
    expect(mockedCreate).toHaveBeenCalledWith('tok', {
      ...range,
      providerId: 'prov-2',
      locationId: undefined,
      kind: 'VACATION',
      allowsBooking: false,
      note: 'Congreso',
      confirmAffected: false,
    });
  });

  it('un almuerzo de la sede: por horas y deja agendar (con aviso)', async () => {
    renderDialog();
    await userEvent.click(screen.getByLabelText('Toda la sede'));
    await userEvent.selectOptions(screen.getByLabelText('Motivo'), 'LUNCH');
    expect(screen.getByLabelText('Permitir agendar encima (con aviso)')).toBeChecked();
    expect(screen.getByLabelText('Días completos')).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][1]).toMatchObject({
      locationId: 'loc-1',
      start: local(DAY, '13:00'),
      end: local(DAY, '14:00'),
      kind: 'LUNCH',
      allowsBooking: true,
    });
    expect(mockedCreate.mock.calls[0][1]).not.toHaveProperty('providerId');
  });

  it('si hay citas dentro, las lista y solo crea al confirmar', async () => {
    mockedAffected.mockResolvedValue({
      total: 3,
      items: [
      {
        id: 'apt-1',
        locationId: 'loc-1',
        providerId: 'prov-2',
        start: local(DAY, '10:00'),
        end: local(DAY, '10:30'),
        status: 'SCHEDULED',
        patientFirstName: 'María',
        patientLastName: 'López',
      },
      ],
    });
    const onCreated = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));

    const list = await screen.findByRole('list', { name: 'Citas dentro del bloqueo' });
    expect(within(list).getByText('María López')).toBeInTheDocument();
    expect(screen.getByText(/No se borran ni se mueven/)).toBeInTheDocument();
    // La API devuelve las primeras: del resto, cuántas faltan.
    expect(screen.getByText('y 2 citas más.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();

    // «Volver» deja cambiar el rango sin empezar de cero.
    await userEvent.click(screen.getByRole('button', { name: 'Volver y cambiar el bloqueo' }));
    expect(screen.getByLabelText('Motivo')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    await screen.findByRole('list', { name: 'Citas dentro del bloqueo' });

    await userEvent.click(screen.getByRole('button', { name: 'Bloquear igualmente' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockedCreate.mock.calls[0][1]).toMatchObject({ confirmAffected: true });
    expect(mockedAffected).toHaveBeenCalledTimes(2);
  });

  it('un odontólogo solo bloquea su agenda: sin elegir alcance ni profesional', () => {
    renderDialog({ ownProviderId: 'prov-1' });
    expect(screen.queryByLabelText('Toda la sede')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Profesional')).toBeDisabled();
    expect(screen.getByLabelText('Profesional')).toHaveValue('prov-1');
  });

  it('valida el rango sin llamar a la API y enseña el error del servidor', async () => {
    renderDialog();
    await userEvent.click(screen.getByLabelText('Días completos'));
    await userEvent.clear(screen.getByLabelText('Hora de fin'));
    await userEvent.type(screen.getByLabelText('Hora de fin'), '12:00');
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    expect(await screen.findByText(/posterior al inicio/)).toBeInTheDocument();
    expect(mockedAffected).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Hora de fin'));
    await userEvent.type(screen.getByLabelText('Hora de fin'), '15:00');
    mockedCreate.mockRejectedValue(
      new ApiError(403, 'x', { messages: ['Solo puedes bloquear o cambiar tu propia agenda.'] }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    expect(await screen.findByText('Solo puedes bloquear o cambiar tu propia agenda.')).toBeInTheDocument();
  });

  it('un 403 técnico de la API («Insufficient role») se enseña en español', async () => {
    mockedCreate.mockRejectedValue(new ApiError(403, 'Insufficient role'));
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    expect(
      await screen.findByText(/No tienes permiso para hacer esto/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Insufficient role')).not.toBeInTheDocument();
  });

  it('sin validación nativa del navegador: fechas vacías dan el mensaje propio', async () => {
    renderDialog();
    await userEvent.clear(screen.getByLabelText('Desde'));
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    expect(await screen.findByText('Completa el profesional o la sede, y las fechas.')).toBeInTheDocument();
    expect(screen.getByLabelText('Desde')).not.toBeRequired();
  });

  it('miembro acotado a sedes: sin «Todas las sedes» y el bloqueo de profesional lleva sede (DX-089)', async () => {
    const token = tokenWithLoc(['loc-1', 'loc-2']);
    const onCreated = renderDialog({ token });
    const select = screen.getByLabelText('Sede');
    expect(within(select).queryByRole('option', { name: 'Todas las sedes' })).not.toBeInTheDocument();
    expect(select).toHaveValue('loc-1');
    expect(
      screen.getByText('Como tu acceso está acotado a sedes, el bloqueo debe tener sede.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(mockedCreate).toHaveBeenCalledWith(
      token,
      expect.objectContaining({ providerId: 'prov-2', locationId: 'loc-1' }),
    );
  });

  it('miembro acotado sin sede activa: propone la primera permitida', async () => {
    renderDialog({ token: tokenWithLoc(['loc-2']), activeLocationId: null });
    expect(screen.getByLabelText('Sede')).toHaveValue('loc-1');
  });

  it('sin restricción conserva «Todas las sedes» y no muestra el aviso', () => {
    renderDialog();
    expect(screen.getByRole('option', { name: 'Todas las sedes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Sede')).toHaveValue('');
    expect(screen.queryByText(/acotado a sedes/)).not.toBeInTheDocument();
  });

  it('miembro acotado sin sedes disponibles: avisa, deshabilita y no pide nada (DX-089)', async () => {
    renderDialog({ token: tokenWithLoc(['loc-1']), locations: [], activeLocationId: null });
    expect(screen.getByText('No tienes ninguna sede disponible para el bloqueo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bloquear' })).toBeDisabled();
    expect(mockedAffected).not.toHaveBeenCalled();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('miembro acotado con sede activa obsoleta: envía la primera permitida (DX-089)', async () => {
    const token = tokenWithLoc(['loc-1']);
    const onCreated = renderDialog({ token, activeLocationId: 'loc-borrada' });
    expect(screen.getByLabelText('Sede')).toHaveValue('loc-1');
    await userEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(mockedCreate).toHaveBeenCalledWith(token, expect.objectContaining({ locationId: 'loc-1' }));
  });
});
