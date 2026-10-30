import { render, screen, within } from '@testing-library/react';
import { AppointmentRemindersPanel } from './appointment-reminders-panel';
import {
  getAppointmentReminders,
  type AppointmentReminderItem,
} from '@/lib/reminders/reminders-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { caracasSede, testAgendaClock } from '@/lib/test/sede-clock';

/** Reloj de la sede de pruebas (UTC, 24 h): estas pruebas no tratan del reloj. */
const CLOCK = testAgendaClock();

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
  failureReason: null,
  emailDelivery: null,
  sentToResponsible: false,
  current: true,
  ...over,
});

describe('AppointmentRemindersPanel (DX-026)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('carga con skeleton y luego enviado, pendiente y omitido con motivo', async () => {
    mockedGet.mockResolvedValue({
      enabled: true,
      leadHours: [48, 2],
      patientBlocker: null,
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
    render(<AppointmentRemindersPanel clock={CLOCK} token="tok" appointmentId="a-1" />);
    expect(screen.getByRole('status', { name: 'Cargando recordatorios' })).toBeInTheDocument();

    const list = await screen.findByRole('list', { name: 'Recordatorios de la cita' });
    const [sent, pending, skipped] = within(list).getAllByRole('listitem');
    expect(sent).toHaveTextContent('Enviado 14/10 14:00');
    expect(sent).toHaveTextContent('2 días antes');
    expect(sent).toHaveTextContent('Entregado al proveedor de correo');
    expect(pending).toHaveTextContent('Pendiente');
    expect(pending).toHaveTextContent('2 h antes');
    expect(pending).toHaveTextContent('sale el 16/10 12:00');
    expect(skipped).toHaveTextContent('Omitido: reprogramada');
    expect(skipped).toHaveTextContent('Para la hora anterior de la cita');
    expect(mockedGet).toHaveBeenCalledWith('tok', 'a-1');
  });

  it('DX-378: la hora de envío, con la zona y el reloj de 12 h de la sede de la cita', async () => {
    mockedGet.mockResolvedValue({
      enabled: true,
      leadHours: [48],
      patientBlocker: null,
      items: [item({ state: 'SENT', sentAt: '2026-10-14T14:00:00.000Z', emailDelivery: 'SENT' })],
    });
    render(<AppointmentRemindersPanel clock={testAgendaClock([caracasSede()])} token="tok" appointmentId="a-1" />);
    const list = await screen.findByRole('list', { name: 'Recordatorios de la cita' });
    // 14:00 UTC son las 10:00 a. m. en Caracas.
    expect(within(list).getByRole('listitem')).toHaveTextContent('Enviado 14/10 10:00 a. m.');
  });

  it('omitido sin email, no enviado por agendarse tarde y email fallido', async () => {
    mockedGet.mockResolvedValue({
      enabled: true,
      leadHours: [48, 2],
      patientBlocker: null,
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
    render(<AppointmentRemindersPanel clock={CLOCK} token="tok" appointmentId="a-1" />);
    const list = await screen.findByRole('list', { name: 'Recordatorios de la cita' });
    expect(list).toHaveTextContent('No enviado');
    expect(list).toHaveTextContent('La cita se agendó después de esa hora.');
    expect(list).toHaveTextContent('Omitido: sin email');
    expect(list).toHaveTextContent('El proveedor de correo no pudo entregarlo');
  });

  it('DX-160: fallo definitivo se distingue de pendiente con etiqueta y explicación', async () => {
    mockedGet.mockResolvedValue({
      enabled: true,
      leadHours: [2],
      patientBlocker: null,
      items: [item({
        leadHours: 2,
        state: 'FAILED',
        failureReason: 'Error ECONNRESET',
      })],
    });
    render(<AppointmentRemindersPanel clock={CLOCK} token="tok" appointmentId="a-1" />);
    const list = await screen.findByRole('list', { name: 'Recordatorios de la cita' });
    expect(within(list).getByText('Falló el envío')).toHaveClass('text-danger-text');
    expect(list).toHaveTextContent('El recordatorio no pudo enviarse tras agotar los intentos.');
    expect(list).not.toHaveTextContent('Pendiente');
    expect(list).not.toHaveTextContent('sale el');
    expect(list).not.toHaveTextContent('Error ECONNRESET');
  });

  it('vacío: sede sin recordatorios, o nada por salir', async () => {
    mockedGet.mockResolvedValueOnce({ enabled: false, leadHours: [], patientBlocker: null, items: [] });
    const { unmount } = render(<AppointmentRemindersPanel clock={CLOCK} token="tok" appointmentId="a-1" />);
    expect(
      await screen.findByText('La sede de esta cita no tiene recordatorios automáticos.'),
    ).toBeInTheDocument();
    unmount();

    mockedGet.mockResolvedValueOnce({ enabled: true, leadHours: [2], patientBlocker: null, items: [] });
    render(<AppointmentRemindersPanel clock={CLOCK} token="tok" appointmentId="a-2" />);
    expect(await screen.findByText('Esta cita no tiene recordatorios por salir.')).toBeInTheDocument();
  });

  it('error con reintento (escalón 1) que vuelve a cargar', async () => {
    const user = setupUser();
    mockedGet
      .mockRejectedValueOnce(new ApiError(500, 'Caído'))
      .mockResolvedValueOnce({
        enabled: true,
        leadHours: [2],
        patientBlocker: null,
        items: [item({ leadHours: 2 })],
      });
    render(<AppointmentRemindersPanel clock={CLOCK} token="tok" appointmentId="a-1" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar los recordatorios de la cita.');
    await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('list', { name: 'Recordatorios de la cita' })).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  // DX-128: la preferencia del paciente explica por qué no hay nada por salir.
  it.each([
    ['OPTED_OUT', 'El paciente se dio de baja de los recordatorios automáticos.'],
    ['CHANNEL_NONE', 'El paciente no quiere avisos automáticos (canal: ninguno).'],
    [
      'CHANNEL_WHATSAPP',
      'El canal del paciente es WhatsApp: no recibe el email automático. Usa «Abrir WhatsApp» para escribirle.',
    ],
  ] as const)('con %s lo dice en vez de «sin recordatorios por salir»', async (blocker, text) => {
    mockedGet.mockResolvedValue({ enabled: true, leadHours: [2], patientBlocker: blocker, items: [] });
    render(<AppointmentRemindersPanel clock={CLOCK} token="tok" appointmentId="a-1" />);
    expect(await screen.findByText(text)).toHaveAttribute('role', 'status');
    expect(screen.queryByText('Esta cita no tiene recordatorios por salir.')).not.toBeInTheDocument();
  });

  it('lo ya enviado se sigue viendo, con el aviso de la baja debajo', async () => {
    mockedGet.mockResolvedValue({
      enabled: true,
      leadHours: [48, 2],
      patientBlocker: 'OPTED_OUT',
      items: [item({ state: 'SENT', sentAt: '2026-10-14T14:00:00.000Z' })],
    });
    render(<AppointmentRemindersPanel clock={CLOCK} token="tok" appointmentId="a-1" />);
    expect(await screen.findByRole('list', { name: 'Recordatorios de la cita' })).toBeInTheDocument();
    expect(screen.getByText('El paciente se dio de baja de los recordatorios automáticos.')).toBeInTheDocument();
  });

  it('nombra los motivos de omisión nuevos', async () => {
    mockedGet.mockResolvedValue({
      enabled: true,
      leadHours: [48, 2],
      patientBlocker: null,
      items: [
        item({ state: 'SKIPPED', skipReason: 'OPTED_OUT' }),
        item({ leadHours: 2, state: 'SKIPPED', skipReason: 'CHANNEL_WHATSAPP' }),
      ],
    });
    render(<AppointmentRemindersPanel clock={CLOCK} token="tok" appointmentId="a-1" />);
    const list = await screen.findByRole('list', { name: 'Recordatorios de la cita' });
    expect(list).toHaveTextContent('Omitido: el paciente se dio de baja');
    expect(list).toHaveTextContent('Omitido: su canal es WhatsApp');
  });

  it('DX-203: el que salió al responsable lo dice', async () => {
    mockedGet.mockResolvedValue({
      enabled: true,
      leadHours: [48],
      patientBlocker: null,
      items: [
        item({
          state: 'SENT',
          sentAt: '2026-10-14T14:00:00.000Z',
          emailDelivery: 'SENT',
          sentToResponsible: true,
        }),
      ],
    });
    render(<AppointmentRemindersPanel clock={CLOCK} token="tok" appointmentId="appt-1" />);
    expect(await screen.findByText('Recordatorio enviado al responsable')).toBeInTheDocument();
  });
});
