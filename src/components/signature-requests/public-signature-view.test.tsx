import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublicSignatureView } from './public-signature-view';
import { ApiError } from '@/lib/api/api-error';
import {
  getPublicSignature,
  getPublicSignatureDocument,
  requestSignatureCode,
  signPublicSignature,
  verifySignatureCode,
  type PublicSignature,
  type PublicSignatureDocument,
} from '@/lib/signature-requests/signature-requests-api';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/signature-requests/signature-requests-api', () => ({
  ...jest.requireActual('../../lib/signature-requests/signature-requests-api'),
  getPublicSignature: jest.fn(),
  requestSignatureCode: jest.fn(),
  verifySignatureCode: jest.fn(),
  getPublicSignatureDocument: jest.fn(),
  signPublicSignature: jest.fn(),
}));

const mockedGet = getPublicSignature as jest.MockedFunction<typeof getPublicSignature>;
const mockedCode = requestSignatureCode as jest.MockedFunction<typeof requestSignatureCode>;
const mockedVerify = verifySignatureCode as jest.MockedFunction<typeof verifySignatureCode>;
const mockedDocument = getPublicSignatureDocument as jest.MockedFunction<typeof getPublicSignatureDocument>;
const mockedSign = signPublicSignature as jest.MockedFunction<typeof signPublicSignature>;

beforeAll(() => {
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        setTransform: jest.fn(),
        clearRect: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        stroke: jest.fn(),
      }) as unknown as CanvasRenderingContext2D,
  );
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:image/png;base64,FIRMA');
  HTMLCanvasElement.prototype.setPointerCapture = jest.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = jest.fn();
});

