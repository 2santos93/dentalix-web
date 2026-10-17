import { render, screen, within } from '@testing-library/react';
import { AppointmentRemindersPanel } from './appointment-reminders-panel';
import {
  getAppointmentReminders,
  type AppointmentReminderItem,
} from '@/lib/reminders/reminders-api';
import { ApiError } from '@/lib/api/client';
import { formatTime } from '@/lib/format/date';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/reminders/reminders-api', () => ({
  ...jest.requireActual('../../lib/reminders/reminders-api'),
  getAppointmentReminders: jest.fn(),
}));

const mockedGet = getAppointmentReminders as jest.MockedFunction<typeof getAppointmentReminders>;

const START = '2026-10-16T14:00:00.000Z';
const item = (over: Partial<AppointmentReminderItem>): AppointmentReminderItem => ({
  leadHours: 48,
  appointmentStart: START,
  dueAt: '2026-10-14T14:00:00.000Z',
  state: 'PENDING',
  sentAt: null,
  skipReason: null,
  emailDelivery: null,
  current: true,
  ...over,
});

describe('AppointmentRemindersPanel (DX-026)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('carga con skeleton y luego enviado, pendiente y omitido con motivo', async () => {
    mockedGet.mockResolvedValue({
      enabled: true,
      leadHours: [48, 2],
      items: [
        item({
          state: 'SENT',
          sentAt: '2026-10-14T14:00:00.000Z',
          emailDelivery: 'SENT',
        }),
        item({ leadHours: 2, dueAt: '2026-10-16T12:00:00.000Z' }),
        item({
          leadHours: 2,
          appointmentStart: '2026-10-15T14:00:00.000Z',
          state: 'SKIPPED',
          skipReason: 'RESCHEDULED',
          current: false,
        }),
      ],
    });
    render(<AppointmentRemindersPanel token="tok" appointmentId="a-1" />);
    expect(screen.getByRole('status', { name: 'Cargando recordatorios' })).toBeInTheDocument();

    const list = await screen.findByRole('list', { name: 'Recordatorios de la cita' });
    const [sent, pending, skipped] = within(list).getAllByRole('listitem');
    expect(sent).toHaveTextContent(`Enviado 14/10 ${formatTime('2026-10-14T14:00:00.000Z')}`);
    expect(sent).toHaveTextContent('2 días antes');
    expect(sent).toHaveTextContent('Entregado al proveedor de correo');
    expect(pending).toHaveTextContent('Pendiente');
    expect(pending).toHaveTextContent('2 h antes');
    expect(pending).toHaveTextContent(`sale el 16/10 ${formatTime('2026-10-16T12:00:00.000Z')}`);
    expect(skipped).toHaveTextContent('Omitido: reprogramada');
    expect(skipped).toHaveTextContent('Para la hora anterior de la cita');
    expect(mockedGet).toHaveBeenCalledWith('tok', 'a-1');
  });

  it('omitido sin email, no enviado por agendarse tarde y email fallido', async () => {
    mockedGet.mockResolvedValue({
      enabled: true,
      leadHours: [48, 2],
      items: [
        item({ state: 'MISSED' }),
        item({ leadHours: 2, state: 'SKIPPED', skipReason: 'NO_EMAIL' }),
        item({
          leadHours: 1,
          state: 'SENT',
          sentAt: '2026-10-16T13:00:00.000Z',
          emailDelivery: 'FAILED',
        }),
      ],
    });
    render(<AppointmentRemindersPanel token="tok" appointmentId="a-1" />);
    const list = await screen.findByRole('list', { name: 'Recordatorios de la cita' });
    expect(list).toHaveTextContent('No enviado');
    expect(list).toHaveTextContent('La cita se agendó después de esa hora.');
    expect(list).toHaveTextContent('Omitido: sin email');
    expect(list).toHaveTextContent('El proveedor de correo no pudo entregarlo');
  });

  it('vacío: sede sin recordatorios, o nada por salir', async () => {
    mockedGet.mockResolvedValueOnce({ enabled: false, leadHours: [], items: [] });
    const { unmount } = render(<AppointmentRemindersPanel token="tok" appointmentId="a-1" />);
    expect(
      await screen.findByText('La sede de esta cita no tiene recordatorios automáticos.'),
    ).toBeInTheDocument();
    unmount();

    mockedGet.mockResolvedValueOnce({ enabled: true, leadHours: [2], items: [] });
    render(<AppointmentRemindersPanel token="tok" appointmentId="a-2" />);
    expect(await screen.findByText('Esta cita no tiene recordatorios por salir.')).toBeInTheDocument();
  });

  it('error con reintento (escalón 1) que vuelve a cargar', async () => {
    const user = setupUser();
    mockedGet
      .mockRejectedValueOnce(new ApiError(500, 'Caído'))
      .mockResolvedValueOnce({ enabled: true, leadHours: [2], items: [item({ leadHours: 2 })] });
    render(<AppointmentRemindersPanel token="tok" appointmentId="a-1" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar los recordatorios de la cita.');
    await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('list', { name: 'Recordatorios de la cita' })).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
