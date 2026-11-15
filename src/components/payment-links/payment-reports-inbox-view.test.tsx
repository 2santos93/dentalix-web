import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaymentReportsInboxView, paymentReportsInboxCopy as copy } from './payment-reports-inbox-view';
import {
  confirmPaymentReport,
  getPaymentReportProofUrl,
  listPaymentReports,
  rejectPaymentReport,
  type ConfirmedPaymentReport,
  type PaymentReport,
} from '@/lib/payment-links/payment-links-api';
import { listPaymentMethods, type ClinicPaymentMethod } from '@/lib/payments/payment-methods-api';
import { getPaymentReceipt } from '@/lib/payments/payment-receipts-api';
import { getExchangeRates } from '@/lib/exchange/exchange-api';
import { getPlanBalance } from '@/lib/payments/payments-api';
import { ApiError } from '@/lib/api/client';
import { notifyError, notifySuccess } from '@/components/errors/notify';
import { clearSessionStore } from '@/lib/session/session-store';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';

jest.mock('../../lib/payment-links/payment-links-api', () => ({
  ...jest.requireActual('../../lib/payment-links/payment-links-api'),
  listPaymentReports: jest.fn(),
  confirmPaymentReport: jest.fn(),
  rejectPaymentReport: jest.fn(),
  getPaymentReportProofUrl: jest.fn(),
}));
jest.mock('../../lib/payments/payment-methods-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-methods-api'),
  listPaymentMethods: jest.fn(),
}));
jest.mock('../../lib/payments/payment-receipts-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-receipts-api'),
  getPaymentReceipt: jest.fn(),
}));
jest.mock('../../lib/exchange/exchange-api', () => ({
  ...jest.requireActual('../../lib/exchange/exchange-api'),
  getExchangeRates: jest.fn(),
}));
jest.mock('../../lib/payments/payments-api', () => ({
  ...jest.requireActual('../../lib/payments/payments-api'),
  getPlanBalance: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/locations').clinicLocation()]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'USD', name: 'Dólar estadounidense', decimals: 2 },
    { code: 'VES', name: 'Bolívar', decimals: 2 },
  ]),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn(), notifySuccess: jest.fn() }));

const mockedList = listPaymentReports as jest.MockedFunction<typeof listPaymentReports>;
const mockedConfirm = confirmPaymentReport as jest.MockedFunction<typeof confirmPaymentReport>;
const mockedReject = rejectPaymentReport as jest.MockedFunction<typeof rejectPaymentReport>;
const mockedProof = getPaymentReportProofUrl as jest.MockedFunction<typeof getPaymentReportProofUrl>;

