import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CancellationFeePanel } from './cancellation-fee-panel';
import { ApiError } from '../../lib/api/api-error';
import {
  chargeCancellationFee,
  getCancellationFee,
  voidCancellationFee,
  waiveCancellationFee,
  type CancellationFeeView,
} from '../../lib/cancellations/cancellation-fee-api';

jest.mock('../../lib/cancellations/cancellation-fee-api', () => ({
  ...jest.requireActual('../../lib/cancellations/cancellation-fee-api'),
  getCancellationFee: jest.fn(),
  chargeCancellationFee: jest.fn(),
  waiveCancellationFee: jest.fn(),
  voidCancellationFee: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const get = getCancellationFee as jest.Mock;
const charge = chargeCancellationFee as jest.Mock;
const waive = waiveCancellationFee as jest.Mock;
const voidFee = voidCancellationFee as jest.Mock;

function view(over: Partial<CancellationFeeView> = {}): CancellationFeeView {
  return {
    appointmentId: 'a-1',
    patientId: 'p-1',
    eligible: true,
    status: 'NONE',
    chargeBlock: null,
    chargeBlockMessage: null,
    canManage: true,
    communicated: { policyVersionId: 'v1', version: 1, noticeHours: 24, suggestedFee: 50000, currency: 'COP' },
    fee: null,
    ...over,
  };
}

const charged = view({
  status: 'CHARGED',
  chargeBlock: 'ALREADY_CHARGED',
  chargeBlockMessage: 'Esta cita ya tiene su cargo generado.',
  fee: {
    id: 'f-1',
    status: 'CHARGED',
    amount: 40000,
    currency: 'COP',
    planId: 'plan-1',
    planItemId: 'i-1',
    planItemRemoved: false,
    waiveReason: null,
    policyVersionId: 'v1',
    createdAt: '2026-10-24T10:00:00.000Z',
    createdByName: 'Ana',
    itemAmount: 40000,
    itemMismatch: false,
    voidedAt: null,
    voidedByName: null,
    voidReason: null,
  },
});

const voided = view({
  ...charged,
  status: 'VOIDED',
  fee: {
    ...charged.fee!,
    planItemRemoved: true,
    itemAmount: null,
    voidedAt: '2026-10-24T12:00:00.000Z',
    voidedByName: 'Dr. Owner',
    voidReason: 'Cargo generado por error',
  },
});

describe('CancellationFeePanel (DX-291)', () => {
  beforeEach(() => {
    get.mockReset();
    charge.mockReset();
    waive.mockReset();
    voidFee.mockReset();
  });

  it('muestra el importe sugerido y las dos acciones', async () => {
    get.mockResolvedValueOnce(view());
    render(<CancellationFeePanel token="t" appointmentId="a-1" />);
    expect(await screen.findByText(/Importe sugerido: .*50\.000.*versión 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generar cargo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Condonar' })).toBeInTheDocument();
  });

  it('«Generar cargo» no deja subir del sugerido y con menos lo envía', async () => {
    get.mockResolvedValueOnce(view());
    charge.mockResolvedValueOnce(charged);
    render(<CancellationFeePanel token="t" appointmentId="a-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Generar cargo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Generar cargo' });
    const amount = within(dialog).getByLabelText('Importe');
    fireEvent.change(amount, { target: { value: '60000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generar cargo' }));
    expect(await within(dialog).findByText(/no puede superar/i)).toBeInTheDocument();
    expect(charge).not.toHaveBeenCalled();
    expect(amount).toHaveFocus();

    fireEvent.change(amount, { target: { value: '40000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generar cargo' }));
    await waitFor(() => expect(charge).toHaveBeenCalledWith('t', 'a-1', 40000));
    expect(await screen.findByText(/Cargo generado: .*40\.000/)).toBeInTheDocument();
    // DX-343: «Generar cargo» ya no existe; el foco va al encabezado del panel.
    expect(screen.getByRole('heading', { name: /Cargo por inasistencia/ })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Cobrar en el estado de cuenta' })).toHaveAttribute(
      'href',
      '/patients/p-1?tab=account-statement',
    );
  });

  it('si el ítem del cargo se quitó del plan, lo dice y no ofrece cobrarlo', async () => {
    get.mockResolvedValueOnce({ ...charged, fee: { ...charged.fee!, planItemRemoved: true } });
    render(<CancellationFeePanel token="t" appointmentId="a-1" />);
    expect(await screen.findByText(/Cargo anulado: .*40\.000/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cobrar en el estado de cuenta' })).not.toBeInTheDocument();
  });

  it('el importe sugerido se envía sin `amount`', async () => {
    get.mockResolvedValueOnce(view());
    charge.mockResolvedValueOnce(charged);
    render(<CancellationFeePanel token="t" appointmentId="a-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Generar cargo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Generar cargo' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generar cargo' }));
    await waitFor(() => expect(charge).toHaveBeenCalledWith('t', 'a-1', undefined));
  });

  it('un sugerido con céntimos (19,99 USD) se precarga legible y se envía sin `amount`', async () => {
    get.mockResolvedValueOnce(
      view({
        communicated: { policyVersionId: 'v1', version: 1, noticeHours: 24, suggestedFee: 19.99, currency: 'USD' },
      }),
    );
    charge.mockResolvedValueOnce(charged);
    render(<CancellationFeePanel token="t" appointmentId="a-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Generar cargo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Generar cargo' });
    expect(within(dialog).getByLabelText('Importe')).toHaveValue('19,99');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generar cargo' }));
    await waitFor(() => expect(charge).toHaveBeenCalledWith('t', 'a-1', undefined));
    expect(within(dialog).queryByText(/no puede superar/i)).not.toBeInTheDocument();
  });

  it('si otra persona ya lo generó (409), muestra el error y el panel se pone al día', async () => {
    get.mockResolvedValueOnce(view()).mockResolvedValueOnce(charged);
    charge.mockRejectedValueOnce(new ApiError(409, 'Esta cita ya tiene su cargo generado.'));
    render(<CancellationFeePanel token="t" appointmentId="a-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Generar cargo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Generar cargo' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generar cargo' }));
    expect(await within(dialog).findByText('Esta cita ya tiene su cargo generado.')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText(/Cargo generado: .*40\.000/)).toBeInTheDocument();
  });

  it('tras un 409, «Generar cargo» explica el conflicto, no se reenvía y el foco vuelve al panel (DX-343)', async () => {
    get.mockResolvedValueOnce(view()).mockResolvedValueOnce(charged);
    charge.mockRejectedValueOnce(new ApiError(409, 'Esta cita ya tiene su cargo generado.'));
    render(<CancellationFeePanel token="t" appointmentId="a-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Generar cargo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Generar cargo' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generar cargo' }));
    expect(await within(dialog).findByText('Esta cita ya tiene su cargo generado.')).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent(/cambió mientras lo tenías abierto/);
    expect(within(dialog).queryByRole('button', { name: 'Generar cargo' })).not.toBeInTheDocument();
    // El importe era del estado viejo: ya no se edita, y un Enter no reenvía.
    expect(within(dialog).getByLabelText('Importe')).toBeDisabled();
    fireEvent.submit(dialog.querySelector('form')!);
    expect(charge).toHaveBeenCalledTimes(1);
    await screen.findByText(/Cargo generado: .*40\.000/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Cargo por inasistencia/ })).toHaveFocus());
  });

  it('sin política comunicada: explica el bloqueo y no ofrece cobrar', async () => {
    get.mockResolvedValueOnce(
      view({
        chargeBlock: 'NOT_INFORMED',
        chargeBlockMessage: 'No consta que el paciente fuera informado de la política.',
        communicated: null,
      }),
    );
    render(<CancellationFeePanel token="t" appointmentId="a-1" />);
    expect(await screen.findByText('No consta que el paciente fuera informado de la política.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar cargo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Condonar' })).toBeInTheDocument();
  });

  it('recepción sin permiso solo lee', async () => {
    get.mockResolvedValueOnce(view({ canManage: false }));
    render(<CancellationFeePanel token="t" appointmentId="a-1" />);
    expect(await screen.findByText(/Solo un administrador/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('«Condonar» exige motivo y luego muestra la condonación', async () => {
    get.mockResolvedValueOnce(view());
    waive.mockResolvedValueOnce(
      view({
        status: 'WAIVED',
        fee: { ...charged.fee!, status: 'WAIVED', amount: null, currency: null, waiveReason: 'Hospitalización' },
      }),
    );
    render(<CancellationFeePanel token="t" appointmentId="a-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Condonar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Condonar el cargo' });
    expect(within(dialog).getByRole('button', { name: 'Condonar' })).toHaveClass('bg-danger');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Condonar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Escribe el motivo/);
    expect(waive).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: '  Hospitalización ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Condonar' }));
    await waitFor(() => expect(waive).toHaveBeenCalledWith('t', 'a-1', 'Hospitalización'));
    expect(await screen.findByText('Motivo: Hospitalización')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Cargo por inasistencia/ })).toHaveFocus();
  });

  it('error al cargar: reintento', async () => {
    get.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(view());
    render(<CancellationFeePanel token="t" appointmentId="a-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cargo sin cargar');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Generar cargo' })).toBeInTheDocument();
  });

  describe('anular un cargo generado (SEC-050)', () => {
    it('quien puede gestionar el cargo lo anula con motivo y el panel lo dice', async () => {
      get.mockResolvedValueOnce(charged);
      voidFee.mockResolvedValueOnce(voided);
      render(<CancellationFeePanel token="t" appointmentId="a-1" />);
      fireEvent.click(await screen.findByRole('button', { name: 'Anular cargo' }));
      const dialog = await screen.findByRole('dialog', { name: 'Anular el cargo' });
      expect(within(dialog).getByRole('button', { name: 'Anular cargo' })).toHaveClass('bg-danger');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anular cargo' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Escribe el motivo/);
      expect(within(dialog).getByLabelText('Motivo')).toHaveFocus();
      expect(voidFee).not.toHaveBeenCalled();
      fireEvent.change(within(dialog).getByLabelText('Motivo'), {
        target: { value: ' Cargo generado por error ' },
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anular cargo' }));
      await waitFor(() => expect(voidFee).toHaveBeenCalledWith('t', 'a-1', 'Cargo generado por error'));
      expect(await screen.findByText(/Cargo anulado: .*40\.000/)).toBeInTheDocument();
      expect(screen.getByText('Motivo: Cargo generado por error')).toBeInTheDocument();
      expect(screen.getByText('Por Dr. Owner.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /Cargo por inasistencia/ })).toHaveFocus();
      expect(screen.queryByRole('button', { name: 'Anular cargo' })).not.toBeInTheDocument();
    });

    it('sin permiso no se ofrece anular', async () => {
      get.mockResolvedValueOnce({ ...charged, canManage: false });
      render(<CancellationFeePanel token="t" appointmentId="a-1" />);
      expect(await screen.findByText(/Cargo generado: .*40\.000/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Anular cargo' })).not.toBeInTheDocument();
    });

    it('un 409 (ya cobrado) sale en el diálogo y el panel se relee', async () => {
      get.mockResolvedValueOnce(charged).mockResolvedValueOnce(charged);
      voidFee.mockRejectedValueOnce(
        new ApiError(409, 'El cargo ya está cobrado: los abonos de «Cargos administrativos» lo cubren. Anula antes el abono y después el cargo.'),
      );
      render(<CancellationFeePanel token="t" appointmentId="a-1" />);
      fireEvent.click(await screen.findByRole('button', { name: 'Anular cargo' }));
      const dialog = await screen.findByRole('dialog', { name: 'Anular el cargo' });
      fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Error' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anular cargo' }));
      expect(await within(dialog).findByText(/Anula antes el abono/)).toBeInTheDocument();
      await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
      expect(within(dialog).queryByRole('button', { name: 'Anular cargo' })).not.toBeInTheDocument();
      expect(within(dialog).getByLabelText('Motivo')).toBeDisabled();
      fireEvent.submit(dialog.querySelector('form')!);
      expect(voidFee).toHaveBeenCalledTimes(1);
    });

    it('si tras el 409 el cargo ya estaba anulado, al cerrar el foco va al encabezado (DX-343)', async () => {
      get.mockResolvedValueOnce(charged).mockResolvedValueOnce(voided);
      voidFee.mockRejectedValueOnce(new ApiError(409, 'El cargo ya está anulado.'));
      render(<CancellationFeePanel token="t" appointmentId="a-1" />);
      fireEvent.click(await screen.findByRole('button', { name: 'Anular cargo' }));
      const dialog = await screen.findByRole('dialog', { name: 'Anular el cargo' });
      fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Error' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anular cargo' }));
      await within(dialog).findByText('El cargo ya está anulado.');
      expect(await screen.findByText(/Cargo anulado: .*40\.000/)).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.getByRole('heading', { name: /Cargo por inasistencia/ })).toHaveFocus());
    });

    it('cerrar sin actuar devuelve el foco a «Anular cargo»', async () => {
      get.mockResolvedValueOnce(charged);
      render(<CancellationFeePanel token="t" appointmentId="a-1" />);
      const action = await screen.findByRole('button', { name: 'Anular cargo' });
      action.focus();
      fireEvent.click(action);
      const dialog = await screen.findByRole('dialog', { name: 'Anular el cargo' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Anular cargo' })).toHaveFocus());
    });

    it('bloquea reabrir mientras el estado en conflicto se actualiza', async () => {
      let resolveReload!: (value: CancellationFeeView) => void;
      get.mockResolvedValueOnce(charged).mockImplementationOnce(() => new Promise((resolve) => { resolveReload = resolve; }));
      voidFee.mockRejectedValueOnce(new ApiError(409, 'El cargo cambió.'));
      render(<CancellationFeePanel token="t" appointmentId="a-1" />);
      fireEvent.click(await screen.findByRole('button', { name: 'Anular cargo' }));
      const dialog = await screen.findByRole('dialog', { name: 'Anular el cargo' });
      fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Error' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anular cargo' }));
      await within(dialog).findByText('El cargo cambió.');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
      expect(screen.getByRole('button', { name: 'Anular cargo' })).toBeDisabled();
      resolveReload(charged);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Anular cargo' })).toBeEnabled());
    });

    it('un fallo de recarga cierra el diálogo y mantiene bloqueado hasta reintento exitoso', async () => {
      let resolveReload!: (value: CancellationFeeView) => void;
      get.mockResolvedValueOnce(charged).mockRejectedValueOnce(new Error('red')).mockImplementationOnce(() => new Promise((resolve) => { resolveReload = resolve; }));
      voidFee.mockRejectedValueOnce(new ApiError(409, 'El cargo cambió.'));
      render(<CancellationFeePanel token="t" appointmentId="a-1" />);
      fireEvent.click(await screen.findByRole('button', { name: 'Anular cargo' }));
      const dialog = await screen.findByRole('dialog', { name: 'Anular el cargo' });
      fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'Error' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Anular cargo' }));
      await screen.findByText('Cargo sin cargar');
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(screen.queryByRole('dialog', { name: 'Anular el cargo' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Anular cargo' })).toBeDisabled();
      resolveReload(voided);
      expect(await screen.findByText(/Cargo anulado/)).toBeInTheDocument();
    });

    it('avisa si el ítem del plan no cobra lo que dice el cargo', async () => {
      get.mockResolvedValueOnce({ ...charged, fee: { ...charged.fee!, itemAmount: 1, itemMismatch: true } });
      render(<CancellationFeePanel token="t" appointmentId="a-1" />);
      expect(
        await screen.findByText(/El ítem del plan cobra .*1.*, no lo que dice el cargo/),
      ).toBeInTheDocument();
    });
  });
});
