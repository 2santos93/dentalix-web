import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordPaymentModal } from './record-payment-modal';
import { ApiError } from '@/lib/api/client';
import { recordOpeningBalancePayment, recordPayment, recordSplitPayment } from '@/lib/payments/payments-api';
import { listBillablePlans, type BillablePlan } from '@/lib/payments/billable-plans-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { uploadSingleFile } from '@/lib/files/upload-single-file';

// DX-389: el comprobante del cobro dentro de «Registrar abono».

jest.mock('../../lib/payments/payments-api', () => ({
  ...jest.requireActual('../../lib/payments/payments-api'),
  recordPayment: jest.fn(),
  recordOpeningBalancePayment: jest.fn(),
  recordSplitPayment: jest.fn(),
  getPlanBalance: jest.fn().mockResolvedValue({
    planCurrency: 'EUR',
    billable: 3000000,
    paid: 1200000,
    balance: 1800000,
    creditMovements: 0,
    paymentsCount: 1,
    paymentsWithoutRate: [],
    allocated: 0,
    unallocated: 0,
    unconvertedPaymentsCount: 0,
    rateProviderTimedOut: false,
    manualPaymentIds: [],
    items: [],
  }),
}));
jest.mock('../../lib/payments/billable-plans-api', () => ({
  ...jest.requireActual('../../lib/payments/billable-plans-api'),
  listBillablePlans: jest.fn(),
}));
jest.mock('../../lib/exchange/exchange-api', () => ({
  getExchangeRates: jest.fn().mockResolvedValue({
    base: 'USD',
    source: 'AUTOMATIC',
    rates: { EUR: 4000 },
  }),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));
jest.mock('../../lib/files/upload-single-file', () => ({
  ...jest.requireActual('../../lib/files/upload-single-file'),
  uploadSingleFile: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'EUR', name: 'Euro', symbol: '€', roundingDigits: 2 },
    {
      code: 'USD',
      name: 'Dólar estadounidense',
      symbol: 'US$',
      roundingDigits: 2,
    },
  ]),
}));
function mockMethod(id: string, name: string, proofPolicy: 'NONE' | 'OPTIONAL' | 'REQUIRED') {
  return {
  id,
  name,
  kind: 'TRANSFER' as const,
  active: true,
  requiresReference: false,
  proofPolicy,
  legacyMethod: null,
  adjustments: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
}
jest.mock('../../lib/payments/payment-methods-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-methods-api'),
  listPaymentMethods: jest
    .fn()
    .mockResolvedValue([
      mockMethod('pm-cash', 'Efectivo', 'NONE'),
      mockMethod('pm-transfer', 'Transferencia', 'OPTIONAL'),
      mockMethod('pm-mobile', 'Pago móvil', 'REQUIRED'),
    ]),
}));

const mockedRecord = recordPayment as jest.MockedFunction<typeof recordPayment>;
const mockedOpening = recordOpeningBalancePayment as jest.MockedFunction<typeof recordOpeningBalancePayment>;
const mockedSplit = recordSplitPayment as jest.MockedFunction<typeof recordSplitPayment>;
const mockedList = listBillablePlans as jest.MockedFunction<typeof listBillablePlans>;
const mockedUpload = uploadSingleFile as jest.MockedFunction<typeof uploadSingleFile>;

const plan: BillablePlan = {
  id: 'plan-eur',
  status: 'ACCEPTED',
  currency: 'EUR',
  createdAt: '2026-08-01T15:00:00.000Z',
  total: 3000000,
  paid: 1200000,
  paidOtherCurrencies: [],
  balance: 1800000,
  hasActivePaymentPlan: false,
  paymentsWithoutRate: [],
  rateProviderTimedOut: false,
};

function saved() {
  return {
    id: 'pay-1',
    tenantId: 't-1',
    treatmentPlanId: 'plan-eur',
    openingBalanceId: null,
    patientId: 'pat-1',
    amount: 150000,
    currency: 'EUR',
    paidAt: '2026-10-01T00:00:00.000Z',
    paidOn: '2026-10-01',
    method: 'TRANSFER' as const,
    paymentMethodId: 'pm-transfer',
    paymentMethodName: 'Transferencia',
    reference: null,
    duplicateReferenceReason: null,
    externalInvoiceNumber: null,
    notes: null,
    splitId: null,
    splitLine: null,
    createdById: 'u-1',
    createdAt: '2026-10-16T12:00:00.000Z',
    updatedAt: '2026-10-16T12:00:00.000Z',
    receiptNumber: 'PRI-000001',
    exchangeRateCurrency: 'EUR',
    frozenRate: null,
    exchangeRateStatus: 'NOT_NEEDED' as const,
    adjustments: [],
    collectedAmount: 150000,
    hasProof: true,
  };
}

