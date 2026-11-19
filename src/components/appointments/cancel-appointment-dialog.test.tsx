import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CancelAppointmentDialog } from './cancel-appointment-dialog';
import { updateAppointment } from '@/lib/appointments/appointments-api';
import { cancelAppointmentSeries } from '@/lib/appointments/appointment-series-api';
import { getCancellationPreview } from '@/lib/cancellations/cancellation';
import { ApiError } from '@/lib/api/client';
import type { AppointmentStatus } from '@/lib/appointments/appointments-api';

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

function renderDialog(fromStatus: AppointmentStatus = 'SCHEDULED') {
  const onDone = jest.fn();
  render(
    <CancelAppointmentDialog
      open
      onOpenChange={() => {}}
      token="tok"
      appointmentId="a-1"
      patientName="Ana Pérez"
      fromStatus={fromStatus}
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
    renderDialog('COMPLETED');
    await user.click(screen.getByLabelText(/La clínica/));
    await user.click(submit());
    expect(screen.getByText('Escribe el motivo (al menos 3 caracteres).')).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
    // QA D2: el motivo de la salida no se llama igual que el del catálogo.
    expect(screen.getAllByLabelText('Motivo')).toHaveLength(1);
    await user.type(screen.getByLabelText('Por qué se deshace la cita completada'), 'Se marcó por error');
    await user.click(submit());
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'a-1', {
      status: 'CANCELLED',
      cancelledByKind: 'CLINIC',
      cancelReasonCode: 'CLINIC_RESCHEDULE',
      statusReason: 'Se marcó por error',
    });
  });

  it.each(['ARRIVED', 'COMPLETED'] as const)(
    'si el paciente ya vino (%s) no dice «Con aviso suficiente» sino por qué no es tardía (QA D1)',
    async (status) => {
      const user = userEvent.setup();
      mockedPreview.mockResolvedValue({ ...LATE, noticeMinutes: 0, lateCancellation: false });
      renderDialog(status);
      await user.click(screen.getByLabelText(/El paciente avisa/));
      expect(
        await screen.findByText('El paciente ya vino a la cita: esta cancelación no cuenta como tardía.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Con aviso suficiente/)).not.toBeInTheDocument();
    },
  );

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

// DX-562: una cita de una serie elige «Solo esta cita» o «Esta y las siguientes».
jest.mock('../../lib/appointments/appointment-series-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointment-series-api'),
  cancelAppointmentSeries: jest.fn(),
}));

describe('CancelAppointmentDialog · cita de una serie (DX-562)', () => {
  const mockedCancelSeries = jest.mocked(cancelAppointmentSeries);
  const series = { id: 's-1', index: 4, total: 6 };

  function renderSeries() {
    const onDone = jest.fn();
    const onSeriesDone = jest.fn();
    const onSeriesStale = jest.fn();
    render(
      <CancelAppointmentDialog
        open
        onOpenChange={() => {}}
        token="tok"
        appointmentId="a-4"
        patientName="Ana Pérez"
        fromStatus="SCHEDULED"
        onDone={onDone}
        series={series}
        onSeriesDone={onSeriesDone}
        onSeriesStale={onSeriesStale}
      />,
    );
    return { onDone, onSeriesDone, onSeriesStale };
  }

  beforeEach(() => {
    mockedUpdate.mockReset();
    mockedCancelSeries.mockReset();
    mockedPreview.mockReset();
    mockedPreview.mockResolvedValue(LATE);
  });

  it('por defecto «Solo esta cita»: el PATCH de siempre', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockResolvedValue({ id: 'a-4' } as never);
    const { onDone } = renderSeries();
    expect(screen.getByRole('radiogroup', { name: 'Qué citas cancelar' })).toHaveAccessibleDescription(
      /Serie · 4 de 6/,
    );
    expect(screen.getByLabelText(/Solo esta cita/)).toBeChecked();
    await user.click(screen.getByLabelText(/La clínica/));
    await user.click(submit());
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'a-4', expect.objectContaining({ status: 'CANCELLED' }));
    expect(mockedCancelSeries).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it('«Esta y las siguientes» cancela la serie desde esta cita, con el mismo origen y motivo', async () => {
    const user = userEvent.setup();
    const change = { seriesId: 's-1', appointments: [] };
    mockedCancelSeries.mockResolvedValue(change);
    const { onSeriesDone } = renderSeries();
    await user.click(screen.getByLabelText(/Esta y las siguientes/));
    await user.click(screen.getByLabelText(/El paciente avisa/));
    await user.selectOptions(screen.getByLabelText('Motivo'), 'WORK');
    await user.type(screen.getByLabelText('Detalle (opcional)'), ' Cambió de turno ');
    await user.click(screen.getByRole('button', { name: 'Cancelar esta y las siguientes' }));
    expect(mockedCancelSeries).toHaveBeenCalledWith('tok', 's-1', {
      fromAppointmentId: 'a-4',
      cancelledByKind: 'STAFF_FOR_PATIENT',
      cancelReasonCode: 'WORK',
      cancelReasonText: 'Cambió de turno',
    });
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(onSeriesDone).toHaveBeenCalledWith(change);
  });

  it('409 STALE: lo dice y pide recargar la agenda', async () => {
    const user = userEvent.setup();
    mockedCancelSeries.mockRejectedValue(
      new ApiError(
        409,
        'Alguna cita de la serie cambió mientras tanto (otra persona la movió, la canceló o la atendió). Vuelve a abrir la serie y repite el cambio.',
        { code: 'APPOINTMENT_SERIES_STALE' },
      ),
    );
    const { onSeriesDone, onSeriesStale } = renderSeries();
    await user.click(screen.getByLabelText(/Esta y las siguientes/));
    await user.click(screen.getByLabelText(/La clínica/));
    await user.click(screen.getByRole('button', { name: 'Cancelar esta y las siguientes' }));
    expect(await screen.findByText(/cambió mientras tanto/)).toBeInTheDocument();
    expect(onSeriesStale).toHaveBeenCalled();
    expect(onSeriesDone).not.toHaveBeenCalled();
  });

  it('sin serie no hay elección', () => {
    renderDialog();
    expect(screen.queryByRole('radiogroup', { name: 'Qué citas cancelar' })).not.toBeInTheDocument();
  });
});
