import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompletedExitModal } from './completed-exit-modal';
import { updateAppointment } from '@/lib/appointments/appointments-api';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/appointments/appointments-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointments-api'),
  updateAppointment: jest.fn(),
}));
const mockedUpdate = updateAppointment as jest.MockedFunction<typeof updateAppointment>;

function renderModal() {
  const onDone = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <CompletedExitModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      appointmentId="a-1"
      to="CANCELLED"
      onDone={onDone}
    />,
  );
  return { onDone, onOpenChange };
}

const reason = () => screen.getByLabelText('Motivo');
const submit = () => screen.getByRole('button', { name: 'Sacar de «Completada»' });

describe('CompletedExitModal (DX-273)', () => {
  beforeEach(() => mockedUpdate.mockReset());

  it('explica qué pasa con el intervalo y pide el destino', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: '¿Pasar la cita completada a «Cancelada»?' })).toBeInTheDocument();
    expect(screen.getByText(/intervalo mínimo de la visita siguiente/)).toBeInTheDocument();
    expect(screen.getByText('Entre 3 y 500 caracteres.')).toBeInTheDocument();
  });

  it('sin motivo válido no llama a la API y lo dice junto al campo', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(reason(), ' a ');
    await user.click(submit());
    expect(screen.getByText('Escribe el motivo (al menos 3 caracteres).')).toBeInTheDocument();
    expect(reason()).toHaveAttribute('aria-invalid', 'true');
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('envía estado y motivo recortado; devuelve el resultado', async () => {
    const user = userEvent.setup();
    const result = { id: 'a-1', status: 'CANCELLED' } as Awaited<ReturnType<typeof updateAppointment>>;
    mockedUpdate.mockResolvedValue(result);
    const { onDone } = renderModal();
    await user.type(reason(), '  La cirugía no se hizo  ');
    await user.click(submit());
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'a-1', {
      status: 'CANCELLED',
      statusReason: 'La cirugía no se hizo',
    });
    expect(onDone).toHaveBeenCalledWith(result);
  });

  it('si la API lo rechaza, el error en español queda en el modal', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockRejectedValue(
      new ApiError(403, 'Solo el odontólogo o la administración pueden sacar una cita de «Completada».'),
    );
    const { onDone } = renderModal();
    await user.type(reason(), 'Error de recepción');
    await user.click(submit());
    expect(
      await screen.findByText('Solo el odontólogo o la administración pueden sacar una cita de «Completada».'),
    ).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });
});
