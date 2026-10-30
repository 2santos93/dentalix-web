import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { VoidCancellationFeeModal, feeConflictCopy, voidFeeCopy } from './fee-reason-modal';
import { ApiError } from '../../lib/api/api-error';
import { voidCancellationFee } from '../../lib/cancellations/cancellation-fee-api';

jest.mock('../../lib/cancellations/cancellation-fee-api', () => ({
  ...jest.requireActual('../../lib/cancellations/cancellation-fee-api'),
  voidCancellationFee: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const voidFee = voidCancellationFee as jest.Mock;

// DX-382: el 409 de «Anular cargo» cuando algún abono del plan aún no tiene
// tasa (el servidor ya no decide con importes en otra moneda). El mensaje del
// servidor llega tal cual al aviso del formulario (escalón 4 de DESIGN.md,
// `InlineError`, role="alert") y el diálogo deja de poder enviarse (DX-343).
const UNCONVERTED = 'Hay abonos sin convertir; registra la tasa del día antes de anular';
const PAID =
  'El cargo ya está cobrado: los abonos de «Cargos administrativos» lo cubren. Anula antes el abono y después el cargo.';

function renderModal() {
  const onDone = jest.fn();
  const onStale = jest.fn();
  const onClose = jest.fn();
  render(
    <VoidCancellationFeeModal
      token="t"
      appointmentId="a-1"
      onClose={onClose}
      onDone={onDone}
      onStale={onStale}
    />,
  );
  const dialog = screen.getByRole('dialog', { name: voidFeeCopy.title });
  const submit = () => {
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: ' Cargo por error ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: voidFeeCopy.action }));
  };
  return { dialog, submit, onDone, onStale, onClose };
}

describe('VoidCancellationFeeModal — 409 del servidor (DX-382)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('con abonos sin convertir, el mensaje del servidor sale legible en el aviso del formulario y no se reenvía', async () => {
    voidFee.mockRejectedValueOnce(new ApiError(409, UNCONVERTED));
    const { dialog, submit, onDone, onStale } = renderModal();
    submit();
    await waitFor(() => expect(voidFee).toHaveBeenCalledWith('t', 'a-1', 'Cargo por error'));
    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(UNCONVERTED);
    // Ni el genérico del modal ni el de 409 tapan el texto del servidor.
    expect(within(dialog).queryByText(voidFeeCopy.error)).not.toBeInTheDocument();
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    // DX-343: sin botón de enviar, el motivo bloqueado y el aviso de por qué.
    expect(within(dialog).queryByRole('button', { name: voidFeeCopy.action })).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Motivo')).toBeDisabled();
    expect(within(dialog).getByRole('status')).toHaveTextContent(feeConflictCopy.notice);
    fireEvent.submit(dialog.querySelector('form')!);
    expect(voidFee).toHaveBeenCalledTimes(1);
  });

  it('el 409 «ya cobrado» también llega con su texto', async () => {
    voidFee.mockRejectedValueOnce(new ApiError(409, PAID));
    const { dialog, submit } = renderModal();
    submit();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(PAID);
  });

  it('un 5xx no enseña el texto del servidor: sale el error del modal', async () => {
    voidFee.mockRejectedValueOnce(new ApiError(500, 'relation "payment_plan_amounts" does not exist'));
    const { dialog, submit, onStale } = renderModal();
    submit();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(voidFeeCopy.error);
    expect(onStale).not.toHaveBeenCalled();
    // Sin conflicto, se puede reintentar.
    expect(within(dialog).getByRole('button', { name: voidFeeCopy.action })).toBeEnabled();
  });
});
