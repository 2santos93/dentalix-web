import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinkOfferDialog, linkOfferCopy as copy } from './link-offer-dialog';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import { createLinkOffer, type OpeningCandidate, type OpeningSlot } from '@/lib/appointments/opening-candidates';
import { testAgendaClock } from '@/lib/test/sede-clock';

jest.mock('../../lib/appointments/opening-candidates', () => ({
  ...jest.requireActual('../../lib/appointments/opening-candidates'),
  createLinkOffer: jest.fn(),
}));

const mockedLinkOffer = createLinkOffer as jest.MockedFunction<typeof createLinkOffer>;

const SLOT: OpeningSlot = {
  locationId: 'loc-1',
  providerId: 'drx',
  start: '2031-03-04T10:00:00.000Z',
  end: '2031-03-04T10:30:00.000Z',
};

function candidate(over: Partial<OpeningCandidate> & { patientId: string }): OpeningCandidate {
  return {
    kind: 'WAITLIST',
    patientFirstName: 'Ana',
    patientLastName: 'Ríos',
    phone: '3101234567',
    whatsappPhone: '573101234567',
    whatsappBlocked: false,
    whatsappBlockedReason: null,
    waitlistEntryId: `wl-${over.patientId}`,
    appointmentId: null,
    priority: 'NORMAL',
    durationMinutes: 30,
    appointmentType: null,
    reason: null,
    preferredWindow: null,
    providerId: null,
    currentAppointment: null,
    waitingSince: '2031-02-01T00:00:00.000Z',
    offersToday: 0,
    offeredForSlot: false,
    pendingOfferId: null,
    emailBlockedReason: null,
    linkOfferState: null,
    ...over,
  };
}

const ana = candidate({ patientId: 'p-ana' });
const carla = candidate({ patientId: 'p-carla', patientFirstName: 'Carla', patientLastName: 'Paz' });
const dario = candidate({ patientId: 'p-dario', patientFirstName: 'Darío', patientLastName: 'Sol' });

const offer = (patientId: string, url: string | null = null, whatsappPhone: string | null = null) =>
  ({ id: `o-${patientId}`, patientId, url, whatsappPhone }) as Awaited<ReturnType<typeof createLinkOffer>>;

function renderDialog(candidates: OpeningCandidate[]) {
  const onSent = jest.fn();
  render(
    <LinkOfferDialog
      open
      onOpenChange={jest.fn()}
      token="tok"
      slot={SLOT}
      clock={testAgendaClock()}
      providerName="Dr. X"
      locationName="Sede Centro"
      candidates={candidates}
      onSent={onSent}
    />,
  );
  return { onSent, dialog: screen.getByRole('dialog', { name: copy.title }) };
}

beforeEach(() => jest.clearAllMocks());

describe('LinkOfferDialog: resultados anunciados y reintento (DX-486, FE-102)', () => {
  it('una región role=status ya está montada y anuncia el resumen al terminar', async () => {
    mockedLinkOffer
      .mockResolvedValueOnce(offer('p-ana'))
      .mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')))
      .mockResolvedValueOnce(offer('p-dario'));
    const { dialog, onSent } = renderDialog([ana, carla, dario]);
    // Vacía antes de enviar: así el lector anuncia el cambio.
    const status = within(dialog).getByRole('status');
    expect(status).toBeEmptyDOMElement();

    await userEvent.click(within(dialog).getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(status).toHaveTextContent(copy.summary(2, 3)));
    expect(copy.summary(2, 3)).toMatch(/2 de 3/);
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('«Reintentar con los que fallaron» reenvía solo los fallidos y actualiza el resumen', async () => {
    const user = userEvent.setup();
    mockedLinkOffer
      .mockResolvedValueOnce(offer('p-ana'))
      .mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch')))
      .mockRejectedValueOnce(new ApiError(503, 'Servicio no disponible'));
    const { dialog, onSent } = renderDialog([ana, carla, dario]);
    await user.click(within(dialog).getByRole('button', { name: copy.submit }));
    const retry = await within(dialog).findByRole('button', { name: copy.retryFailed });
    expect(mockedLinkOffer).toHaveBeenCalledTimes(3);
    // «Enviar» desaparece al mostrar el resumen: el foco va a él, no a <body>.
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveFocus());

    mockedLinkOffer.mockResolvedValueOnce(offer('p-carla')).mockResolvedValueOnce(offer('p-dario'));
    await user.click(retry);
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent(copy.summary(3, 3)));
    expect(mockedLinkOffer).toHaveBeenCalledTimes(5);
    const retried = mockedLinkOffer.mock.calls.slice(3).map((call) => call[2].patientId);
    expect(retried).toEqual(['p-carla', 'p-dario']);
    const results = within(dialog).getByTestId('link-offer-results');
    expect(results).toHaveTextContent('Ana Ríos · Correo en camino');
    expect(results).toHaveTextContent('Carla Paz · Correo en camino');
    expect(results).toHaveTextContent('Darío Sol · Correo en camino');
    // Ya no queda nadie por reintentar: el botón se va y el foco no cae al vacío.
    expect(within(dialog).queryByRole('button', { name: copy.retryFailed })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveFocus();
    expect(onSent).toHaveBeenCalledTimes(2);
  });

  it('con un solo destinatario el resumen no habla de «ninguno de los 1»', () => {
    expect(copy.summary(0, 1)).toBe('No se pudo enviar la oferta.');
    expect(copy.summary(1, 1)).toBe('Oferta enviada.');
  });

  it('si todos fallan lo dice, ofrece reintentar y no avisa al panel', async () => {
    mockedLinkOffer.mockRejectedValue(new ApiError(409, 'Ya se le ofrecieron 2 huecos hoy'));
    const { dialog, onSent } = renderDialog([ana, carla]);
    await userEvent.click(within(dialog).getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent(copy.summary(0, 2)));
    expect(within(dialog).getByRole('button', { name: copy.retryFailed })).toBeInTheDocument();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('todo bien a la primera: resumen sin reintento', async () => {
    mockedLinkOffer.mockResolvedValueOnce(offer('p-ana')).mockResolvedValueOnce(offer('p-carla'));
    const { dialog } = renderDialog([ana, carla]);
    await userEvent.click(within(dialog).getByRole('button', { name: copy.submit }));
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent(copy.summary(2, 2)));
    expect(within(dialog).queryByRole('button', { name: copy.retryFailed })).not.toBeInTheDocument();
  });

  it('«Abrir WhatsApp» mide al menos 44 px (min-h-11), no solo en los botones del modal', async () => {
    mockedLinkOffer.mockResolvedValueOnce(offer('p-ana', 'https://demo.dentalix.app/hueco/aaa', '573101234567'));
    const { dialog } = renderDialog([ana]);
    await userEvent.click(within(dialog).getByRole('radio', { name: /WhatsApp/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: copy.submit }));
    const link = await within(dialog).findByRole('link', { name: copy.openWhatsAppFor('Ana Ríos') });
    expect(link).toHaveClass('min-h-11');
  });
});
