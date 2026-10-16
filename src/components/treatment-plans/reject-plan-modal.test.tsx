import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RejectPlanModal } from './reject-plan-modal';
import { rejectPlan } from '@/lib/treatment-plans/plan-options-api';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/treatment-plans/plan-options-api', () => ({
  rejectPlan: jest.fn(),
}));

const mockedReject = rejectPlan as jest.MockedFunction<typeof rejectPlan>;

function renderModal() {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    onRejected: jest.fn(),
    token: 'tok',
    planId: 'plan-1',
    subject: 'Opción B de Ana Pérez',
  };
  render(<RejectPlanModal {...props} />);
  return props;
}

describe('RejectPlanModal (DX-040)', () => {
  beforeEach(() => mockedReject.mockReset());

  it('ofrece los motivos del catálogo, sin «Aceptó otra opción»', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Marcar como rechazado' })).toBeInTheDocument();
    expect(screen.getByText('Opción B de Ana Pérez')).toBeInTheDocument();
    for (const label of ['Precio', 'Miedo al tratamiento', 'Quiere una segunda opinión', 'Otro']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('radio', { name: 'Aceptó otra opción' })).not.toBeInTheDocument();
  });

  it('sin motivo no envía y lo dice', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: 'Marcar rechazado' }));
    expect(await screen.findByText('Elige el motivo del rechazo.')).toBeInTheDocument();
    expect(mockedReject).not.toHaveBeenCalled();
  });

  it('«Otro» exige la nota', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('radio', { name: 'Otro' }));
    await user.click(screen.getByRole('button', { name: 'Marcar rechazado' }));
    expect(
      await screen.findByText('Con el motivo «Otro» describe en la nota por qué lo rechazó.'),
    ).toBeInTheDocument();
    expect(mockedReject).not.toHaveBeenCalled();
  });

  it('envía motivo y nota recortada, y avisa al padre', async () => {
    const user = userEvent.setup();
    const rejected = { id: 'plan-1', status: 'REJECTED' };
    mockedReject.mockResolvedValue(rejected as never);
    const props = renderModal();
    await user.click(screen.getByRole('radio', { name: 'Precio' }));
    await user.type(screen.getByLabelText('Nota (opcional)'), '  Le pareció caro  ');
    await user.click(screen.getByRole('button', { name: 'Marcar rechazado' }));
    await waitFor(() =>
      expect(mockedReject).toHaveBeenCalledWith('tok', 'plan-1', {
        reason: 'PRICE',
        note: 'Le pareció caro',
      }),
    );
    expect(props.onRejected).toHaveBeenCalledWith(rejected);
  });

  it('un fallo de la API se queda en el modal con su mensaje', async () => {
    const user = userEvent.setup();
    mockedReject.mockRejectedValue(
      new ApiError(409, 'Un plan «Rechazado» no puede pasar a «Rechazado».'),
    );
    const props = renderModal();
    await user.click(screen.getByRole('radio', { name: 'Miedo al tratamiento' }));
    await user.click(screen.getByRole('button', { name: 'Marcar rechazado' }));
    expect(
      await screen.findByText('Un plan «Rechazado» no puede pasar a «Rechazado».'),
    ).toBeInTheDocument();
    expect(props.onRejected).not.toHaveBeenCalled();
  });
});
