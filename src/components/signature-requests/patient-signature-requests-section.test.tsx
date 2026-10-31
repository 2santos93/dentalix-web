import { render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { PatientSignatureRequestsSection } from './patient-signature-requests-section';
import { ApiError } from '@/lib/api/api-error';
import {
  listSignatureRequests,
  retrySignedConsentPdf,
  revokeSignatureRequest,
  type SignatureRequest,
} from '@/lib/signature-requests/signature-requests-api';
import { getPatientDocumentUrl } from '@/lib/patient-documents/patient-documents-api';
import { startDownload } from '@/lib/patient-documents/download';
import { setupUser } from '@/lib/test/user';
import { caracasSede } from '@/lib/test/sede-clock';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() } }));
jest.mock('../../lib/signature-requests/signature-requests-api', () => ({
  ...jest.requireActual('../../lib/signature-requests/signature-requests-api'),
  listSignatureRequests: jest.fn(),
  revokeSignatureRequest: jest.fn(),
  retrySignedConsentPdf: jest.fn(),
  getSignatureRequestOptions: jest.fn(() => new Promise(() => {})),
}));
jest.mock('../../lib/patient-documents/patient-documents-api', () => ({
  ...jest.requireActual('../../lib/patient-documents/patient-documents-api'),
  getPatientDocumentUrl: jest.fn(),
}));
jest.mock('../../lib/patient-documents/download', () => ({ startDownload: jest.fn() }));
// Las horas, en el reloj de la sede que envió (Caracas, 12 h), no del navegador.
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest
    .fn()
    .mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').caracasSede({ id: 'loc-1' })]),
}));

const mockedList = listSignatureRequests as jest.MockedFunction<typeof listSignatureRequests>;
const mockedRevoke = revokeSignatureRequest as jest.MockedFunction<typeof revokeSignatureRequest>;
const mockedRetry = retrySignedConsentPdf as jest.MockedFunction<typeof retrySignedConsentPdf>;
const mockedUrl = getPatientDocumentUrl as jest.MockedFunction<typeof getPatientDocumentUrl>;
const mockedDownload = startDownload as jest.MockedFunction<typeof startDownload>;

function request(overrides: Partial<SignatureRequest> = {}): SignatureRequest {
  return {
    id: 'sr-1',
    patientId: 'p1',
    locationId: caracasSede({ id: 'loc-1' }).id,
    type: 'CONSENT',
    channel: 'EMAIL',
    templateId: 'tpl-1',
    templateVersion: 2,
    treatmentPlanId: null,
    title: 'Consentimiento informado — Exodoncia',
    destinationMasked: 'la***@example.com',
    signerType: 'PATIENT',
    signerName: 'Laura Castro',
    professionalUserId: 'u-dentist',
    professionalName: 'Dra. Laura Gómez',
    status: 'SENT',
    sentAt: '2026-10-30T14:00:00.000Z',
    sentByName: 'Recepción Demo',
    expiresAt: '2026-11-02T14:00:00.000Z',
    openedAt: null,
    verifiedAt: null,
    lockedAt: null,
    failedAttempts: 0,
    signedAt: null,
    revokedAt: null,
    consentId: null,
    signedIpAddress: null,
    budgetAcceptanceId: null,
    countersignedAt: null,
    signedPdfStatus: null,
    signedPdfDocumentId: null,
    ...overrides,
  };
}

/** Un envío completo (DX-422): el PDF firmado en el estado pedido. */
function complete(overrides: Partial<SignatureRequest> = {}): SignatureRequest {
  return request({
    id: 'c',
    status: 'COMPLETE',
    consentId: 'pc-1',
    openedAt: '2026-10-30T15:00:00.000Z',
    verifiedAt: '2026-10-30T15:01:00.000Z',
    signedAt: '2026-10-30T15:05:00.000Z',
    countersignedAt: '2026-10-30T16:00:00.000Z',
    ...overrides,
  });
}