function method(over: Partial<ClinicPaymentMethod>): ClinicPaymentMethod {
  return {
    id: 'pm-mobile',
    name: 'Pago móvil',
    kind: 'DIGITAL',
    active: true,
    requiresReference: true,
    proofPolicy: 'OPTIONAL',
    allowInPaymentLink: true,
    legacyMethod: null,
    adjustments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function report(over: Partial<PaymentReport> = {}): PaymentReport {
  return {
    id: 'rep-1',
    status: 'PENDING',
    createdAt: '2026-11-15T14:00:00.000Z',
    patientId: 'pat-1',
    patientName: 'María Pérez',
    locationId: 'loc-1',
    paymentMethodId: 'pm-mobile',
    paymentMethodName: 'Pago móvil',
    amount: 40,
    currency: 'USD',
    reference: '00123456',
    paidOn: '2026-11-15',
    note: null,
    proof: { name: 'captura.png', mime: 'image/png', size: 2048 },
    paymentId: null,
    rejectReason: null,
    decidedById: null,
    decidedAt: null,
    link: {
      id: 'link-1',
      treatmentPlanId: 'plan-1',
      openingBalanceId: null,
      amount: 40,
      currency: 'USD',
      concept: 'INSTALLMENT',
      createdAt: '2026-11-14T14:00:00.000Z',
    },
    ...over,
  };
}

function page(items: PaymentReport[]) {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

function confirmed(): ConfirmedPaymentReport {
  return { reportId: 'rep-1', status: 'CONFIRMED', payment: { id: 'pay-9' } as ConfirmedPaymentReport['payment'] };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearSessionStore();
  mockedList.mockResolvedValue(page([report()]));
  (listPaymentMethods as jest.Mock).mockResolvedValue([method({}), method({ id: 'pm-transfer', name: 'Transferencia', requiresReference: false })]);
  (getPaymentReceipt as jest.Mock).mockResolvedValue(paymentReceiptFixture({ paymentId: 'pay-9' }));
  (getExchangeRates as jest.Mock).mockResolvedValue({ base: 'USD', source: 'AUTOMATIC', rates: { VES: 46 }, rateDate: '2026-11-15' });
  (getPlanBalance as jest.Mock).mockResolvedValue({ balance: 120, paymentsWithoutRate: [], rateProviderTimedOut: false });
});

async function openRowAction(user: ReturnType<typeof userEvent.setup>, action: string) {
  await user.click(await screen.findByRole('button', { name: /^Acciones de pago de María Pérez/ }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
}

describe('PaymentReportsInboxView (DX-569)', () => {
  it('lista los pendientes con paciente, medio, importe, referencia, fecha, comprobante y estado', async () => {
    render(<PaymentReportsInboxView token="tok" />);
    const table = await screen.findByRole('table', { name: copy.tableLabel });
    const row = within(table).getByRole('link', { name: 'María Pérez' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('Pago móvil')).toBeInTheDocument();
    expect(row.textContent?.replace(/\s/g, ' ')).toMatch(/40,00/);
    expect(within(row).getByText('00123456')).toBeInTheDocument();
    expect(within(row).getByText('15/11/2026')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Ver el comprobante de María Pérez' })).toBeInTheDocument();
    expect(within(row).getByText('Por confirmar')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { status: 'PENDING', page: 1, pageSize: 20 });
  });

  it('el filtro por estado vuelve a pedir; «Todos» no manda estado', async () => {
    const user = userEvent.setup();
    render(<PaymentReportsInboxView token="tok" />);
    await screen.findByRole('table', { name: copy.tableLabel });
    await user.click(screen.getByRole('button', { name: 'Rechazados' }));
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith('tok', { status: 'REJECTED', page: 1, pageSize: 20 }));
    await user.click(screen.getByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith('tok', { status: undefined, page: 1, pageSize: 20 }));
  });

  it('vacío y error con reintento', async () => {
    const user = userEvent.setup();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce(page([]));
    render(<PaymentReportsInboxView token="tok" />);
    await user.click(await screen.findByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByText(copy.emptyPending)).toBeInTheDocument();
  });

  it('«Ver» pide la URL firmada del comprobante', async () => {
    const user = userEvent.setup();
    mockedProof.mockResolvedValue({ url: 'https://files/p.png', expiresAt: '2026-11-15T15:05:00.000Z', mime: 'image/png', name: 'captura.png' });
    render(<PaymentReportsInboxView token="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Ver el comprobante de María Pérez' }));
    await waitFor(() => expect(mockedProof).toHaveBeenCalledWith('tok', 'rep-1'));
  });

  it('confirmar sin cambios: diálogo precargado, cuerpo vacío, recibo y recarga', async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();
    mockedConfirm.mockResolvedValue(confirmed());
    render(<PaymentReportsInboxView token="tok" onChanged={onChanged} />);
    await openRowAction(user, 'Confirmar');
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar pago reportado' });
    expect(within(dialog).getByLabelText('Importe recibido')).toHaveValue('40');
    await waitFor(() => expect(within(dialog).getByLabelText('Método')).toHaveValue('pm-mobile'));
    expect(within(dialog).getByLabelText('Referencia (obligatoria)')).toHaveValue('00123456');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar pago' }));
    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledWith('tok', 'rep-1', {}));
    expect(notifySuccess).toHaveBeenCalledWith(copy.confirmed);
    expect(await screen.findByRole('dialog', { name: 'Recibo de caja' })).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it('confirmar con correcciones: solo manda lo que cambió', async () => {
    const user = userEvent.setup();
    mockedConfirm.mockResolvedValue(confirmed());
    render(<PaymentReportsInboxView token="tok" />);
    await openRowAction(user, 'Confirmar');
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar pago reportado' });
    const amount = within(dialog).getByLabelText('Importe recibido');
    await user.clear(amount);
    await user.type(amount, '35');
    await waitFor(() => expect(within(dialog).getByLabelText('Método')).toHaveValue('pm-mobile'));
    await user.selectOptions(within(dialog).getByLabelText('Método'), 'pm-transfer');
    await user.clear(within(dialog).getByLabelText('Referencia'));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar pago' }));
    await waitFor(() =>
      expect(mockedConfirm).toHaveBeenCalledWith('tok', 'rep-1', { amount: 35, paymentMethodId: 'pm-transfer', reference: null }),
    );
  });

  it('referencia repetida (409): pide el motivo y reintenta con él', async () => {
    const user = userEvent.setup();
    mockedConfirm
      .mockRejectedValueOnce(
        new ApiError(409, 'Esta referencia ya se usó con Pago móvil.', { code: 'PAYMENT_REFERENCE_DUPLICATE' }),
      )
      .mockResolvedValueOnce(confirmed());
    render(<PaymentReportsInboxView token="tok" />);
    await openRowAction(user, 'Confirmar');
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar pago reportado' });
    await waitFor(() => expect(within(dialog).getByLabelText('Método')).toHaveValue('pm-mobile'));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar pago' }));
    const reason = await within(dialog).findByLabelText('Motivo para registrarla igualmente');
    await user.type(reason, 'El banco repitió el número');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar igualmente' }));
    await waitFor(() =>
      expect(mockedConfirm).toHaveBeenLastCalledWith('tok', 'rep-1', { duplicateReferenceReason: 'El banco repitió el número' }),
    );
  });

  it('otra moneda: vista previa de la tasa y corrección de la tasa con motivo', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue(page([report({ currency: 'VES', amount: 1840 })]));
    mockedConfirm.mockResolvedValue(confirmed());
    render(<PaymentReportsInboxView token="tok" />);
    await openRowAction(user, 'Confirmar');
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar pago reportado' });
    expect(await within(dialog).findByTestId('rp-rate-preview')).toBeInTheDocument();
    // La casilla sale cuando llegan las tasas del día (la base del par la da la API).
    await user.click(await within(dialog).findByRole('checkbox', { name: /Corregir la tasa de cambio/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar pago' }));
    expect(within(dialog).getByLabelText('Tasa: VES por 1 USD')).toHaveAccessibleDescription(/mayor que 0/);
    await user.type(within(dialog).getByLabelText('Tasa: VES por 1 USD'), '46,5');
    await user.type(within(dialog).getByLabelText('Motivo de la tasa corregida'), 'Tasa del banco');
    await waitFor(() => expect(within(dialog).getByLabelText('Método')).toHaveValue('pm-mobile'));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar pago' }));
    await waitFor(() =>
      expect(mockedConfirm).toHaveBeenCalledWith('tok', 'rep-1', { rateOverride: 46.5, rateOverrideReason: 'Tasa del banco' }),
    );
  });

  it('saldo migrado: la moneda no se cambia y no hay tasa que corregir', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue(
      page([report({ link: { ...report().link, treatmentPlanId: null, openingBalanceId: 'ob-1', concept: 'BALANCE' } })]),
    );
    render(<PaymentReportsInboxView token="tok" />);
    await openRowAction(user, 'Confirmar');
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar pago reportado' });
    expect(within(dialog).getByLabelText('Moneda')).toBeDisabled();
    expect(within(dialog).queryByRole('checkbox', { name: /Corregir la tasa/ })).not.toBeInTheDocument();
  });

  it('ya decidido por otra persona (409): cierra, avisa y recarga', async () => {
    const user = userEvent.setup();
    mockedConfirm.mockRejectedValue(new ApiError(409, 'Ya no está pendiente.', { code: 'PAYMENT_REPORT_NOT_PENDING' }));
    render(<PaymentReportsInboxView token="tok" />);
    await openRowAction(user, 'Confirmar');
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar pago reportado' });
    await waitFor(() => expect(within(dialog).getByLabelText('Método')).toHaveValue('pm-mobile'));
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar pago' }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(copy.stale));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('rechazar: motivo obligatorio y dice si se avisó al paciente', async () => {
    const user = userEvent.setup();
    mockedReject.mockResolvedValue({ report: report({ status: 'REJECTED' }), patientNotified: true });
    render(<PaymentReportsInboxView token="tok" />);
    await openRowAction(user, 'Rechazar');
    const dialog = await screen.findByRole('dialog', { name: '¿Rechazar este pago reportado?' });
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar pago' }));
    expect(within(dialog).getByLabelText('Motivo (interno)')).toHaveAccessibleDescription('Escribe el motivo del rechazo.');
    await user.type(within(dialog).getByLabelText('Motivo (interno)'), 'No llegó al banco');
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar pago' }));
    await waitFor(() => expect(mockedReject).toHaveBeenCalledWith('tok', 'rep-1', 'No llegó al banco'));
    expect(notifySuccess).toHaveBeenCalledWith(copy.rejectedNotified);
  });

  it('un confirmado no ofrece confirmar ni rechazar', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue(page([report({ status: 'CONFIRMED', paymentId: 'pay-9' })]));
    render(<PaymentReportsInboxView token="tok" />);
    await user.click(await screen.findByRole('button', { name: /^Acciones de pago de María Pérez/ }));
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent);
    expect(items).toEqual(['Ver comprobante']);
  });
});
