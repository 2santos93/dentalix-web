import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublicPaymentLinkView, publicPaymentCopy as copy } from './public-payment-link-view';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import {
  completePublicProofUpload,
  getPublicPaymentLink,
  markPublicPaymentLinkOpened,
  requestPublicProofUpload,
  submitPaymentReport,
  type PublicPaymentLink,
} from '@/lib/payment-links/payment-links-api';
import { REGIONAL_VE } from '@/lib/test/document-regional';

jest.mock('../../lib/payment-links/payment-links-api', () => ({
  ...jest.requireActual('../../lib/payment-links/payment-links-api'),
  getPublicPaymentLink: jest.fn(),
  markPublicPaymentLinkOpened: jest.fn(),
  requestPublicProofUpload: jest.fn(),
  completePublicProofUpload: jest.fn(),
  submitPaymentReport: jest.fn(),
}));
// La subida al almacén: pide el ticket (el contador de la API) y devuelve su id.
jest.mock('../../lib/files/upload-single-file', () => ({
  ...jest.requireActual('../../lib/files/upload-single-file'),
  uploadSingleFile: jest.fn(async (file: File, requestTicket: (r: unknown) => Promise<{ uploadId: string }>) => {
    const ticket = await requestTicket({ name: file.name, size: file.size, sha256: 'x' });
    return ticket.uploadId;
  }),
}));

const mockedGet = getPublicPaymentLink as jest.MockedFunction<typeof getPublicPaymentLink>;
const mockedOpened = markPublicPaymentLinkOpened as jest.MockedFunction<typeof markPublicPaymentLinkOpened>;
const mockedTicket = requestPublicProofUpload as jest.MockedFunction<typeof requestPublicProofUpload>;
const mockedComplete = completePublicProofUpload as jest.MockedFunction<typeof completePublicProofUpload>;
const mockedSubmit = submitPaymentReport as jest.MockedFunction<typeof submitPaymentReport>;

const norm = (t: string | null | undefined) => (t ?? '').replace(/\s/g, ' ');

function fixture(over: Partial<PublicPaymentLink> = {}): PublicPaymentLink {
  return {
    status: 'LIVE',
    clinic: { name: 'Clínica Demo', primaryColor: '#0E7490', logoUrl: null },
    patientFirstName: 'María',
    concept: 'INSTALLMENT',
    conceptLabel: 'Cuota del plan de pagos',
    amount: 40,
    currency: 'USD',
    equivalents: [{ currency: 'VES', amount: 1840 }],
    rateDate: '2026-11-15',
    equivalentsUnavailable: false,
    currencies: ['USD', 'VES'],
    methods: [
      {
        id: 'pm-mobile',
        name: 'Pago móvil',
        requiresReference: true,
        proofPolicy: 'REQUIRED',
        instructions: {
          holderName: 'Clínica Demo C.A.',
          holderId: 'J-12345678-9',
          bankName: 'Banco Demo',
          accountNumber: null,
          phone: '0414-5550101',
          email: null,
          note: 'Indica tu nombre en el concepto.',
        },
      },
      {
        id: 'pm-transfer',
        name: 'Transferencia',
        requiresReference: false,
        proofPolicy: 'NONE',
        instructions: {
          holderName: 'Clínica Demo C.A.',
          holderId: null,
          bankName: 'Banco Demo',
          accountNumber: '0102-0000-11-2233445566',
          phone: null,
          email: null,
          note: null,
        },
      },
    ],
    expiresAt: '2026-11-22T15:00:00.000Z',
    paidOnMin: '2026-11-13',
    paidOnMax: '2026-11-15',
    stagedProof: null,
    proofUploadsLeft: 3,
    regional: REGIONAL_VE,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedOpened.mockResolvedValue(undefined);
});