const opening = {
  id: 'ob-1',
  currency: 'EUR',
  amount: 200000,
  asOfDate: '2026-08-09',
  asOfDateApproximate: false,
  concept: 'Ortodoncia 2025',
  importBatchId: 'batch-1',
  paid: 0,
  pending: 200000,
};

beforeEach(() => {
  jest.clearAllMocks();
  (listLocations as jest.Mock).mockResolvedValue([clinicLocation()]);
  mockedList.mockResolvedValue([plan]);
  mockedUpload.mockResolvedValue('up-1');
  mockedRecord.mockResolvedValue(saved());
});

async function open(openingBalances: (typeof opening)[] = []) {
  const user = userEvent.setup();
  const onRecorded = jest.fn();
  render(
    <RecordPaymentModal
      open
      onOpenChange={jest.fn()}
      token="tok"
      patientId="pat-1"
      openingBalances={openingBalances}
      onRecorded={onRecorded}
    />,
  );
  const dialog = screen.getByRole('dialog', { name: 'Registrar abono' });
  await within(dialog).findByLabelText('Importe');
  return { user, dialog, onRecorded };
}

async function fill(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, medium: string) {
  await user.type(within(dialog).getByLabelText('Importe'), '150000');
  await user.selectOptions(within(dialog).getByLabelText('Método'), medium);
}

const png = () => new File([new Uint8Array(64)], 'captura.png', { type: 'image/png' });

it('con un medio que no pide comprobante no hay campo', async () => {
  const { user, dialog } = await open();
  await fill(user, dialog, 'Efectivo');
  expect(within(dialog).queryByText(/Comprobante del cobro/)).not.toBeInTheDocument();
});

it('con un medio opcional: se sube al elegirlo, se previsualiza y viaja su proofUploadId', async () => {
  const { user, dialog } = await open();
  await fill(user, dialog, 'Transferencia');
  expect(within(dialog).getByText('Comprobante del cobro (opcional)')).toBeInTheDocument();

  await user.upload(within(dialog).getByLabelText('Comprobante del cobro (opcional)'), png());
  expect(await within(dialog).findByText('Subido')).toBeInTheDocument();
  expect(await within(dialog).findByRole('img', { name: 'Vista previa de captura.png' })).toHaveAttribute(
    'src',
    expect.stringMatching(/^data:image\/png;base64,/),
  );

  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  await waitFor(() => expect(mockedRecord).toHaveBeenCalled());
  expect(mockedRecord.mock.calls[0][2]).toMatchObject({
    paymentMethodId: 'pm-transfer',
    proofUploadId: 'up-1',
  });
});

it('con un medio opcional se registra sin comprobante', async () => {
  const { user, dialog } = await open();
  await fill(user, dialog, 'Transferencia');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  await waitFor(() => expect(mockedRecord).toHaveBeenCalled());
  expect(mockedRecord.mock.calls[0][2]).not.toHaveProperty('proofUploadId');
});

it('con un medio obligatorio: sin comprobante lo dice junto al campo y no llama a la API', async () => {
  const { user, dialog } = await open();
  await fill(user, dialog, 'Pago móvil');
  expect(within(dialog).getByText('Comprobante del cobro (obligatorio)')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  expect(
    await within(dialog).findByText(
      'Este medio de pago exige el comprobante del cobro. Adjúntalo para registrar el abono.',
    ),
  ).toBeInTheDocument();
  expect(mockedRecord).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: /Elegir archivo/ }));
});

it('un archivo que no es imagen ni PDF se rechaza en el navegador, en español', async () => {
  const { dialog } = await open();
  const user = userEvent.setup({ applyAccept: false });
  await user.selectOptions(within(dialog).getByLabelText('Método'), 'Transferencia');
  await user.upload(
    within(dialog).getByLabelText('Comprobante del cobro (opcional)'),
    new File(['x'], 'nota.docx', { type: 'application/msword' })
  );
  expect(
    await within(dialog).findByText(
      'Tipo de archivo no admitido. Sube una imagen JPG, PNG o WebP, una foto HEIC o un PDF.',
    ),
  ).toBeInTheDocument();
  expect(mockedUpload).not.toHaveBeenCalled();
});