describe('PatientSignatureRequestsSection (DX-243)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedRevoke.mockReset();
  });

  it('carga con esqueleto, y vacía enseña qué hacer (icono y pista de acción)', async () => {
    mockedList.mockResolvedValue([]);
    render(<PatientSignatureRequestsSection token="tok" patientId="p1" userId="u-reception" />);
    expect(screen.getByRole('status', { name: 'Cargando envíos a firmar' })).toBeInTheDocument();
    const empty = await screen.findByTestId('signature-requests-empty');
    expect(empty).toHaveTextContent('Aún no se ha enviado ningún consentimiento a firmar a distancia.');
    expect(empty).toHaveTextContent(/Usa «Enviar a firmar»/);
    expect(empty.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Enviar a firmar' })).toBeInTheDocument();
  });

  it('estados y evidencias con el reloj de la sede: Enviado, Bloqueado, Firmado por paciente, Completo', async () => {
    mockedList.mockResolvedValue([
      request({ id: 'a', status: 'SENT' }),
      request({
        id: 'b',
        status: 'LOCKED',
        openedAt: '2026-10-30T15:00:00.000Z',
        lockedAt: '2026-10-30T15:05:00.000Z',
        failedAttempts: 5,
      }),
      request({
        id: 'c',
        status: 'SIGNED_BY_PATIENT',
        signerType: 'GUARDIAN',
        signerName: 'Claudia Navarro',
        openedAt: '2026-10-30T15:00:00.000Z',
        verifiedAt: '2026-10-30T15:01:00.000Z',
        signedAt: '2026-10-30T15:03:00.000Z',
        signedIpAddress: '203.0.113.7',
        consentId: 'pc-1',
      }),
      request({
        id: 'd',
        status: 'COMPLETE',
        signedAt: '2026-10-30T15:03:00.000Z',
        countersignedAt: '2026-10-30T16:00:00.000Z',
        consentId: 'pc-2',
      }),
    ]);
    render(<PatientSignatureRequestsSection token="tok" patientId="p1" userId="u-reception" />);
    const list = await screen.findByRole('list', { name: 'Consentimientos enviados a firmar' });
    const [sent, locked, signed, complete] = within(list).getAllByRole('listitem', { name: '' }).filter((li) => li.parentElement === list);
    // 14:00 UTC = 10:00 a. m. en Caracas.
    await waitFor(() => expect(sent).toHaveTextContent(/Enviado el .*10:00.*a\. m\..* a la\*\*\*@example\.com por Recepción Demo/));
    expect(within(sent).getByText('Enviado')).toBeInTheDocument();
    expect(within(sent).getByRole('button', { name: /anular enlace/i })).toBeInTheDocument();
    expect(locked).toHaveTextContent('Bloqueado');
    expect(locked).toHaveTextContent(/tras 5 códigos incorrectos/);
    // Firmó la responsable: estado y evidencia lo dicen con su nombre.
    expect(within(signed).getByText('Firmado por responsable')).toBeInTheDocument();
    expect(signed).not.toHaveTextContent(/por el paciente|por paciente/);
    expect(signed).toHaveTextContent('Firma Claudia Navarro, responsable del paciente');
    expect(signed).toHaveTextContent(/Firmado por el responsable \(Claudia Navarro\) el .* desde la IP 203\.0\.113\.7/);
    // A recepción no la manda a una tabla que no ve: firmará el profesional elegido.
    expect(signed).toHaveTextContent('Falta la firma de Dra. Laura Gómez como profesional: la hará en la app.');
    expect(signed).not.toHaveTextContent(/pestaña/);
    expect(within(signed).queryByRole('button', { name: /anular/i })).not.toBeInTheDocument();
    expect(complete).toHaveTextContent('Completo');
    expect(complete).toHaveTextContent(/el profesional firmó/);
  });

  it('insignias: Anulado y Bloqueado se distinguen de Enviado; al profesional elegido le pide su firma', async () => {
    mockedList.mockResolvedValue([
      request({ id: 'a', status: 'SENT' }),
      request({ id: 'b', status: 'REVOKED', revokedAt: '2026-10-30T15:00:00.000Z' }),
      request({ id: 'c', status: 'LOCKED', lockedAt: '2026-10-30T15:05:00.000Z', failedAttempts: 5 }),
      request({ id: 'd', status: 'SIGNED_BY_PATIENT', signedAt: '2026-10-30T15:03:00.000Z', consentId: 'pc-1' }),
    ]);
    render(<PatientSignatureRequestsSection token="tok" patientId="p1" userId="u-dentist" />);
    const sent = await screen.findByText('Enviado');
    expect(screen.getByText('Anulado').className).not.toBe(sent.className);
    expect(screen.getByText('Bloqueado').className).not.toBe(sent.className);
    expect(screen.getByText('Firmado por paciente')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Falta tu firma como profesional: pulsa «Firmar como profesional» en la lista de consentimientos de abajo.',
      ),
    ).toBeInTheDocument();
  });

  it('anular pide confirmación; un fallo se queda en el diálogo con el motivo; al confirmar actualiza la fila', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([request()]);
    mockedRevoke.mockRejectedValueOnce(new ApiError(409, 'Esta solicitud ya está firmada o anulada: no hay nada que anular.'));
    mockedRevoke.mockResolvedValueOnce(request({ status: 'REVOKED', revokedAt: '2026-10-30T15:00:00.000Z' }));
    render(<PatientSignatureRequestsSection token="tok" patientId="p1" userId="u-reception" />);
    await user.click(await screen.findByRole('button', { name: /anular enlace/i }));
    // Cancelar no anula nada.
    let dialog = await screen.findByRole('dialog', { name: '¿Anular el enlace?' });
    expect(dialog).toHaveTextContent('Consentimiento informado — Exodoncia');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(mockedRevoke).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /anular enlace/i }));
    dialog = await screen.findByRole('dialog', { name: '¿Anular el enlace?' });
    await user.click(within(dialog).getByRole('button', { name: 'Anular enlace' }));
    expect(await within(dialog).findByText(/no hay nada que anular/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Anular enlace' }));
    expect(await screen.findByText('Anulado')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Enviar a firmar' })).toHaveFocus();
    expect(mockedRevoke).toHaveBeenLastCalledWith('tok', 'p1', 'sr-1');
    expect(toast.success).toHaveBeenCalledWith('Enlace anulado: ya no sirve.');
  });

  it('error de carga: SectionError con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Se cayó'));
    mockedList.mockResolvedValueOnce([]);
    render(<PatientSignatureRequestsSection token="tok" patientId="p1" userId="u-reception" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los envíos a firmar.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByText('Aún no se ha enviado ningún consentimiento a firmar a distancia.'),
    ).toBeInTheDocument();
  });

  it('«Enviar a firmar» abre el modal', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    render(<PatientSignatureRequestsSection token="tok" patientId="p1" userId="u-reception" />);
    await user.click(await screen.findByRole('button', { name: 'Enviar a firmar' }));
    expect(await screen.findByRole('dialog', { name: 'Enviar a firmar' })).toBeInTheDocument();
  });

  describe('PDF firmado (DX-422)', () => {
    beforeEach(() => {
      mockedRetry.mockReset();
      mockedUrl.mockReset();
      mockedDownload.mockReset();
    });

    it('listo: «Descargar PDF» pide la URL firmada de descarga del documento y la abre', async () => {
      mockedList.mockResolvedValue([complete({ signedPdfStatus: 'READY', signedPdfDocumentId: 'doc-1' })]);
      mockedUrl.mockResolvedValue({ url: 'https://files/x.pdf', expiresAt: '2026-10-30T16:05:00.000Z', disposition: 'attachment' });
      const user = setupUser();
      render(<PatientSignatureRequestsSection token="tok" patientId="p1" userId="u-reception" />);
      const button = await screen.findByRole('button', { name: /Descargar PDF/ });
      expect(button).toHaveAccessibleName('Descargar PDF de Consentimiento informado — Exodoncia');
      expect(screen.getByText('PDF firmado archivado en Documentos del paciente.')).toBeInTheDocument();
      await user.click(button);
      await waitFor(() => expect(mockedDownload).toHaveBeenCalledWith('https://files/x.pdf'));
      expect(mockedUrl).toHaveBeenCalledWith('tok', 'p1', 'doc-1', 'attachment');
    });

    it('si falla la descarga, avisa con un mensaje que dice qué hacer y el botón vuelve a estar disponible', async () => {
      mockedList.mockResolvedValue([complete({ signedPdfStatus: 'READY', signedPdfDocumentId: 'doc-1' })]);
      mockedUrl.mockRejectedValue(new Error('red'));
      const user = setupUser();
      render(<PatientSignatureRequestsSection token="tok" patientId="p1" userId="u-reception" />);
      await user.click(await screen.findByRole('button', { name: /Descargar PDF/ }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'No pudimos descargar el PDF firmado. Intenta de nuevo.',
          expect.anything(),
        ),
      );
      expect(screen.getByRole('button', { name: /Descargar PDF/ })).toBeEnabled();
      expect(mockedDownload).not.toHaveBeenCalled();
    });

    it('generándose: lo dice y no ofrece descargar todavía', async () => {
      mockedList.mockResolvedValue([complete({ signedPdfStatus: 'PENDING' })]);
      render(<PatientSignatureRequestsSection token="tok" patientId="p1" userId="u-reception" />);
      expect(
        await screen.findByText('Generando el PDF firmado: aparecerá aquí y en Documentos del paciente.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Descargar PDF/ })).toBeNull();
    });

    it('si la generación falló, lo muestra y «Reintentar PDF» lo vuelve a encolar', async () => {
      mockedList.mockResolvedValue([complete({ signedPdfStatus: 'FAILED' })]);
      mockedRetry.mockResolvedValue({ status: 'PENDING' });
      const user = setupUser();
      render(<PatientSignatureRequestsSection token="tok" patientId="p1" userId="u-reception" />);
      expect(
        await screen.findByText('No pudimos generar el PDF firmado tras varios intentos.'),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Reintentar PDF/ }));
      expect(mockedRetry).toHaveBeenCalledWith('tok', 'p1', 'pc-1');
      expect(
        await screen.findByText('Generando el PDF firmado: aparecerá aquí y en Documentos del paciente.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Reintentar PDF/ })).toBeNull();
    });

    it('si el reintento falla, avisa con el mensaje de la API y deja reintentar', async () => {
      mockedList.mockResolvedValue([complete({ signedPdfStatus: 'FAILED' })]);
      mockedRetry.mockRejectedValue(new ApiError(409, 'El PDF firmado ya está archivado o se está generando.'));
      const user = setupUser();
      render(<PatientSignatureRequestsSection token="tok" patientId="p1" userId="u-reception" />);
      await user.click(await screen.findByRole('button', { name: /Reintentar PDF/ }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'El PDF firmado ya está archivado o se está generando.',
          expect.anything(),
        ),
      );
      expect(screen.getByRole('button', { name: /Reintentar PDF/ })).toBeEnabled();
    });

    it('sin completar no hay nada del PDF', async () => {
      mockedList.mockResolvedValue([request({ status: 'SIGNED_BY_PATIENT', signedAt: '2026-10-30T15:05:00.000Z' })]);
      render(<PatientSignatureRequestsSection token="tok" patientId="p1" userId="u-reception" />);
      await screen.findByText(/Firmado por el paciente/);
      expect(screen.queryByText(/PDF firmado/)).toBeNull();
      expect(screen.queryByRole('button', { name: /PDF/ })).toBeNull();
    });
  });
});