describe('PublicPaymentLinkView (DX-569)', () => {
  it('pinta la clínica, el saludo, el concepto, el importe y su equivalencia con la tasa del día', async () => {
    mockedGet.mockResolvedValue(fixture());
    render(<PublicPaymentLinkView linkToken="tok" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Reporta tu pago' })).toBeInTheDocument();
    expect(screen.getByText('Clínica Demo')).toBeInTheDocument();
    expect(screen.getByText('Hola, María.')).toBeInTheDocument();
    expect(screen.getByText('Cuota del plan de pagos')).toBeInTheDocument();
    expect(norm(screen.getByTestId('payment-amount').textContent)).toMatch(/40,00/);
    expect(norm(screen.getByTestId('payment-equivalents').textContent)).toMatch(/Equivale a .*1\.840,00 con la tasa del 15\/11\/2026\./);
    await waitFor(() => expect(mockedOpened).toHaveBeenCalledWith('tok'));
  });

  it('sin tasa de hoy: solo la moneda original y el aviso', async () => {
    mockedGet.mockResolvedValue(fixture({ equivalents: [], rateDate: null, equivalentsUnavailable: true }));
    render(<PublicPaymentLinkView linkToken="tok" />);
    expect(await screen.findByText(copy.equivalentsUnavailable)).toBeInTheDocument();
    expect(screen.queryByTestId('payment-equivalents')).not.toBeInTheDocument();
  });

  it('cada dato para pagar con su «Copiar» (la nota se lee, no se copia)', async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mockedGet.mockResolvedValue(fixture());
    render(<PublicPaymentLinkView linkToken="tok" />);
    const mobile = await screen.findByRole('region', { name: 'Pago móvil' });
    expect(within(mobile).getByText('Identificación del titular')).toBeInTheDocument();
    expect(within(mobile).getByText('Indica tu nombre en el concepto.')).toBeInTheDocument();
    expect(within(mobile).getAllByRole('button', { name: /^Copiar/ })).toHaveLength(4);
    await user.click(within(mobile).getByRole('button', { name: 'Copiar teléfono de Pago móvil' }));
    expect(writeText).toHaveBeenCalledWith('0414-5550101');
    expect(await screen.findByText('Teléfono copiado.')).toBeInTheDocument();
  });

  it('404: «Enlace no válido»; 410: «Ya recibimos tu reporte de pago»', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(404, 'Not found'));
    const { unmount } = render(<PublicPaymentLinkView linkToken="tok" />);
    expect(await screen.findByRole('heading', { level: 1, name: copy.invalidTitle })).toBeInTheDocument();
    unmount();
    mockedGet.mockRejectedValueOnce(new ApiError(410, 'Ya recibimos tu reporte de pago.', { code: 'PAYMENT_LINK_USED' }));
    render(<PublicPaymentLinkView linkToken="tok" />);
    expect(await screen.findByRole('heading', { level: 1, name: copy.reportedTitle })).toBeInTheDocument();
    expect(mockedOpened).not.toHaveBeenCalled();
  });

  it('error de red: reintento que vuelve a pedir', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch'))).mockResolvedValueOnce(fixture());
    render(<PublicPaymentLinkView linkToken="tok" />);
    await user.click(await screen.findByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Reporta tu pago' })).toBeInTheDocument();
  });

  it('sin datos: dice qué falta junto a cada campo, lo resume y no envía', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(fixture());
    render(<PublicPaymentLinkView linkToken="tok" />);
    await screen.findByRole('heading', { level: 1, name: 'Reporta tu pago' });
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(screen.getByText(copy.errMethod)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pago móvil' })).toHaveFocus();
    expect(screen.getByText(copy.missing(1))).toBeInTheDocument();
    // Con Pago móvil: la referencia y el comprobante son obligatorios.
    await user.click(screen.getByRole('radio', { name: 'Pago móvil' }));
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(screen.getByLabelText('Referencia del pago (obligatoria)')).toHaveAccessibleDescription(copy.errReference);
    expect(screen.getByText(copy.errProof)).toBeInTheDocument();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  it('el importe se precarga solo en la moneda del enlace', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(fixture());
    render(<PublicPaymentLinkView linkToken="tok" />);
    const amount = await screen.findByLabelText('Importe pagado');
    expect(amount).toHaveValue('40');
    await user.selectOptions(screen.getByLabelText('Moneda'), 'VES');
    expect(amount).toHaveValue('');
    await user.selectOptions(screen.getByLabelText('Moneda'), 'USD');
    expect(amount).toHaveValue('40');
  });

  it('reporta con comprobante: sube, lo deja preparado y envía; pantalla de hecho', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(fixture());
    mockedTicket.mockResolvedValue({ uploadId: 'up-1', target: { url: 'https://files', fields: {} } } as never);
    mockedComplete.mockResolvedValue({ uploadId: 'up-1', name: 'captura.png', mime: 'image/png', size: 2048 });
    mockedSubmit.mockResolvedValue({ status: 'REPORTED', message: 'Recibido' });
    render(<PublicPaymentLinkView linkToken="tok" />);
    await screen.findByRole('heading', { level: 1, name: 'Reporta tu pago' });
    await user.click(screen.getByRole('radio', { name: 'Pago móvil' }));
    expect(screen.getByText(/Puedes subir 3 comprobantes más/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Referencia del pago (obligatoria)'), '00123456');
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'captura.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/Comprobante \(obligatorio\)/), file);
    expect(await screen.findByTestId('proof-staged')).toHaveTextContent('captura.png');
    expect(mockedComplete).toHaveBeenCalledWith('tok', 'up-1');
    expect(screen.getByText(/Puedes subir 2 comprobantes más/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    await waitFor(() =>
      expect(mockedSubmit).toHaveBeenCalledWith('tok', {
        paymentMethodId: 'pm-mobile',
        currency: 'USD',
        amount: 40,
        reference: '00123456',
        paidOn: '2026-11-15',
        proofUploadId: 'up-1',
        note: null,
      }),
    );
    expect(await screen.findByRole('heading', { level: 1, name: copy.doneTitle })).toHaveFocus();
  });

  it('sin comprobante cuando el medio no lo pide, y un comprobante ya preparado se reutiliza', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(
      fixture({ stagedProof: { uploadId: 'up-9', name: 'antes.pdf', mime: 'application/pdf', size: 10 }, proofUploadsLeft: 0 }),
    );
    mockedSubmit.mockResolvedValue({ status: 'REPORTED', message: 'Recibido' });
    render(<PublicPaymentLinkView linkToken="tok" />);
    await screen.findByRole('heading', { level: 1, name: 'Reporta tu pago' });
    await user.click(screen.getByRole('radio', { name: 'Transferencia' }));
    expect(screen.queryByText(/Comprobante/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Pago móvil' }));
    expect(screen.getByTestId('proof-staged')).toHaveTextContent('antes.pdf');
    await user.type(screen.getByLabelText('Referencia del pago (obligatoria)'), 'ABC');
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    await waitFor(() => expect(mockedSubmit).toHaveBeenCalledWith('tok', expect.objectContaining({ proofUploadId: 'up-9' })));
  });

  it('un 400 de la API se resume; un 410 al enviar pasa a «ya recibimos»', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(fixture());
    mockedSubmit
      .mockRejectedValueOnce(new ApiError(400, 'La fecha del pago no puede ser anterior al 13/11/2026.'))
      .mockRejectedValueOnce(new ApiError(410, 'Ya recibimos tu reporte de pago.'));
    render(<PublicPaymentLinkView linkToken="tok" />);
    await screen.findByRole('heading', { level: 1, name: 'Reporta tu pago' });
    await user.click(screen.getByRole('radio', { name: 'Transferencia' }));
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(await screen.findByText('La fecha del pago no puede ser anterior al 13/11/2026.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar reporte' }));
    expect(await screen.findByRole('heading', { level: 1, name: copy.reportedTitle })).toBeInTheDocument();
  });

  it('nada clínico en la página', async () => {
    mockedGet.mockResolvedValue(fixture());
    const { container } = render(<PublicPaymentLinkView linkToken="tok" />);
    await screen.findByRole('heading', { level: 1, name: 'Reporta tu pago' });
    expect(container.textContent).not.toMatch(/tratamiento|diagn|odontolog|alergia/i);
  });
});
