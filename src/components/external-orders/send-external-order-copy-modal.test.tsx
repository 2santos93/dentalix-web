import { render, screen, waitFor, within } from '@testing-library/react';
import { SendExternalOrderCopyModal, sendExternalOrderCopyCopy as copy } from './send-external-order-copy-modal';
import { sendExternalOrderCopy, type ExternalOrderCopySent } from '@/lib/external-orders/external-orders-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/external-orders/external-orders-api', () => ({
  ...jest.requireActual('../../lib/external-orders/external-orders-api'),
  sendExternalOrderCopy: jest.fn(),
}));
const send = jest.mocked(sendExternalOrderCopy);

const URL_COPY = `https://demo.dentalix.app/orden/copia/${'A'.repeat(43)}`;
const BASE: ExternalOrderCopySent = {
  channel: 'WHATSAPP',
  sentAt: '2026-11-16T15:00:00.000Z',
  expiresAt: '2026-11-23T15:00:00.000Z',
  destinationMasked: '••• 4567',
  recipientKind: 'PATIENT',
  whatsapp: { phone: '584121234567', text: `Clínica Ávila te envía tu orden: ${URL_COPY}`, url: URL_COPY },
};

function renderModal() {
  render(
    <SendExternalOrderCopyModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      orderId="eo1"
      numberLabel="000007"
      formatDate={() => '23/11/2026'}
    />,
  );
  return screen.getByRole('dialog', { name: copy.title });
}

describe('SendExternalOrderCopyModal (DX-572)', () => {
  beforeEach(() => send.mockReset());

  it('por WhatsApp: «Abrir WhatsApp» y el enlace de un solo uso', async () => {
    const user = setupUser();
    send.mockResolvedValue(BASE);
    const dialog = renderModal();
    expect(dialog).toHaveTextContent('Orden nº 000007');
    await user.click(within(dialog).getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('tok', 'eo1', 'WHATSAPP'));
    expect(await within(dialog).findByText('Enlace listo para ••• 4567')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Abrir WhatsApp/ })).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/584121234567'),
    );
    expect(within(dialog).getByLabelText(copy.linkLabel)).toHaveValue(URL_COPY);
    expect(dialog).toHaveTextContent('El enlace caduca el 23/11/2026.');
  });

  it('por email: confirma a quién (enmascarado) y, en un menor, que va al responsable', async () => {
    const user = setupUser();
    send.mockResolvedValue({ ...BASE, channel: 'EMAIL', whatsapp: null, destinationMasked: 'r•••@correo.com', recipientKind: 'RESPONSIBLE' });
    const dialog = renderModal();
    await user.click(within(dialog).getByRole('radio', { name: 'Email' }));
    await user.click(within(dialog).getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('tok', 'eo1', 'EMAIL'));
    expect(await within(dialog).findByText('Enlace enviado a r•••@correo.com')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Va al responsable del paciente, que es menor de edad.');
  });

  it('un 422 (sin teléfono) sale en el formulario', async () => {
    const user = setupUser();
    send.mockRejectedValue(new ApiError(422, 'El paciente no tiene teléfono.'));
    const dialog = renderModal();
    await user.click(within(dialog).getByRole('button', { name: copy.submit }));
    expect(await within(dialog).findByText('El paciente no tiene teléfono.')).toBeInTheDocument();
  });
});
