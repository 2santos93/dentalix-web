import { render, screen, waitFor, within } from '@testing-library/react';
import { SendCertificateCopyModal, sendCertificateCopyCopy as copy } from './send-certificate-copy-modal';
import { sendCertificateCopy, type CertificateCopySent } from '@/lib/certificates/certificate-copy';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/certificates/certificate-copy', () => ({
  ...jest.requireActual('../../lib/certificates/certificate-copy'),
  sendCertificateCopy: jest.fn(),
}));
const send = sendCertificateCopy as jest.MockedFunction<typeof sendCertificateCopy>;

const URL_COPY = `https://demo.dentalix.app/certificado/copia/${'A'.repeat(43)}`;
const SENT: CertificateCopySent = {
  sentAt: '2026-11-16T15:00:00.000Z',
  expiresAt: '2026-12-16T15:00:00.000Z',
  destinationMasked: '••• 4567',
  recipientKind: 'PATIENT',
  whatsapp: { phone: '584121234567', text: `Clínica Ávila te envía tu certificado: ${URL_COPY}`, url: URL_COPY },
};

function renderModal() {
  render(
    <SendCertificateCopyModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      patientId="p1"
      certificateId="cert1"
      kindLabel="Justificante de asistencia"
      numberLabel="000123"
      formatDate={() => '16/12/2026'}
    />,
  );
  return screen.getByRole('dialog', { name: copy.title });
}

describe('SendCertificateCopyModal (DX-306)', () => {
  beforeEach(() => send.mockReset());

  it('antes de enviar: qué es, aviso del menor y de que el enlace anterior deja de servir', () => {
    const dialog = renderModal();
    expect(dialog).toHaveTextContent('Justificante de asistencia nº 000123');
    expect(dialog).toHaveTextContent(copy.minorNote);
    expect(dialog).toHaveTextContent(copy.resendNote);
    expect(send).not.toHaveBeenCalled();
  });

  it('crea el enlace: «Abrir WhatsApp» a wa.me con el texto y el enlace para copiar', async () => {
    send.mockResolvedValue(SENT);
    const user = setupUser();
    const dialog = renderModal();
    await user.click(within(dialog).getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('tok', 'p1', 'cert1'));
    expect(await within(dialog).findByText('Enlace listo para ••• 4567')).toBeInTheDocument();
    expect(within(dialog).getByText('El enlace caduca el 16/12/2026.')).toBeInTheDocument();
    const wa = within(dialog).getByRole('link', { name: /Abrir WhatsApp/ });
    expect(wa).toHaveAttribute('href', `https://wa.me/584121234567?text=${encodeURIComponent(SENT.whatsapp.text)}`);
    expect(within(dialog).getByLabelText(copy.linkLabel)).toHaveValue(URL_COPY);
    expect(within(dialog).queryByText(copy.toResponsible)).not.toBeInTheDocument();
  });

  it('a un menor: avisa de que va al responsable', async () => {
    send.mockResolvedValue({ ...SENT, recipientKind: 'RESPONSIBLE' });
    const user = setupUser();
    const dialog = renderModal();
    await user.click(within(dialog).getByRole('button', { name: copy.submit }));
    expect(await within(dialog).findByText(copy.toResponsible)).toBeInTheDocument();
  });

  it('el 422 (sin teléfono) va al formulario con reintento', async () => {
    send.mockRejectedValueOnce(new ApiError(422, 'El paciente no tiene un teléfono para WhatsApp.'));
    send.mockResolvedValueOnce(SENT);
    const user = setupUser();
    const dialog = renderModal();
    await user.click(within(dialog).getByRole('button', { name: copy.submit }));
    expect(await within(dialog).findByText('El paciente no tiene un teléfono para WhatsApp.')).toBeInTheDocument();
    const retries = within(dialog).getAllByRole('button', { name: copy.submit });
    await user.click(retries[0]);
    expect(await within(dialog).findByText('Enlace listo para ••• 4567')).toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(2);
  });
});