function draw(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 50, clientY: 30, pointerId: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

const CLINIC = { name: 'Clínica Sonrisas', logoUrl: null, primaryColor: '#0E7490' };
// Sede de Caracas en 12 h: las fechas salen en su zona y su formato.
const LOCATION = { timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' as const };

function view(overrides: Partial<PublicSignature> = {}): PublicSignature {
  return {
    type: 'CONSENT',
    clinic: CLINIC,
    location: LOCATION,
    destinationMasked: 'la***@example.com',
    expiresAt: '2026-11-02T14:00:00.000Z',
    codeSent: false,
    resendAvailableAt: null,
    codeSendsLeft: 5,
    ...overrides,
  };
}

function documentFixture(overrides: Partial<PublicSignatureDocument> = {}): PublicSignatureDocument {
  return {
    type: 'CONSENT',
    title: 'Consentimiento informado — Exodoncia',
    body: 'Yo, Laura Castro, autorizo a Dra. Laura Gómez a realizar la exodoncia del 38.',
    templateVersion: 2,
    signerType: 'PATIENT',
    signerName: 'Laura Castro',
    signerDocumentRequired: false,
    professionalName: 'Dra. Laura Gómez',
    sentAt: '2026-10-30T14:00:00.000Z',
    expiresAt: '2026-11-02T14:00:00.000Z',
    clinic: CLINIC,
    location: LOCATION,
    ...overrides,
  };
}

async function toDocument(user: ReturnType<typeof setupUser>) {
  mockedGet.mockResolvedValue(view());
  mockedCode.mockResolvedValue(view({ codeSent: true, codeSendsLeft: 4, resendAvailableAt: new Date(Date.now() + 60_000).toISOString() }));
  mockedVerify.mockResolvedValue({ sessionToken: 'S'.repeat(43), sessionExpiresAt: '2026-10-30T15:00:00.000Z' });
  render(<PublicSignatureView linkToken="tok" />);
  await user.click(await screen.findByRole('button', { name: 'Enviarme el código' }));
  await user.type(await screen.findByLabelText('Código de 6 dígitos'), '012345');
  await user.click(screen.getByRole('button', { name: 'Ver el documento' }));
}

describe('PublicSignatureView (DX-243)', () => {
  beforeEach(() => {
    [mockedGet, mockedCode, mockedVerify, mockedDocument, mockedSign].forEach((m) => m.mockReset());
  });

  it('carga con esqueleto; antes del código solo dice adónde va y cuándo caduca, en la hora de la sede', async () => {
    mockedGet.mockResolvedValue(view());
    render(<PublicSignatureView linkToken="tok" />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
    expect(
      await screen.findByText('Para ver el documento, te enviaremos un código de 6 dígitos a la***@example.com.'),
    ).toBeInTheDocument();
    // 14:00 UTC = 10:00 a. m. en Caracas.
    expect(screen.getByText(/El enlace caduca el .*2 de noviembre de 2026.*10:00.*a\. m\./)).toBeInTheDocument();
    expect(screen.queryByText(/Exodoncia/)).not.toBeInTheDocument();
  });

  it('código → documento completo → confirmar lectura → firmar con el dedo → copia firmada', async () => {
    const user = setupUser();
    mockedDocument.mockResolvedValue(documentFixture());
    mockedSign.mockResolvedValue({
      ...documentFixture(),
      signerDocument: null,
      signedAt: '2026-10-30T14:30:00.000Z',
      contentHash: 'a'.repeat(64),
    });
    await toDocument(user);
    expect(mockedVerify).toHaveBeenCalledWith('tok', '012345');

    const doc = await screen.findByRole('article', { name: 'Texto del documento' });
    expect(doc).toHaveTextContent('a realizar la exodoncia del 38.');
    expect(mockedDocument).toHaveBeenCalledWith('tok', 'S'.repeat(43));

    // Sin confirmar la lectura ni firmar: dice qué falta.
    await user.click(screen.getByRole('button', { name: 'Firmar' }));
    expect(screen.getByText('Confirma que leíste el documento completo.')).toBeInTheDocument();
    expect(screen.getByText('Firma en el recuadro.')).toBeInTheDocument();
    expect(mockedSign).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: /he leído el documento completo/i }));
    draw(screen.getByRole('img', { name: 'Tu firma' }));
    await user.click(screen.getByRole('button', { name: 'Firmar' }));
    await waitFor(() =>
      expect(mockedSign).toHaveBeenCalledWith('tok', 'S'.repeat(43), {
        signature: 'data:image/png;base64,FIRMA',
        accepted: true,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Documento firmado' })).toBeInTheDocument();
    expect(screen.getByText('a'.repeat(64))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /imprimir o guardar en pdf/i })).toBeInTheDocument();
  });

  it('el responsable sin documento registrado lo escribe antes de firmar', async () => {
    const user = setupUser();
    mockedDocument.mockResolvedValue(
      documentFixture({ signerType: 'GUARDIAN', signerName: 'Claudia Navarro', signerDocumentRequired: true }),
    );
    await toDocument(user);
    expect(await screen.findByText('Firma: Claudia Navarro, como responsable del paciente')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /he leído/i }));
    draw(screen.getByRole('img', { name: 'Tu firma' }));
    await user.click(screen.getByRole('button', { name: 'Firmar' }));
    expect(screen.getByText('Escribe tu documento de identidad.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Tu documento de identidad'), 'C01');
    mockedSign.mockResolvedValue({
      ...documentFixture(),
      signerDocument: 'C01',
      signedAt: '2026-10-30T14:30:00.000Z',
      contentHash: 'b'.repeat(64),
    });
    await user.click(screen.getByRole('button', { name: 'Firmar' }));
    await waitFor(() =>
      expect(mockedSign).toHaveBeenCalledWith('tok', 'S'.repeat(43), expect.objectContaining({ signerDocument: 'C01' })),
    );
  });

  it('código incorrecto: el motivo con los intentos que quedan; el quinto bloquea («Enlace no válido»)', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(view({ codeSent: true }));
    mockedVerify.mockRejectedValueOnce(
      new ApiError(400, 'Código incorrecto. Te quedan 4 intentos.', { code: 'SIGNATURE_CODE_INVALID' }),
    );
    mockedVerify.mockRejectedValueOnce(
      new ApiError(400, 'Código incorrecto. Agotaste los 5 intentos.', { code: 'SIGNATURE_LINK_LOCKED' }),
    );
    render(<PublicSignatureView linkToken="tok" />);
    // Con un código ya enviado va directo a escribirlo.
    const input = await screen.findByLabelText('Código de 6 dígitos');
    await user.type(input, '111111');
    await user.click(screen.getByRole('button', { name: 'Ver el documento' }));
    expect(await screen.findByText('Código incorrecto. Te quedan 4 intentos.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Código de 6 dígitos'), '222222');
    await user.click(screen.getByRole('button', { name: 'Ver el documento' }));
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
    expect(screen.getByText(/se bloqueó por seguridad/)).toBeInTheDocument();
  });

  it('caducado, usado, anulado o inventado (404): «Enlace no válido» sin datos', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'Enlace no válido'));
    render(<PublicSignatureView linkToken="tok" />);
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it('sin conexión: SectionError con reintento', async () => {
    const user = setupUser();
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Se cayó'));
    mockedGet.mockResolvedValueOnce(view());
    render(<PublicSignatureView linkToken="tok" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos abrir el enlace.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: 'Enviarme el código' })).toBeInTheDocument();
  });

  it('si la verificación caducó, vuelve a pedir el código', async () => {
    const user = setupUser();
    mockedDocument.mockRejectedValue(
      new ApiError(403, 'Tu verificación caducó', { code: 'SIGNATURE_SESSION_REQUIRED' }),
    );
    await toDocument(user);
    expect(
      await screen.findByText('Tu verificación caducó. Pide un código nuevo para continuar.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Código de 6 dígitos')).toBeInTheDocument();
  });
});
