import { render, screen, waitFor } from '@testing-library/react';
import {
  SendPrescriptionCopyModal,
  sendPrescriptionCopyCopy as copy,
} from './send-prescription-copy-modal';
import { sendPrescriptionCopy, type PrescriptionCopySent } from '@/lib/prescriptions/prescription-copy';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/prescriptions/prescription-copy', () => ({
  ...jest.requireActual('../../lib/prescriptions/prescription-copy'),
  sendPrescriptionCopy: jest.fn(),
}));

const send = sendPrescriptionCopy as jest.MockedFunction<typeof sendPrescriptionCopy>;
const URL = 'https://demo.dentalix.app/receta/copia/' + 'A'.repeat(43);
const TEXT = `Hola Ana, le saludamos de Clínica Demo. Aquí tiene la copia de su receta (enlace personal, caduca el 15/12/2026): ${URL}`;

const SENT: PrescriptionCopySent = {
  channel: 'WHATSAPP',
  sentAt: '2026-11-15T15:00:00.000Z',
  expiresAt: '2026-12-15T15:00:00.000Z',
  destinationMasked: '••• 4567',
  recipientKind: 'PATIENT',
  whatsapp: { phone: '584121234567', text: TEXT, url: URL },
};

function renderModal() {
  const onOpenChange = jest.fn();
  render(
    <SendPrescriptionCopyModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      prescriptionId="rx1"
      formatDate={() => '15/12/2026'}
    />,
  );
  return { onOpenChange, user: setupUser() };
}

describe('SendPrescriptionCopyModal (DX-468)', () => {
  beforeEach(() => send.mockReset());

  it('dice que es una copia informativa y elige WhatsApp por defecto', () => {
    renderModal();
    expect(screen.getByText(copy.description)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: copy.whatsapp })).toBeChecked();
    expect(screen.getByText(copy.hintWhatsApp)).toBeInTheDocument();
  });

  it('por WhatsApp: abre wa.me con el mensaje prellenado y deja copiar el enlace', async () => {
    send.mockResolvedValue(SENT);
    const { user } = renderModal();
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(send).toHaveBeenCalledWith('tok', 'rx1', 'WHATSAPP');
    expect(await screen.findByText(copy.readyWhatsAppTitle('••• 4567'))).toBeInTheDocument();
    expect(screen.getByText(copy.expires('15/12/2026'))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(copy.openWhatsApp) })).toHaveAttribute(
      'href',
      `https://wa.me/584121234567?text=${encodeURIComponent(TEXT)}`,
    );
    expect(screen.getByLabelText(copy.linkLabel)).toHaveValue(URL);
  });

  it('por email: confirma a quién (enmascarado) y si va al responsable de un menor', async () => {
    send.mockResolvedValue({
      ...SENT,
      channel: 'EMAIL',
      destinationMasked: 'ca***@correo.com',
      recipientKind: 'RESPONSIBLE',
      whatsapp: null,
    });
    const { user, onOpenChange } = renderModal();
    await user.click(screen.getByRole('radio', { name: copy.email }));
    expect(screen.getByText(copy.hintEmail)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(send).toHaveBeenCalledWith('tok', 'rx1', 'EMAIL');
    expect(await screen.findByText(copy.sentEmailTitle('ca***@correo.com'))).toBeInTheDocument();
    expect(screen.getByText(copy.toResponsible)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: copy.close }).at(-1)!);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('un fallo (p. ej. 422 sin email) se explica en el formulario y se puede reintentar', async () => {
    send.mockRejectedValueOnce(
      new ApiError(422, 'Unprocessable', {
        messages: ['El paciente no tiene email: añádelo en su ficha o envíala por WhatsApp.'],
      }),
    );
    send.mockResolvedValueOnce(SENT);
    const { user } = renderModal();
    await user.click(screen.getByRole('button', { name: copy.submit }));
    expect(
      await screen.findByText('El paciente no tiene email: añádelo en su ficha o envíala por WhatsApp.'),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: copy.submit })[0]);
    expect(await screen.findByText(copy.readyWhatsAppTitle('••• 4567'))).toBeInTheDocument();
  });
});
