import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import { createRecallContact, type RecallContact, type RecallDueItem } from '@/lib/recall/recall-api';
import type { Appointment } from '@/lib/appointments/appointments-api';
import { notifyError } from '@/components/errors/notify';
import { RecallScheduleDialog, scheduleDialogCopy } from './recall-schedule-dialog';

jest.mock('../../lib/patients/patients-api', () => ({ getPatient: jest.fn() }));
jest.mock('../../lib/recall/recall-api', () => ({ createRecallContact: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
// El formulario de cita tiene sus propios tests: aquí basta con sus props y con «crear».
jest.mock('../appointments/appointment-form', () => ({
  AppointmentForm: (props: {
    defaultAppointmentTypeId?: string | null;
    defaultReason?: string;
    onCreated: (a: { id: string }) => void;
  }) => (
    <div data-testid="appointment-form" data-type={props.defaultAppointmentTypeId ?? ''} data-reason={props.defaultReason}>
      <button type="button" onClick={() => props.onCreated({ id: 'ap-1' })}>
        Crear cita
      </button>
    </div>
  ),
}));

const mockedGetPatient = jest.mocked(getPatient);
const mockedContact = jest.mocked(createRecallContact);
const mockedNotify = jest.mocked(notifyError);

const item: RecallDueItem = {
  recallId: 'r1',
  patientId: 'p1',
  patientName: 'Ana Pérez',
  patientPhone: '+58 412 555 0101',
  patientWhatsApp: '584125550101',
  reminderOptedOut: false,
  kind: 'HYGIENE',
  recallTypeId: 't-hyg',
  recallTypeName: 'Higiene',
  intervalMonths: 6,
  baseDate: '2026-04-10',
  dueAt: '2026-10-10',
  daysOverdue: 22,
  locationId: 'l1',
  lastContact: null,
};

describe('RecallScheduleDialog (DX-015-bis-4, D21–D22)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetPatient.mockResolvedValue({ id: 'p1', firstName: 'Ana', lastName: 'Pérez' } as Patient);
  });

  it('prellena el tipo de cita y registra «Agendó» con la cita creada antes de avisar al padre', async () => {
    const user = userEvent.setup();
    let resolveContact: (c: RecallContact) => void = () => {};
    mockedContact.mockReturnValue(new Promise((r) => (resolveContact = r)));
    const onCreated = jest.fn();
    render(<RecallScheduleDialog token="tok" item={item} appointmentTypeId="a-lim" onClose={jest.fn()} onCreated={onCreated} />);
    const form = await screen.findByTestId('appointment-form');
    expect(form).toHaveAttribute('data-type', 'a-lim');
    expect(form).toHaveAttribute('data-reason', 'Recall: higiene');

    const channel = screen.getByLabelText(scheduleDialogCopy.channel);
    expect(channel).toHaveValue('CALL');
    expect(within(channel).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Llamada',
      'WhatsApp',
      'Email',
      'En persona',
    ]);
    await user.selectOptions(channel, 'WHATSAPP_LINK');
    await user.click(screen.getByRole('button', { name: 'Crear cita' }));

    expect(mockedContact).toHaveBeenCalledWith('tok', 'r1', {
      channel: 'WHATSAPP_LINK',
      outcome: 'BOOKED',
      appointmentId: 'ap-1',
    });
    // Mientras se registra, el formulario ya no está: no hay segunda cita.
    expect(screen.getByRole('status')).toHaveTextContent(scheduleDialogCopy.registering);
    expect(screen.queryByTestId('appointment-form')).not.toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();

    resolveContact({} as RecallContact);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'ap-1' } as Appointment));
    expect(mockedNotify).not.toHaveBeenCalled();
  });

  it('desde «Registrar contacto»: el canal y la nota ya puestos, y la nota va en el contacto', async () => {
    const user = userEvent.setup();
    mockedContact.mockResolvedValue({} as RecallContact);
    const onCreated = jest.fn();
    render(
      <RecallScheduleDialog
        token="tok"
        item={item}
        defaultChannel="IN_PERSON"
        note="Prefiere la tarde"
        onClose={jest.fn()}
        onCreated={onCreated}
      />,
    );
    await screen.findByTestId('appointment-form');
    expect(screen.getByLabelText(scheduleDialogCopy.channel)).toHaveValue('IN_PERSON');
    expect(screen.getByText(scheduleDialogCopy.note('Prefiere la tarde'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Crear cita' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockedContact).toHaveBeenCalledWith('tok', 'r1', {
      channel: 'IN_PERSON',
      outcome: 'BOOKED',
      appointmentId: 'ap-1',
      note: 'Prefiere la tarde',
    });
  });

  it('si el contacto falla, la cita queda: aviso con el motivo, reintento solo del contacto y el padre refresca', async () => {
    const user = userEvent.setup();
    mockedContact.mockRejectedValueOnce(new ApiError(400, 'La cita no es de este paciente.'));
    mockedContact.mockResolvedValueOnce({} as RecallContact);
    const onCreated = jest.fn();
    render(<RecallScheduleDialog token="tok" item={item} onClose={jest.fn()} onCreated={onCreated} />);
    await user.click(await screen.findByRole('button', { name: 'Crear cita' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'ap-1' }));
    expect(mockedNotify).toHaveBeenCalledWith(
      'La cita quedó agendada, pero no se registró el contacto: La cita no es de este paciente.',
      expect.objectContaining({ onRetry: expect.any(Function) }),
    );
    mockedNotify.mock.calls[0][1]!.onRetry!();
    await waitFor(() => expect(mockedContact).toHaveBeenCalledTimes(2));
    expect(mockedContact.mock.calls[1]).toEqual(mockedContact.mock.calls[0]);
  });
});
