import { render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { PatientSignatureRequestsSection } from './patient-signature-requests-section';
import { ApiError } from '@/lib/api/api-error';
import {
  listSignatureRequests,
  revokeSignatureRequest,
  type SignatureRequest,
} from '@/lib/signature-requests/signature-requests-api';
import { setupUser } from '@/lib/test/user';
import { caracasSede } from '@/lib/test/sede-clock';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() } }));
jest.mock('../../lib/signature-requests/signature-requests-api', () => ({
  ...jest.requireActual('../../lib/signature-requests/signature-requests-api'),
  listSignatureRequests: jest.fn(),
  revokeSignatureRequest: jest.fn(),
  getSignatureRequestOptions: jest.fn(() => new Promise(() => {})),
}));
// Las horas, en el reloj de la sede que envió (Caracas, 12 h), no del navegador.
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest
    .fn()
    .mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').caracasSede({ id: 'loc-1' })]),
}));

const mockedList = listSignatureRequests as jest.MockedFunction<typeof listSignatureRequests>;
const mockedRevoke = revokeSignatureRequest as jest.MockedFunction<typeof revokeSignatureRequest>;

function request(overrides: Partial<SignatureRequest> = {}): SignatureRequest {
  return {
    id: 'sr-1',
    patientId: 'p1',
    locationId: caracasSede({ id: 'loc-1' }).id,
    type: 'CONSENT',
    channel: 'EMAIL',
    templateId: 'tpl-1',
    templateVersion: 2,
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
    countersignedAt: null,
    ...overrides,
  };
}

describe('PatientSignatureRequestsSection (DX-243)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedRevoke.mockReset();
  });

  it('carga con esqueleto, y vacía enseña qué hacer', async () => {
    mockedList.mockResolvedValue([]);
    render(<PatientSignatureRequestsSection token="tok" patientId="p1" clinical />);
    expect(screen.getByRole('status', { name: 'Cargando envíos a firmar' })).toBeInTheDocument();
    expect(
      await screen.findByText('Aún no se ha enviado ningún consentimiento a firmar a distancia.'),
    ).toBeInTheDocument();
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
    render(<PatientSignatureRequestsSection token="tok" patientId="p1" clinical />);
    const list = await screen.findByRole('list', { name: 'Consentimientos enviados a firmar' });
    const [sent, locked, signed, complete] = within(list).getAllByRole('listitem', { name: '' }).filter((li) => li.parentElement === list);
    // 14:00 UTC = 10:00 a. m. en Caracas.
    await waitFor(() => expect(sent).toHaveTextContent(/Enviado el .*10:00.*a\. m\..* a la\*\*\*@example\.com por Recepción Demo/));
    expect(within(sent).getByText('Enviado')).toBeInTheDocument();
    expect(within(sent).getByRole('button', { name: /anular enlace/i })).toBeInTheDocument();
    expect(locked).toHaveTextContent('Bloqueado');
    expect(locked).toHaveTextContent(/tras 5 códigos incorrectos/);
    expect(signed).toHaveTextContent('Firmado por paciente');
    expect(signed).toHaveTextContent('Firma Claudia Navarro, responsable del paciente');
    expect(signed).toHaveTextContent(/desde la IP 203\.0\.113\.7/);
    expect(signed).toHaveTextContent('Falta la firma del profesional');
    expect(within(signed).queryByRole('button', { name: /anular/i })).not.toBeInTheDocument();
    expect(complete).toHaveTextContent('Completo');
    expect(complete).toHaveTextContent(/el profesional firmó/);
  });

  it('anular: actualiza la fila y avisa; un fallo es un toast con reintento', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([request()]);
    mockedRevoke.mockRejectedValueOnce(new ApiError(409, 'Esta solicitud ya está firmada o anulada: no hay nada que anular.'));
    mockedRevoke.mockResolvedValueOnce(request({ status: 'REVOKED', revokedAt: '2026-10-30T15:00:00.000Z' }));
    render(<PatientSignatureRequestsSection token="tok" patientId="p1" clinical={false} />);
    await user.click(await screen.findByRole('button', { name: /anular enlace/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /anular enlace/i }));
    expect(await screen.findByText('Anulado')).toBeInTheDocument();
    expect(mockedRevoke).toHaveBeenLastCalledWith('tok', 'p1', 'sr-1');
    expect(toast.success).toHaveBeenCalledWith('Enlace anulado: ya no sirve.');
  });

  it('error de carga: SectionError con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Se cayó'));
    mockedList.mockResolvedValueOnce([]);
    render(<PatientSignatureRequestsSection token="tok" patientId="p1" clinical />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los envíos a firmar.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByText('Aún no se ha enviado ningún consentimiento a firmar a distancia.'),
    ).toBeInTheDocument();
  });

  it('«Enviar a firmar» abre el modal', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    render(<PatientSignatureRequestsSection token="tok" patientId="p1" clinical />);
    await user.click(await screen.findByRole('button', { name: 'Enviar a firmar' }));
    expect(await screen.findByRole('dialog', { name: 'Enviar a firmar' })).toBeInTheDocument();
  });
});
