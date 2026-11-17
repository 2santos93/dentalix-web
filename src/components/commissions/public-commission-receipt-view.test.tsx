import { render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@/lib/api/client';
import {
  getPublicCommissionReceipt,
  markPublicCommissionReceiptOpened,
  signPublicCommissionReceipt,
  type PublicCommissionReceipt,
} from '@/lib/commissions/commissions-api';
import { setupUser } from '@/lib/test/user';
import { PublicCommissionReceiptView, publicCommissionReceiptCopy as copy } from './public-commission-receipt-view';

jest.mock('../../lib/commissions/commissions-api', () => ({
  ...jest.requireActual('../../lib/commissions/commissions-api'),
  getPublicCommissionReceipt: jest.fn(),
  markPublicCommissionReceiptOpened: jest.fn(),
  signPublicCommissionReceipt: jest.fn(),
  downloadPublicCommissionReceipt: jest.fn(),
}));
// El lienzo de jsdom no dibuja: un botón hace de firma.
jest.mock('../shared/signature-pad', () => ({
  SignaturePad: ({ label, onChange }: { label: string; onChange: (v: string | null) => void }) => (
    <button type="button" onClick={() => onChange('data:image/png;base64,iVBORw0KGgo=')}>
      {label}
    </button>
  ),
}));

function receipt(over: Partial<PublicCommissionReceipt> = {}): PublicCommissionReceipt {
  return {
    status: 'PENDING',
    content: {
      version: 1,
      clinicName: 'Clínica Ávila',
      professionalName: 'Dra. Ximena Rivas',
      settlementId: 's1',
      period: { from: '2026-10-01', to: '2026-10-31' },
      payment: {
        id: 'cp1',
        paidOn: '2026-11-05',
        method: 'TRANSFER',
        reference: 'TRF-8841',
        currency: 'USD',
        amount: 17.5,
        locationName: 'Sede Centro',
      },
      lines: [
        { kind: 'ACCRUAL', patientInitials: 'C. P.', catalogCode: 'END-01', catalogLabel: 'Endodoncia unirradicular', toothNumber: '11', day: '2026-10-06', base: 100, percent: 35, amount: 35 },
        { kind: 'ADJUSTMENT', patientInitials: 'C. P.', catalogCode: 'COR-01', catalogLabel: 'Corona', toothNumber: '11', day: null, base: -50, percent: 35, amount: -17.5 },
      ],
      format: { locale: 'es-VE', hourCycle: 'h12', timeZone: 'America/Caracas' },
    },
    expiresAt: '2026-11-08T14:00:00.000Z',
    signedAt: null,
    signerName: null,
    ...over,
  };
}

describe('Conformidad pública del pago de honorarios (DX-464)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(markPublicCommissionReceiptOpened).mockResolvedValue(undefined);
  });

  it('enseña el recibo con iniciales, avisa de la apertura y firma con nombre, firma y «Recibí conforme»', async () => {
    const user = setupUser();
    jest.mocked(getPublicCommissionReceipt).mockResolvedValue(receipt());
    jest
      .mocked(signPublicCommissionReceipt)
      .mockResolvedValue(receipt({ status: 'SIGNED', signedAt: '2026-11-06T10:00:00.000Z', signerName: 'Ximena Rivas' }));
    render(<PublicCommissionReceiptView linkToken="tok123" />);

    const table = await screen.findByRole('table', { name: copy.linesLabel });
    expect(within(table).getAllByText('C. P.')).toHaveLength(2);
    expect(table).toHaveTextContent('Ajuste: Corona');
    expect(screen.getByTestId('receipt-total')).toHaveTextContent('17,50');
    await waitFor(() => expect(markPublicCommissionReceiptOpened).toHaveBeenCalledWith('tok123'));

    // Sin casilla ni firma: no se envía.
    await user.click(screen.getByRole('button', { name: copy.sign }));
    expect(await screen.findByText(copy.signatureRequired)).toBeInTheDocument();
    expect(screen.getByText(copy.acceptRequired)).toBeInTheDocument();
    expect(signPublicCommissionReceipt).not.toHaveBeenCalled();

    const name = screen.getByRole('textbox', { name: copy.signerName });
    expect(name).toHaveValue('Dra. Ximena Rivas');
    await user.clear(name);
    await user.type(name, 'Ximena Rivas');
    await user.click(screen.getByRole('button', { name: copy.signature }));
    await user.click(screen.getByRole('checkbox', { name: new RegExp(copy.accept) }));
    await user.click(screen.getByRole('button', { name: copy.sign }));

    expect(await screen.findByRole('heading', { name: copy.signedTitle })).toBeInTheDocument();
    expect(signPublicCommissionReceipt).toHaveBeenCalledWith('tok123', {
      signerName: 'Ximena Rivas',
      signature: 'data:image/png;base64,iVBORw0KGgo=',
      accepted: true,
    });
    expect(screen.getByRole('button', { name: copy.downloadSigned })).toBeInTheDocument();
  });

  it('un enlace inválido o caducado: el aviso genérico, sin formulario', async () => {
    jest.mocked(getPublicCommissionReceipt).mockRejectedValue(new ApiError(404, 'Este enlace no es válido o ya caducó.'));
    render(<PublicCommissionReceiptView linkToken="nope" />);
    expect(await screen.findByRole('heading', { level: 1, name: copy.notFoundTitle })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.sign })).not.toBeInTheDocument();
    expect(markPublicCommissionReceiptOpened).not.toHaveBeenCalled();
  });

  it('ya firmado: confirmación y descarga, sin volver a avisar la apertura', async () => {
    jest
      .mocked(getPublicCommissionReceipt)
      .mockResolvedValue(receipt({ status: 'SIGNED', signedAt: '2026-11-06T10:00:00.000Z', signerName: 'Ximena Rivas' }));
    render(<PublicCommissionReceiptView linkToken="tok123" />);
    expect(await screen.findByText(copy.signedMessage('Ximena Rivas'))).toBeInTheDocument();
    expect(markPublicCommissionReceiptOpened).not.toHaveBeenCalled();
  });
});
