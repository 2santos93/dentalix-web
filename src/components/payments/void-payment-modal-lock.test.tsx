import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoidPaymentModal } from './void-payment-modal';
import { periodLockCopy } from './period-lock-field';
import { getPeriodLock } from '@/lib/financial-lock/financial-lock-api';

jest.mock('../../lib/financial-lock/financial-lock-api', () => ({
  ...jest.requireActual('../../lib/financial-lock/financial-lock-api'),
  getPeriodLock: jest.fn(),
}));
const mockedLock = getPeriodLock as jest.MockedFunction<typeof getPeriodLock>;

function setup(props: Partial<React.ComponentProps<typeof VoidPaymentModal>> = {}) {
  const onConfirm = jest.fn();
  render(
    <VoidPaymentModal
      open
      onOpenChange={jest.fn()}
      onConfirm={onConfirm}
      submitting={false}
      error={null}
      restrictedToOwnToday={false}
      token="tok"
      paidOn="2026-09-20"
      {...props}
    />,
  );
  return { onConfirm, user: userEvent.setup() };
}

beforeEach(() => mockedLock.mockReset());

describe('DX-091 · anular un abono de un período contable cerrado', () => {
  it('con la exención, el ADMIN indica el motivo de la excepción (obligatorio) y viaja con el de la anulación', async () => {
    mockedLock.mockResolvedValue({ lockedThrough: '2026-09-30', canOverride: true });
    const { onConfirm, user } = setup();
    const lockReason = await screen.findByLabelText(periodLockCopy.voidReasonLabel);
    expect(screen.getByRole('dialog')).toHaveTextContent(/período contable cerrado/);

    await user.type(screen.getByLabelText(/motivo de la anulación/i), 'Cobro duplicado');
    await user.click(screen.getByRole('button', { name: 'Anular abono' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(periodLockCopy.reasonMissing)).toBeInTheDocument();

    await user.type(lockReason, '  Duplicado confirmado con el banco  ');
    await user.click(screen.getByRole('button', { name: 'Anular abono' }));
    expect(onConfirm).toHaveBeenCalledWith('Cobro duplicado', 'Duplicado confirmado con el banco');
  });

  it('sin poder saltarlo, avisa de que ya no se puede anular y no pide el motivo de la excepción', async () => {
    mockedLock.mockResolvedValue({ lockedThrough: '2026-09-30', canOverride: false });
    setup();
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveTextContent(/período contable cerrado: ya no se puede anular/),
    );
    expect(screen.queryByLabelText(periodLockCopy.voidReasonLabel)).toBeNull();
  });

  it('un abono posterior al cierre se anula como siempre', async () => {
    mockedLock.mockResolvedValue({ lockedThrough: '2026-09-30', canOverride: true });
    const { onConfirm, user } = setup({ paidOn: '2026-10-01' });
    await waitFor(() => expect(mockedLock).toHaveBeenCalled());
    await user.type(screen.getByLabelText(/motivo de la anulación/i), 'Cobro duplicado');
    await user.click(screen.getByRole('button', { name: 'Anular abono' }));
    expect(onConfirm).toHaveBeenCalledWith('Cobro duplicado');
    expect(screen.queryByLabelText(periodLockCopy.voidReasonLabel)).toBeNull();
  });

  it('lo que dice la lista (`periodLocked`) gana al día del abono', async () => {
    mockedLock.mockResolvedValue({ lockedThrough: '2026-09-30', canOverride: true });
    setup({ paidOn: '2026-10-05', periodLocked: true });
    expect(await screen.findByLabelText(periodLockCopy.voidReasonLabel)).toBeInTheDocument();
  });
});
