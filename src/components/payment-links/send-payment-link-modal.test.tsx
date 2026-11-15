import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SendPaymentLinkModal } from './send-payment-link-modal';
import {
  createPaymentLink,
  listPatientPaymentLinks,
  type CreatedPaymentLink,
  type PatientPaymentLink,
} from '@/lib/payment-links/payment-links-api';
import type { PaymentLinkTargetOption } from '@/lib/payment-links/payment-link-targets';
import { ApiError } from '@/lib/api/client';
import { clearSessionStore } from '@/lib/session/session-store';

jest.mock('../../lib/payment-links/payment-links-api', () => ({
  ...jest.requireActual('../../lib/payment-links/payment-links-api'),
  createPaymentLink: jest.fn(),
  listPatientPaymentLinks: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/locations').clinicLocation()]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn().mockResolvedValue([]) }));

const mockedCreate = createPaymentLink as jest.MockedFunction<typeof createPaymentLink>;
const mockedList = listPatientPaymentLinks as jest.MockedFunction<typeof listPatientPaymentLinks>;

const TARGETS: PaymentLinkTargetOption[] = [
  {
    key: 'plan:plan-1',
    target: { treatmentPlanId: 'plan-1' },
    label: 'Plan del 01/08/2026',
    currency: 'USD',
    suggestedAmount: 40,
    suggestedFrom: 'installment',
  },
  {
    key: 'opening:ob-1',
    target: { openingBalanceId: 'ob-1' },
    label: 'Saldo migrado · Ortodoncia anterior',
    currency: 'VES',
    suggestedAmount: 150000.5,
    suggestedFrom: 'balance',
  },
];

function created(over: Partial<CreatedPaymentLink> = {}): CreatedPaymentLink {
  return {
    id: 'link-1',
    url: 'https://demo.dentalix.app/pago/tok123',
    expiresAt: '2026-11-22T15:00:00.000Z',
    amount: 40,
    currency: 'USD',
    concept: 'INSTALLMENT',
    channel: 'WHATSAPP',
    emailSentTo: null,
    whatsapp: { phone: '584145550101', text: 'Hola, María. Clínica Demo te envía el enlace para reportar tu pago: https://demo.dentalix.app/pago/tok123' },
    revokedPrevious: 0,
    ...over,
  };
}

function link(over: Partial<PatientPaymentLink>): PatientPaymentLink {
  return {
    id: 'l-1',
    treatmentPlanId: 'plan-1',
    openingBalanceId: null,
    locationId: 'loc-1',
    amount: 40,
    currency: 'USD',
    concept: 'INSTALLMENT',
    channel: 'WHATSAPP',
    status: 'LIVE',
    expiresAt: '2026-11-22T15:00:00.000Z',
    createdAt: '2026-11-15T15:00:00.000Z',
    createdById: 'u-1',
    openedAt: null,
    usedAt: null,
    revokedAt: null,
    report: null,
    ...over,
  };
}

function renderModal(initial: { key: string; amount: number } | null = null) {
  return render(
    <SendPaymentLinkModal open onOpenChange={jest.fn()} token="tok" patientId="pat-1" targets={TARGETS} initial={initial} />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  clearSessionStore();
  mockedList.mockResolvedValue([]);
});

describe('SendPaymentLinkModal (DX-569)', () => {
  it('precarga el destino y el importe; al cambiar de destino, su importe y su moneda', async () => {
    const user = userEvent.setup();
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Enviar enlace de pago' });
    expect(within(dialog).getByLabelText('Importe que se pide')).toHaveValue('40');
    expect(within(dialog).getByText(/Precargado con la próxima cuota\. En USD/)).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Qué paga'), 'opening:ob-1');
    expect(within(dialog).getByLabelText('Importe que se pide')).toHaveValue('150000,5');
    expect(within(dialog).getByText(/Precargado con el saldo\. En VES/)).toBeInTheDocument();
  });

  it('desde una cuota: su plan y lo que queda de ella', () => {
    renderModal({ key: 'plan:plan-1', amount: 25 });
    expect(screen.getByLabelText('Importe que se pide')).toHaveValue('25');
  });

  it('por WhatsApp: crea el enlace con la moneda del destino, enseña la URL y abre wa.me', async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(created());
    renderModal();
    await user.click(screen.getByRole('button', { name: 'Crear enlace' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'pat-1', {
        target: { treatmentPlanId: 'plan-1' },
        amount: 40,
        currency: 'USD',
        channel: 'WHATSAPP',
      }),
    );
    const panel = await screen.findByTestId('payment-link-created');
    expect(within(panel).getByLabelText('Enlace de pago')).toHaveValue('https://demo.dentalix.app/pago/tok123');
    expect(within(panel).getByRole('link', { name: /Abrir WhatsApp/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/wa\.me\/584145550101\?text=Hola/),
    );
    expect(screen.queryByRole('button', { name: 'Crear enlace' })).not.toBeInTheDocument();
    // La lista de enlaces se relee tras crear.
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  });

  it('copia la URL al portapapeles', async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mockedCreate.mockResolvedValue(created({ channel: null, whatsapp: null }));
    renderModal();
    await user.click(screen.getByRole('radio', { name: 'Solo copiar el enlace' }));
    await user.click(screen.getByRole('button', { name: 'Crear enlace' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith('tok', 'pat-1', expect.objectContaining({ channel: null })));
    await user.click(await screen.findByRole('button', { name: 'Copiar enlace' }));
    expect(writeText).toHaveBeenCalledWith('https://demo.dentalix.app/pago/tok123');
    expect(await screen.findByText('Enlace copiado')).toBeInTheDocument();
  });

  it('por email: dice a quién se envió y si anuló el anterior', async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(created({ channel: 'EMAIL', whatsapp: null, emailSentTo: 'ma***@correo.com', revokedPrevious: 1 }));
    renderModal();
    await user.click(screen.getByRole('radio', { name: 'Por email' }));
    await user.click(screen.getByRole('button', { name: 'Crear enlace' }));
    expect(await screen.findByText('Enviado a ma***@correo.com.')).toBeInTheDocument();
    expect(screen.getByText('Se anuló el enlace anterior de este mismo destino: ya no sirve.')).toBeInTheDocument();
  });

  it('un importe vacío o 0 no se envía y se dice junto al campo', async () => {
    const user = userEvent.setup();
    renderModal();
    const amount = screen.getByLabelText('Importe que se pide');
    await user.clear(amount);
    await user.click(screen.getByRole('button', { name: 'Crear enlace' }));
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(amount).toHaveAccessibleDescription(/Escribe el importe que se pide/);
    await user.type(amount, '0');
    await user.click(screen.getByRole('button', { name: 'Crear enlace' }));
    expect(amount).toHaveAccessibleDescription(/mayor que 0/);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('un 422 (paciente sin teléfono válido) se ve en el formulario', async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValue(new ApiError(422, 'El paciente no tiene un teléfono válido para WhatsApp.'));
    renderModal();
    await user.click(screen.getByRole('button', { name: 'Crear enlace' }));
    expect(await screen.findByText('El paciente no tiene un teléfono válido para WhatsApp.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear enlace' })).toBeInTheDocument();
  });

  it('lista los enlaces enviados con su estado', async () => {
    mockedList.mockResolvedValue([
      link({ id: 'a', status: 'LIVE' }),
      link({ id: 'b', status: 'USED' }),
      link({ id: 'c', status: 'EXPIRED' }),
      link({ id: 'd', status: 'REVOKED' }),
    ]);
    renderModal();
    const history = await screen.findByRole('region', { name: 'Enlaces enviados' });
    expect(await within(history).findByText('Vigente')).toBeInTheDocument();
    expect(within(history).getByText('Reportado')).toBeInTheDocument();
    expect(within(history).getByText('Vencido')).toBeInTheDocument();
    expect(within(history).getByText('Anulado')).toBeInTheDocument();
  });

  it('si la lista no carga: error en su sitio con reintento', async () => {
    const user = userEvent.setup();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce([]);
    renderModal();
    expect(await screen.findByText('No pudimos cargar los enlaces')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText('Todavía no se le ha enviado ningún enlace de pago.')).toBeInTheDocument();
  });
});