it('más de 10 MB se rechaza en el navegador', async () => {
  const { user, dialog } = await open();
  await fill(user, dialog, 'Transferencia');
  await user.upload(
    within(dialog).getByLabelText('Comprobante del cobro (opcional)'),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grande.png', {
      type: 'image/png',
    }),
  );
  expect(await within(dialog).findByText('El comprobante supera el máximo de 10 MB.')).toBeInTheDocument();
});

it('si la subida falla no se registra sin avisar: reintentar o quitar', async () => {
  mockedUpload.mockRejectedValueOnce(new ApiError(503, 'El almacén no responde.'));
  const { user, dialog } = await open();
  await fill(user, dialog, 'Transferencia');
  await user.upload(within(dialog).getByLabelText('Comprobante del cobro (opcional)'), png());
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  expect(
    await within(dialog).findByText('El comprobante no se subió. Reintenta la subida o quítalo.'),
  ).toBeInTheDocument();
  expect(mockedRecord).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: 'Reintentar' }));
  expect(await within(dialog).findByText('Subido')).toBeInTheDocument();
});

it('si la API rechaza el contenido (PAYMENT_PROOF_REJECTED), el campo se vacía y pide otro archivo', async () => {
  mockedRecord.mockRejectedValueOnce(
    new ApiError(400, 'El comprobante debe ser una imagen JPG, PNG o WebP, o un PDF.', {
      code: 'PAYMENT_PROOF_REJECTED',
    }),
  );
  const { user, dialog } = await open();
  await fill(user, dialog, 'Transferencia');
  await user.upload(within(dialog).getByLabelText('Comprobante del cobro (opcional)'), png());
  await within(dialog).findByText('Subido');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  expect(
    await within(dialog).findByText(
      'El comprobante no es una imagen JPG, PNG o WebP ni un PDF válido. Elige otro archivo.',
    ),
  ).toBeInTheDocument();
  expect(within(dialog).queryByText('Subido')).not.toBeInTheDocument();
});

it('cambiar a un medio sin comprobante descarta el archivo elegido', async () => {
  const { user, dialog } = await open();
  await fill(user, dialog, 'Transferencia');
  await user.upload(within(dialog).getByLabelText('Comprobante del cobro (opcional)'), png());
  await within(dialog).findByText('Subido');
  await user.selectOptions(within(dialog).getByLabelText('Método'), 'Efectivo');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  await waitFor(() => expect(mockedRecord).toHaveBeenCalled());
  expect(mockedRecord.mock.calls[0][2]).not.toHaveProperty('proofUploadId');
});

it('el abono a un saldo migrado también lleva el comprobante', async () => {
  mockedOpening.mockResolvedValue({
    ...saved(),
    treatmentPlanId: null,
    openingBalanceId: 'ob-1',
  });
  mockedList.mockResolvedValue([]);
  const { user, dialog } = await open([opening]);
  await fill(user, dialog, 'Pago móvil');
  await user.upload(within(dialog).getByLabelText('Comprobante del cobro (obligatorio)'), png());
  await within(dialog).findByText('Subido');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  await waitFor(() => expect(mockedOpening).toHaveBeenCalled());
  expect(mockedOpening.mock.calls[0][2]).toMatchObject({
    proofUploadId: 'up-1',
  });
});

it('en un cobro dividido, un medio que exige comprobante pide registrarlo como abono suelto', async () => {
  const { user, dialog } = await open();
  await fill(user, dialog, 'Pago móvil');
  await user.click(within(dialog).getByRole('button', { name: /Añadir otra forma de pago/ }));
  // El campo del comprobante desaparece al volverse un cobro dividido.
  expect(within(dialog).queryByText(/Comprobante del cobro/)).not.toBeInTheDocument();
  await user.type(within(dialog).getByLabelText('Importe', { selector: '#rp-line-2-amount' }), '1000');
  await user.selectOptions(document.getElementById('rp-line-2-method') as HTMLSelectElement, 'Efectivo');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  expect(
    await within(dialog).findByText(
      'Este medio exige el comprobante del cobro: regístralo como un abono suelto o elige otro medio.',
    ),
  ).toBeInTheDocument();
  expect(mockedSplit).not.toHaveBeenCalled();
});
