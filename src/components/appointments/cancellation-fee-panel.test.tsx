import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CancellationFeePanel } from './cancellation-fee-panel';
import {
  chargeCancellationFee,
  getCancellationFee,
  waiveCancellationFee,
  type CancellationFeeView,
} from '../../lib/cancellations/cancellation-fee-api';

jest.mock('../../lib/cancellations/cancellation-fee-api', () => ({
  ...jest.requireActual('../../lib/cancellations/cancellation-fee-api'),
  getCancellationFee: jest.fn(),
  chargeCancellationFee: jest.fn(),
  waiveCancellationFee: jest.fn(),
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
    waiveReason: null,
    policyVersionId: 'v1',
    createdAt: '2026-10-24T10:00:00.000Z',
    createdByName: 'Ana',
  },
});

describe('CancellationFeePanel (DX-291)', () => {
  beforeEach(() => {
    get.mockReset();
    charge.mockReset();
    waive.mockReset();
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
    expect(screen.getByRole('link', { name: 'Cobrar en el estado de cuenta' })).toHaveAttribute(
      'href',
      '/patients/p-1?tab=account-statement',
    );
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
    fireEvent.click(within(dialog).getByRole('button', { name: 'Condonar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/Escribe el motivo/);
    expect(waive).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: '  Hospitalización ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Condonar' }));
    await waitFor(() => expect(waive).toHaveBeenCalledWith('t', 'a-1', 'Hospitalización'));
    expect(await screen.findByText('Motivo: Hospitalización')).toBeInTheDocument();
  });

  it('error al cargar: reintento', async () => {
    get.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(view());
    render(<CancellationFeePanel token="t" appointmentId="a-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /reintentar|cargo sin cargar/i }));
    expect(await screen.findByRole('button', { name: 'Generar cargo' })).toBeInTheDocument();
  });
});
