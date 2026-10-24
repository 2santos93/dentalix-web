import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CancelAppointmentDialog } from './cancel-appointment-dialog';
import { updateAppointment } from '@/lib/appointments/appointments-api';
import { getCancellationPreview } from '@/lib/cancellations/cancellation';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/appointments/appointments-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointments-api'),
  updateAppointment: jest.fn(),
}));
jest.mock('../../lib/cancellations/cancellation', () => ({
  ...jest.requireActual('../../lib/cancellations/cancellation'),
  getCancellationPreview: jest.fn(),
}));
const mockedUpdate = updateAppointment as jest.MockedFunction<typeof updateAppointment>;
const mockedPreview = getCancellationPreview as jest.MockedFunction<typeof getCancellationPreview>;

const LATE = {
  appointmentId: 'a-1',
  noticeMinutes: 300,
  lateCancellation: true,
  policy: { id: 'p1', version: 1, noticeHours: 24 },
};

function renderDialog(fromCompleted = false) {
  const onDone = jest.fn();
  render(
    <CancelAppointmentDialog
      open
      onOpenChange={() => {}}
      token="tok"
      appointmentId="a-1"
      patientName="Ana Pérez"
      fromCompleted={fromCompleted}
      onDone={onDone}
    />,
  );
  return { onDone };
}

const submit = () => screen.getByRole('button', { name: 'Cancelar la cita' });

describe('CancelAppointmentDialog (DX-279)', () => {
  beforeEach(() => {
    mockedUpdate.mockReset();
    mockedPreview.mockReset();
  });

  it('sin origen ni motivo no llama a la API y lo dice junto a cada campo', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(LATE);
    renderDialog();
    await user.click(submit());
    expect(screen.getByText('Elige quién cancela.')).toBeInTheDocument();
    expect(screen.getByText('Elige el motivo.')).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
    // B5: el grupo se marca inválido, cada radio apunta al error y el foco va al primero.
    expect(screen.getByRole('radiogroup', { name: 'Quién cancela' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    const patientRadio = screen.getByLabelText(/El paciente avisa/);
    expect(patientRadio).toHaveAccessibleDescription(/Elige quién cancela\./);
    expect(patientRadio).toHaveFocus();
  });

  it('con origen pero sin motivo, el foco va al motivo', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(LATE);
    renderDialog();
    await user.click(screen.getByLabelText(/La clínica/));
    await user.selectOptions(screen.getByLabelText('Motivo'), '');
    await user.click(submit());
    expect(screen.getByLabelText('Motivo')).toHaveFocus();
    expect(screen.getByRole('radiogroup', { name: 'Quién cancela' })).not.toHaveAttribute('aria-invalid');
  });

  it('avisa de la cancelación tardía antes de confirmar y envía origen, motivo y detalle', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(LATE);
    const result = { id: 'a-1', status: 'CANCELLED' } as Awaited<ReturnType<typeof updateAppointment>>;
    mockedUpdate.mockResolvedValue(result);
    const { onDone } = renderDialog();
    await user.click(screen.getByLabelText(/El paciente avisa/));
    expect(await screen.findByTestId('late-cancellation-warning')).toHaveTextContent(
      'Cancelación tardía: aviso de 5 h, la política pide 24 h',
    );
    await user.selectOptions(screen.getByLabelText('Motivo'), 'TRANSPORT');
    await user.type(screen.getByLabelText('Detalle (opcional)'), '  Paro de buses ');
    expect(screen.getByText('16/500')).toBeInTheDocument();
    await user.click(submit());
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'a-1', {
      status: 'CANCELLED',
      cancelledByKind: 'STAFF_FOR_PATIENT',
      cancelReasonCode: 'TRANSPORT',
      cancelReasonText: 'Paro de buses',
    });
    expect(onDone).toHaveBeenCalledWith(result);
  });

  it('si cancela la clínica no avisa de tardía y propone «La clínica reprograma»', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(LATE);
    renderDialog();
    await user.click(screen.getByLabelText(/La clínica/));
    expect(screen.queryByTestId('late-cancellation-warning')).not.toBeInTheDocument();
    expect(screen.getByText('Una cancelación de la clínica nunca cuenta como tardía.')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toHaveValue('CLINIC_RESCHEDULE');
  });

  it('sin política dice que no cuenta como tardía', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue({ ...LATE, lateCancellation: false, policy: null });
    renderDialog();
    await user.click(screen.getByLabelText(/El paciente avisa/));
    expect(
      await screen.findByText('La sede no tiene política de cancelación: no cuenta como tardía.'),
    ).toBeInTheDocument();
  });

  it('si el aviso no se pudo calcular, lo dice con reintento y deja cancelar', async () => {
    const user = userEvent.setup();
    mockedPreview.mockRejectedValueOnce(new Error('red')).mockResolvedValue(LATE);
    renderDialog();
    await user.click(screen.getByLabelText(/El paciente avisa/));
    expect(await screen.findByText('Aviso sin calcular')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('late-cancellation-warning')).toBeInTheDocument();
  });

  it('desde «Completada» pide además el motivo de la salida', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(LATE);
    mockedUpdate.mockResolvedValue({ id: 'a-1' } as Awaited<ReturnType<typeof updateAppointment>>);
    renderDialog(true);
    await user.click(screen.getByLabelText(/La clínica/));
    await user.click(submit());
    expect(screen.getByText('Escribe el motivo (al menos 3 caracteres).')).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Motivo', { selector: 'textarea' }), 'Se marcó por error');
    await user.click(submit());
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'a-1', {
      status: 'CANCELLED',
      cancelledByKind: 'CLINIC',
      cancelReasonCode: 'CLINIC_RESCHEDULE',
      statusReason: 'Se marcó por error',
    });
  });

  it('un 400 de la API se muestra en el formulario', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(LATE);
    mockedUpdate.mockRejectedValue(new ApiError(400, 'Indica el motivo de la cancelación.'));
    renderDialog();
    await user.click(screen.getByLabelText(/El paciente avisa/));
    await user.selectOptions(screen.getByLabelText('Motivo'), 'OTHER');
    await user.click(submit());
    expect(await screen.findByText('Indica el motivo de la cancelación.')).toBeInTheDocument();
  });
});
