import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordPaymentModal, recordPaymentCopy } from './record-payment-modal';
import { ApiError, NetworkError } from '@/lib/api/client';
import {
  getPlanBalance,
  recordOpeningBalancePayment,
  recordPayment,
  type PlanBalance,
} from '@/lib/payments/payments-api';
import { listBillablePlans, type BillablePlan } from '@/lib/payments/billable-plans-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { getExchangeRates } from '@/lib/exchange/exchange-api';

jest.mock('../../lib/payments/payments-api', () => ({
  recordPayment: jest.fn(),
  recordOpeningBalancePayment: jest.fn(),
  getPlanBalance: jest.fn(),
}));
jest.mock('../../lib/payments/billable-plans-api', () => ({
  ...jest.requireActual('../../lib/payments/billable-plans-api'),
  listBillablePlans: jest.fn(),
}));
jest.mock('../../lib/exchange/exchange-api', () => ({
  getExchangeRates: jest.fn(),
}));
// DX-377: medios de pago activos de la clínica.
jest.mock('../../lib/payments/payment-methods-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-methods-api'),
  listPaymentMethods: jest.fn().mockResolvedValue([
    {
      id: 'pm-transfer',
      name: 'Transferencia',
      kind: 'TRANSFER',
      active: true,
      requiresReference: false,
      legacyMethod: 'TRANSFER',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'pm-mobile',
      name: 'Pago móvil',
      kind: 'DIGITAL',
      active: true,
      requiresReference: true,
      legacyMethod: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$' },
    { code: 'VES', name: 'Bolívar', symbol: 'Bs' },
  ]),
}));

const mockedRecord = recordPayment as jest.MockedFunction<typeof recordPayment>;
const mockedRecordOpening = recordOpeningBalancePayment as jest.MockedFunction<
  typeof recordOpeningBalancePayment
>;
const mockedList = listBillablePlans as jest.MockedFunction<typeof listBillablePlans>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedRates = getExchangeRates as jest.MockedFunction<typeof getExchangeRates>;
const mockedBalance = getPlanBalance as jest.MockedFunction<typeof getPlanBalance>;

/** El saldo del plan USD como lo da `GET /treatment-plans/:id/balance` (abonos convertidos). */
function usdBalance(overrides: Partial<PlanBalance> = {}): PlanBalance {
  return {
    planCurrency: 'USD',
    billable: 500,
    paid: 0,
    balance: 500,
    paymentsCount: 0,
    paymentsWithoutRate: [],
    allocated: 0,
    unallocated: 0,
    unconvertedPaymentsCount: 0,
    manualPaymentIds: [],
    items: [],
    ...overrides,
  };
}

const copPlan: BillablePlan = {
  id: 'plan-cop',
  status: 'ACCEPTED',
  currency: 'COP',
  createdAt: '2026-08-01T15:00:00.000Z',
  total: 3000000,
  paid: 1200000,
  paidOtherCurrencies: [],
  balance: 1800000,
  hasActivePaymentPlan: false,
};
const usdPlan: BillablePlan = {
  ...copPlan,
  id: 'plan-usd',
  currency: 'USD',
  createdAt: '2026-09-10T15:00:00.000Z',
  total: 500,
  paid: 0,
  balance: 500,
};

function money(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

function savedPayment(
  overrides: Partial<Awaited<ReturnType<typeof recordPayment>>> = {},
): Awaited<ReturnType<typeof recordPayment>> {
  return {
    id: 'pay-1',
    tenantId: 't-1',
    treatmentPlanId: 'plan-cop',
    openingBalanceId: null,
    patientId: 'pat-1',
    amount: 150000,
    currency: 'COP',
    paidAt: '2026-10-01T00:00:00.000Z',
    paidOn: '2026-10-01',
    method: 'TRANSFER',
    paymentMethodId: null,
    paymentMethodName: null,
    reference: null,
    duplicateReferenceReason: null,
    notes: null,
    splitId: null,
    splitLine: null,
    createdById: 'u-1',
    createdAt: '2026-10-16T12:00:00.000Z',
    updatedAt: '2026-10-16T12:00:00.000Z',
    receiptNumber: 'PRI-000001',
    exchangeRateCurrency: 'COP',
    frozenRate: null,
    exchangeRateStatus: 'NOT_NEEDED',
    ...overrides,
  };
}

beforeEach(() => {
  mockedRecord.mockReset();
  mockedRecordOpening.mockReset();
  mockedList.mockReset();
  mockedLocations.mockReset();
  mockedLocations.mockResolvedValue([clinicLocation()]);
  mockedRates.mockReset();
  mockedRates.mockResolvedValue({ base: 'USD', source: 'AUTOMATIC', rates: { COP: 4000, VES: 36.5 } });
  mockedBalance.mockReset();
  mockedBalance.mockResolvedValue(usdBalance());
});

const opening = {
  id: 'ob-1',
  currency: 'COP',
  amount: 200000.5,
  asOfDate: '2026-08-09',
  asOfDateApproximate: false,
  concept: 'Ortodoncia 2025',
  importBatchId: 'batch-1',
  paid: 50000.5,
  pending: 150000,
};

function renderModal(openingBalances: (typeof opening)[] = []) {
  const onRecorded = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <RecordPaymentModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      patientId="pat-1"
      openingBalances={openingBalances}
      onRecorded={onRecorded}
    />,
  );
  return { onRecorded, onOpenChange };
}

it('mientras carga los planes lo dice y no deja registrar', async () => {
  mockedList.mockReturnValue(new Promise(() => {}));
  renderModal();
  const dialog = screen.getByRole('dialog', { name: 'Registrar abono' });
  expect(within(dialog).getByRole('status')).toHaveTextContent(/cargando planes/i);
  expect(within(dialog).getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
  expect(mockedList).toHaveBeenCalledWith('tok', 'pat-1');
});

it('propone el primer plan, su moneda y la fecha de hoy, y enseña su saldo', async () => {
  mockedList.mockResolvedValue([copPlan, usdPlan]);
  renderModal();
  const dialog = screen.getByRole('dialog');

  const plan = await within(dialog).findByLabelText('Plan');
  expect(plan).toHaveValue('plan-cop');
  await waitFor(() =>
    expect(within(plan).getAllByRole('option').map((o) => money(o.textContent))).toEqual([
      'Plan del 01/08/2026 · Aceptado · Saldo COP 1.800.000,00',
      'Plan del 10/09/2026 · Aceptado · Saldo USD 500,00',
    ]),
  );
  expect(within(dialog).getByLabelText('Moneda')).toHaveValue('COP');
  expect((within(dialog).getByLabelText('Fecha de pago') as HTMLInputElement).value).toMatch(
    /^\d{4}-\d{2}-\d{2}$/,
  );
  // DX-386: con el formato de la sede y el código ISO, nunca «US$».
  expect(money(dialog.textContent)).toContain(
    'Saldo COP 1.800.000,00 · Total COP 3.000.000,00 · Abonado COP 1.200.000,00',
  );
  // El único «US$» es el nombre de la moneda en su selector.
  expect(document.getElementById('rp-plan-hint')).not.toHaveTextContent('US$');
  expect(within(dialog).getByLabelText('Plan')).not.toHaveTextContent('US$');

  // Cambiar de plan propone la moneda del plan nuevo.
  await userEvent.setup().selectOptions(plan, 'plan-usd');
  expect(within(dialog).getByLabelText('Moneda')).toHaveValue('USD');
});

describe('fecha por defecto en la zona de la sede (DX-097)', () => {
  afterEach(() => jest.useRealTimers());

  const sedeIn = (timeZone: string) => (clinicLocation({
    id: 'loc-1',
    name: 'Sede',
    address: null,
    country: 'CO' as const,
    isActive: true,
    timeZone,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));

  it('a las 20:30 de Bogotá (01:30Z del día siguiente, navegador en UTC) propone el día de la sede', async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-16T01:30:00.000Z'),
      advanceTimers: true,
    });
    mockedLocations.mockResolvedValue([sedeIn('America/Bogota')]);
    mockedList.mockResolvedValue([copPlan]);
    renderModal();
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByLabelText('Plan');
    await waitFor(() =>
      expect((within(dialog).getByLabelText('Fecha de pago') as HTMLInputElement).value).toBe('2026-10-15'),
    );
  });

  it('con la sede en Madrid, el mismo instante ya es el día siguiente', async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-15T22:30:00.000Z'),
      advanceTimers: true,
    });
    mockedLocations.mockResolvedValue([sedeIn('Europe/Madrid')]);
    mockedList.mockResolvedValue([copPlan]);
    renderModal();
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByLabelText('Plan');
    await waitFor(() =>
      expect((within(dialog).getByLabelText('Fecha de pago') as HTMLInputElement).value).toBe('2026-10-16'),
    );
  });
});

it('consumers render SedeConfigError without a zone', async () => {
  mockedLocations.mockResolvedValue([clinicLocation({ timeZone: null })]);
  mockedList.mockResolvedValue([copPlan]);
  renderModal();
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByLabelText('Plan');
  // La fecha no se rellena con «hoy» de otra zona: el campo muestra el fallo y su reintento.
  expect(await within(dialog).findByText('Sin zona de sede')).toBeInTheDocument();
  expect(within(dialog).queryByDisplayValue(/^\d{4}-\d{2}-\d{2}$/)).not.toBeInTheDocument();

  mockedLocations.mockResolvedValue([clinicLocation({ timeZone: 'Asia/Tokyo' })]);
  await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Reintentar' }));
  await waitFor(() =>
    expect((within(dialog).getByLabelText('Fecha de pago') as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2}$/),
  );
});

// DX-375: sin tasa del día la API guarda el abono «sin tasa»; el aviso lo dice
// para que nadie crea que el saldo ya lo cuenta.
it('un abono guardado sin tasa lo dice en el aviso', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue([copPlan]);
  mockedRecord.mockResolvedValue(
    savedPayment({
      amount: 50,
      currency: 'USD',
      exchangeRateStatus: 'MISSING',
    }),
  );
  const { onRecorded } = renderModal();
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByLabelText('Plan');

  await user.type(within(dialog).getByLabelText('Importe'), '50');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

  await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
  expect(onRecorded.mock.calls[0][0]).toMatch(/^Abono registrado: USD\s50,00 · .+\. /);
  expect(onRecorded.mock.calls[0][0]).toContain(recordPaymentCopy.recordedWithoutRate);
});

it('registra el abono contra el plan elegido, con Idempotency-Key, y avisa', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue([copPlan]);
  mockedRecord.mockResolvedValue(savedPayment());
  const { onRecorded } = renderModal();
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByLabelText('Plan');

  await user.type(within(dialog).getByLabelText('Importe'), '150000');
  await user.selectOptions(within(dialog).getByLabelText('Método'), 'Transferencia');
  await user.clear(within(dialog).getByLabelText('Fecha de pago'));
  await user.type(within(dialog).getByLabelText('Fecha de pago'), '2026-10-01');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

  await waitFor(() =>
    expect(mockedRecord).toHaveBeenCalledWith(
      'tok',
      'plan-cop',
      {
        amount: 150000,
        currency: 'COP',
        paidAt: '2026-10-01',
        paymentMethodId: 'pm-transfer',
      },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    ),
  );
  expect(onRecorded).toHaveBeenCalledWith(
    expect.stringMatching(/^Abono registrado: COP\s150\.000,00 · 01\/10\/2026 · Plan del 01\/08\/2026\.$/),
  );
});

it('DX-377: un medio que pide referencia la exige antes de llamar a la API', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue([copPlan]);
  renderModal();
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByLabelText('Plan');
  await user.type(within(dialog).getByLabelText('Importe'), '1000');
  await user.selectOptions(within(dialog).getByLabelText('Método'), 'Pago móvil');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

  expect(await within(dialog).findByText('Este medio de pago pide la referencia del pago.')).toBeInTheDocument();
  expect(mockedRecord).not.toHaveBeenCalled();
});

it('DX-377: referencia repetida (409): avisa, pide motivo y reintenta con él y la misma clave', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue([copPlan]);
  mockedRecord
    .mockRejectedValueOnce(
      new ApiError(409, 'Esta referencia ya se usó con este medio de pago en otro abono de los últimos 90 días.', {
        code: 'PAYMENT_REFERENCE_DUPLICATE',
      }),
    )
    .mockResolvedValueOnce(savedPayment());
  const { onRecorded } = renderModal();
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByLabelText('Plan');
  await user.type(within(dialog).getByLabelText('Importe'), '1000');
  await user.selectOptions(within(dialog).getByLabelText('Método'), 'Pago móvil');
  await user.type(within(dialog).getByLabelText('Referencia (obligatoria)'), ' 0412 555 ');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

  expect(await within(dialog).findByText(/Esta referencia ya se usó/)).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText('Motivo para registrarla igualmente'), 'Dos cuotas, una operación');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar igualmente' }));

  await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
  const [first, second] = mockedRecord.mock.calls;
  expect(first[2]).toEqual(expect.objectContaining({ paymentMethodId: 'pm-mobile', reference: '0412 555' }));
  expect(second[2]).toEqual(
    expect.objectContaining({ reference: '0412 555', duplicateReferenceReason: 'Dos cuotas, una operación' }),
  );
  expect(second[3]).toBe(first[3]);
});

it('DX-395: la referencia que falta marca aria-invalid, describe el error y recibe el foco', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue([copPlan]);
  renderModal();
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByLabelText('Plan');
  await user.type(within(dialog).getByLabelText('Importe'), '1000');
  await user.selectOptions(within(dialog).getByLabelText('Método'), 'Pago móvil');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

  const reference = within(dialog).getByLabelText('Referencia (obligatoria)');
  await waitFor(() => expect(reference).toHaveFocus());
  expect(reference).toHaveAttribute('aria-invalid', 'true');
  expect(reference).toHaveAccessibleDescription('Este medio de pago pide la referencia del pago.');
  // Sin el globo nativo: el mensaje es el propio, y el campo no lleva `required`.
  expect(reference).not.toHaveAttribute('required');
  expect(reference).toHaveAttribute('aria-required', 'true');
});

it('DX-395: una referencia de solo guiones, puntos o espacios cuenta como vacía (la API la rechaza)', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue([copPlan]);
  renderModal();
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByLabelText('Plan');
  await user.type(within(dialog).getByLabelText('Importe'), '1000');
  await user.selectOptions(within(dialog).getByLabelText('Método'), 'Pago móvil');
  const reference = within(dialog).getByLabelText('Referencia (obligatoria)');
  await user.type(reference, ' -. – ');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

  await waitFor(() => expect(reference).toHaveFocus());
  expect(reference).toHaveAttribute('aria-invalid', 'true');
  expect(reference).toHaveAccessibleDescription('Este medio de pago pide la referencia del pago.');
  expect(mockedRecord).not.toHaveBeenCalled();
});

it('DX-395: el aviso de repetida lleva el foco al motivo; sin motivo, el campo lo dice', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue([copPlan]);
  mockedRecord.mockRejectedValueOnce(
    new ApiError(409, 'Esta referencia ya se usó con este medio de pago en otro abono de los últimos 90 días.', {
      code: 'PAYMENT_REFERENCE_DUPLICATE',
    }),
  );
  renderModal();
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByLabelText('Plan');
  await user.type(within(dialog).getByLabelText('Importe'), '1000');
  await user.selectOptions(within(dialog).getByLabelText('Método'), 'Pago móvil');
  await user.type(within(dialog).getByLabelText('Referencia (obligatoria)'), '123-456');
  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));

  const reason = await within(dialog).findByLabelText('Motivo para registrarla igualmente');
  await waitFor(() => expect(reason).toHaveFocus());
  expect(reason).not.toHaveAttribute('required');
  expect(reason).toHaveAccessibleDescription('Queda guardado con el abono y en la auditoría.');

  // Se aleja el foco y se intenta sin motivo: error en el campo y foco de vuelta.
  await user.click(within(dialog).getByLabelText('Importe'));
  await user.click(within(dialog).getByRole('button', { name: 'Registrar igualmente' }));
  await waitFor(() => expect(reason).toHaveFocus());
  expect(reason).toHaveAttribute('aria-invalid', 'true');
  expect(reason).toHaveAccessibleDescription('Escribe el motivo para registrar la referencia repetida.');
  expect(mockedRecord).toHaveBeenCalledTimes(1);

  // Escribirlo retira el error.
  await user.type(reason, 'Dos cuotas');
  expect(reason).not.toHaveAttribute('aria-invalid');
});

it('DX-395: a 390 px los controles y la X del modal miden al menos 44 px', async () => {
  mockedList.mockResolvedValue([copPlan]);
  renderModal();
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByLabelText('Plan');
  // jsdom no mide: se comprueba que llevan la altura táctil por debajo de sm.
  expect(dialog.className).toContain('max-sm:[&_input:not([type=checkbox]):not([type=radio])]:h-11');
  expect(dialog.className).toContain('max-sm:[&_select]:h-11');
  expect(dialog.className).toContain('max-sm:[&_button]:min-h-11');
  expect(within(dialog).getByRole('button', { name: 'Cerrar' }).className).toContain('max-sm:size-11');
});

it('valida el importe en español sin llamar a la API', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue([copPlan]);
  renderModal();
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByLabelText('Plan');

  await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Escribe un importe mayor que 0.',
  );
  expect(mockedRecord).not.toHaveBeenCalled();
});

it('si falla, lo dice en español y el reintento reusa la misma Idempotency-Key', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue([copPlan]);
  mockedRecord
    .mockRejectedValueOnce(new ApiError(500, 'Internal server error'))
    .mockRejectedValueOnce(new ApiError(403, 'Insufficient role'));
  const { onRecorded } = renderModal();
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByLabelText('Plan');
  await user.type(within(dialog).getByLabelText('Importe'), '1000');

  const submit = within(dialog).getByRole('button', {
    name: 'Registrar abono',
  });
  await user.click(submit);
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    /no pudimos registrar el abono/i,
  );
  await user.click(submit);
  expect(await within(dialog).findByText(/tu rol no puede registrar abonos/i)).toBeInTheDocument();
  expect(dialog).not.toHaveTextContent(/insufficient|internal/i);

  const [first, second] = mockedRecord.mock.calls;
  expect(second[3]).toBe(first[3]);
  expect(onRecorded).not.toHaveBeenCalled();
});

it('paciente sin planes cobrables: mensaje claro y sin botón activo', async () => {
  mockedList.mockResolvedValue([]);
  renderModal();
  const dialog = screen.getByRole('dialog');
  expect(
    await within(dialog).findByText('Este paciente no tiene planes por cobrar.'),
  ).toBeInTheDocument();
  expect(within(dialog).getByText(/procedimientos aceptados/i)).toBeInTheDocument();
  expect(within(dialog).queryByLabelText('Importe')).not.toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
});

it('si no cargan los planes, el selector se sustituye por un error con reintento', async () => {
  const user = userEvent.setup();
  mockedList.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([copPlan]);
  renderModal();
  const dialog = screen.getByRole('dialog');

  const failed = await within(dialog).findByText('No cargaron los planes');
  expect(within(dialog).getByRole('button', { name: 'Registrar abono' })).toBeDisabled();
  await user.click(within(failed.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Reintentar' }));

  expect(await within(dialog).findByLabelText('Plan')).toHaveValue('plan-cop');
  expect(mockedList).toHaveBeenCalledTimes(2);
});

it('con varias sedes dice en cuál quedará registrado el abono', async () => {
  window.localStorage.setItem('dentalix.activeLocationId', 'loc-2');
  mockedLocations.mockResolvedValue([
    clinicLocation({ id: 'loc-1', name: 'Sede principal' }),
    clinicLocation({ id: 'loc-2', name: 'Sede Norte' }),
  ]);
  mockedList.mockResolvedValue([copPlan]);
  renderModal();
  expect(
    await screen.findByText('Este abono quedará registrado en la sede Sede Norte.'),
  ).toBeInTheDocument();
  window.localStorage.clear();
});

it('el aviso dice lo que la API registró, no lo que quedó en el formulario (reintento deduplicado)', async () => {
  // El primer envío se guardó pero la respuesta se perdió; la persona cambia
  // plan e importe y reintenta con la MISMA clave: la API devuelve el abono
  // original. El aviso no puede anunciar un cobro que no existe.
  const user = userEvent.setup();
  mockedList.mockResolvedValue([copPlan, usdPlan]);
  mockedRecord
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(savedPayment({ amount: 1000, method: null }));
  const { onRecorded } = renderModal();
  const dialog = screen.getByRole('dialog');
  const plan = await within(dialog).findByLabelText('Plan');
  await user.type(within(dialog).getByLabelText('Importe'), '1000');
  await user.clear(within(dialog).getByLabelText('Fecha de pago'));
  await user.type(within(dialog).getByLabelText('Fecha de pago'), '2026-10-01');
  const submit = within(dialog).getByRole('button', {
    name: 'Registrar abono',
  });
  await user.click(submit);
  await within(dialog).findByRole('alert');

  await user.selectOptions(plan, 'plan-usd');
  await user.clear(within(dialog).getByLabelText('Importe'));
  await user.type(within(dialog).getByLabelText('Importe'), '2000');
  await user.click(submit);

  await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
  expect(onRecorded).toHaveBeenCalledWith(
    expect.stringMatching(/^Abono registrado: COP\s1\.?000,00 · 01\/10\/2026 · Plan del 01\/08\/2026\.$/),
  );
});

describe('DX-262: abono contra el saldo migrado', () => {
  it('ofrece el saldo migrado con su pendiente como destino y abona contra él, en su moneda', async () => {
    mockedList.mockResolvedValue([copPlan]);
    mockedRecordOpening.mockResolvedValue(
      savedPayment({
        treatmentPlanId: null,
        openingBalanceId: 'ob-1',
        amount: 100000,
      }),
    );
    const user = userEvent.setup();
    const { onRecorded } = renderModal([opening, { ...opening, id: 'ob-paid', pending: 0 }]);
    const dialog = screen.getByRole('dialog');
    const target = await within(dialog).findByLabelText('Abonar a');
    // QA D2: con saldo migrado, la ayuda no habla solo de «plan».
    expect(dialog).toHaveTextContent('El abono se aplica al plan o al saldo migrado que elijas y aparece en la caja de hoy.');
    // Solo los saldos con algo pendiente.
    await waitFor(() =>
      expect(
        within(target)
          .getAllByRole('option')
          .map((o) => money(o.textContent)),
      ).toEqual(['Un plan de tratamiento', 'Saldo migrado · Ortodoncia 2025 · pendiente COP 150.000,00']),
    );
    await user.selectOptions(target, 'ob:ob-1');
    expect(within(dialog).queryByLabelText('Plan')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('COP');
    expect(within(dialog).getByLabelText('Moneda')).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Importe'), '100000');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
    expect(mockedRecordOpening).toHaveBeenCalledWith(
      'tok',
      'ob-1',
      expect.objectContaining({ amount: 100000, currency: 'COP' }),
      expect.any(String),
    );
    expect(mockedRecord).not.toHaveBeenCalled();
    expect(money(onRecorded.mock.calls[0][0] as string)).toContain('Saldo migrado · Ortodoncia 2025');
  });

  it('un importe mayor que lo pendiente se avisa sin llamar a la API', async () => {
    mockedList.mockResolvedValue([]);
    const user = userEvent.setup();
    renderModal([opening]);
    const dialog = screen.getByRole('dialog');
    // Sin planes cobrables pero con saldo migrado: se puede cobrar el saldo.
    await waitFor(() => expect(within(dialog).getByLabelText('Abonar a')).toHaveValue('ob:ob-1'));
    await user.type(within(dialog).getByLabelText('Importe'), '150000,01');
    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    expect(await within(dialog).findByText(/supera lo pendiente/)).toBeInTheDocument();
    expect(mockedRecordOpening).not.toHaveBeenCalled();
  });
});

describe('DX-376: cobro en otra moneda que la del plan', () => {
  async function openUsdPlan() {
    const user = userEvent.setup();
    mockedList.mockResolvedValue([usdPlan]);
    const utils = renderModal();
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByLabelText('Plan');
    // La lista de monedas llega aparte.
    await within(dialog).findByRole('option', { name: /Bolívar/ });
    return { user, dialog, ...utils };
  }
  const preview = (dialog: HTMLElement) => within(dialog).getByTestId('rp-rate-preview');

  it('antes de guardar enseña el equivalente en la moneda del plan, la tasa con su fecha y su fuente, y lo pendiente tras el abono', async () => {
    const { user, dialog } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await user.type(within(dialog).getByLabelText('Importe'), '1825');

    await waitFor(() => expect(money(preview(dialog).textContent)).toContain('Equivalente en USDUSD 50,00'));
    const date = (within(dialog).getByLabelText('Fecha de pago') as HTMLInputElement).value;
    expect(mockedRates).toHaveBeenCalledWith('tok', date);
    const [y, m, d] = date.split('-');
    const text = money(preview(dialog).textContent);
    expect(text).toContain(`Tasa: 1 USD = VES 36,50 · automática · ${d}/${m}/${y}`);
    expect(text).toContain('Pendiente tras el abonoUSD 450,00');
  });

  it('cambiar la fecha pide la tasa de ese día', async () => {
    const { user, dialog } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await user.clear(within(dialog).getByLabelText('Fecha de pago'));
    await user.type(within(dialog).getByLabelText('Fecha de pago'), '2026-10-01');
    await waitFor(() => expect(mockedRates).toHaveBeenLastCalledWith('tok', '2026-10-01'));
  });

  it('sin importe enseña la tasa e invita a escribirlo', async () => {
    const { user, dialog } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await waitFor(() => expect(money(preview(dialog).textContent)).toContain('1 USD = VES 36,50'));
    expect(preview(dialog)).toHaveTextContent(recordPaymentCopy.preview.typeAmount);
  });

  it('mientras consulta la tasa lo dice', async () => {
    mockedRates.mockReturnValue(new Promise(() => {}));
    const { user, dialog } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    expect(await within(dialog).findByText(recordPaymentCopy.preview.loading)).toBeInTheDocument();
  });

  it('si la consulta falla lo dice con reintento y deja guardar', async () => {
    mockedRates.mockRejectedValueOnce(new Error('red'));
    mockedRecord.mockResolvedValue(savedPayment({ amount: 1825, currency: 'VES', treatmentPlanId: 'plan-usd' }));
    const { user, dialog, onRecorded } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await user.type(within(dialog).getByLabelText('Importe'), '1825');

    const retry = await within(dialog).findByRole('button', { name: recordPaymentCopy.preview.retry });
    expect(preview(dialog)).toHaveTextContent(recordPaymentCopy.preview.error);
    await user.click(retry);
    await waitFor(() => expect(money(preview(dialog).textContent)).toContain('Equivalente en USDUSD 50,00'));

    mockedRates.mockRejectedValueOnce(new Error('red'));
    await user.clear(within(dialog).getByLabelText('Fecha de pago'));
    await user.type(within(dialog).getByLabelText('Fecha de pago'), '2026-10-01');
    await within(dialog).findByRole('button', { name: recordPaymentCopy.preview.retry });
    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
  });

  // DX-386/SEC-054: con la fuente automática, un día sin tasa en caché y sin
  // proveedor responde 503 EXCHANGE_RATE_UNAVAILABLE: no es «no se pudo
  // consultar», es que la tasa aún no está.
  it('si el servidor no tiene aún la tasa del proveedor lo dice como aviso, no como fallo, y deja guardar', async () => {
    mockedRates.mockRejectedValue(
      new ApiError(503, 'No hay tasa de cambio disponible para esa fecha.', { code: 'EXCHANGE_RATE_UNAVAILABLE' }),
    );
    mockedRecord.mockResolvedValue(
      savedPayment({ amount: 1825, currency: 'VES', treatmentPlanId: 'plan-usd', exchangeRateStatus: 'MISSING' }),
    );
    const { user, dialog, onRecorded } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await user.type(within(dialog).getByLabelText('Importe'), '1825');

    const date = (within(dialog).getByLabelText('Fecha de pago') as HTMLInputElement).value;
    const [y, m, d] = date.split('-');
    await waitFor(() =>
      expect(preview(dialog)).toHaveTextContent(recordPaymentCopy.preview.unavailable(`${d}/${m}/${y}`)),
    );
    expect(preview(dialog)).not.toHaveTextContent(recordPaymentCopy.preview.error);
    // Se puede volver a consultar sin esperar al barrido.
    mockedRates.mockResolvedValue({ base: 'USD', source: 'AUTOMATIC', rates: { VES: 36.5 } });
    await user.click(within(dialog).getByRole('button', { name: recordPaymentCopy.preview.retry }));
    await waitFor(() => expect(money(preview(dialog).textContent)).toContain('Equivalente en USDUSD 50,00'));

    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
  });

  it('un error del servidor (500) dice que no se pudo consultar, no que la tasa aún no está', async () => {
    mockedRates.mockRejectedValue(new ApiError(500, 'Internal server error'));
    const { user, dialog } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await waitFor(() => expect(preview(dialog)).toHaveTextContent(recordPaymentCopy.preview.error));
    expect(preview(dialog)).not.toHaveTextContent(/aún no está disponible/);
  });

  it('un fallo de red sigue diciendo que no se pudo consultar', async () => {
    mockedRates.mockRejectedValue(new NetworkError(new TypeError('Failed to fetch')));
    const { user, dialog } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await waitFor(() => expect(preview(dialog)).toHaveTextContent(recordPaymentCopy.preview.error));
    expect(preview(dialog)).not.toHaveTextContent(/aún no está disponible/);
  });

  it('con otra sede, la previsualización usa su formato y el código ISO (DX-386)', async () => {
    mockedLocations.mockResolvedValue([clinicLocation({ locale: 'de-DE', hourCycle: 'h23' })]);
    const { user, dialog } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await user.type(within(dialog).getByLabelText('Importe'), '1825');
    await waitFor(() => expect(money(preview(dialog).textContent)).toContain('Equivalente en USD50,00 USD'));
    const date = (within(dialog).getByLabelText('Fecha de pago') as HTMLInputElement).value;
    const [y, m, d] = date.split('-');
    expect(money(preview(dialog).textContent)).toContain(`Tasa: 1 USD = 36,50 VES · automática · ${d}.${m}.${y}`);
    expect(preview(dialog)).not.toHaveTextContent('US$');
  });

  it('sin tasa del día lo dice y deja guardar: el abono queda «sin tasa»', async () => {
    mockedRates.mockResolvedValue({ base: 'USD', source: 'MANUAL', rates: {} });
    mockedRecord.mockResolvedValue(
      savedPayment({ amount: 1825, currency: 'VES', treatmentPlanId: 'plan-usd', exchangeRateStatus: 'MISSING' }),
    );
    const { user, dialog, onRecorded } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await user.type(within(dialog).getByLabelText('Importe'), '1825');

    await waitFor(() => expect(preview(dialog)).toHaveTextContent(/no hay tasa de VES para el/i));
    expect(preview(dialog)).toHaveTextContent(/se guarda igual y queda «sin tasa»/);
    expect(preview(dialog)).not.toHaveTextContent(/equivalente/i);

    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() =>
      expect(mockedRecord).toHaveBeenCalledWith(
        'tok',
        'plan-usd',
        expect.objectContaining({ amount: 1825, currency: 'VES' }),
        expect.any(String),
      ),
    );
    expect(onRecorded.mock.calls[0][0]).toContain(recordPaymentCopy.recordedWithoutRate);
  });

  it('lo pendiente cuenta los abonos anteriores en otra moneda: sale del saldo convertido del plan, no del de la lista', async () => {
    // La lista de planes cobrables no descuenta los abonos en otra moneda
    // (500); el saldo del plan sí, con su tasa congelada (450).
    mockedBalance.mockResolvedValue(usdBalance({ paid: 50, balance: 450, paymentsCount: 1 }));
    const { user, dialog } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await user.type(within(dialog).getByLabelText('Importe'), '1825');

    await waitFor(() => expect(money(preview(dialog).textContent)).toContain('Pendiente tras el abonoUSD 400,00'));
    expect(mockedBalance).toHaveBeenCalledWith('tok', 'plan-usd');
  });

  it('con abonos «sin tasa» anteriores avisa de que lo pendiente aún no los cuenta', async () => {
    mockedBalance.mockResolvedValue(
      usdBalance({
        paymentsWithoutRate: [{ paymentId: 'p-0', amount: 1000, currency: 'VES', paidOn: '2026-10-01' }],
        paymentsCount: 1,
      }),
    );
    const { user, dialog } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await user.type(within(dialog).getByLabelText('Importe'), '1825');

    await waitFor(() => expect(money(preview(dialog).textContent)).toContain('Pendiente tras el abonoUSD 450,00'));
    expect(preview(dialog)).toHaveTextContent(recordPaymentCopy.preview.pendingWithoutRate(1));
  });

  it('si el saldo del plan no se puede leer, enseña el equivalente y la tasa sin inventar lo pendiente', async () => {
    mockedBalance.mockRejectedValue(new Error('red'));
    const { user, dialog } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await user.type(within(dialog).getByLabelText('Importe'), '1825');

    await waitFor(() => expect(money(preview(dialog).textContent)).toContain('Equivalente en USDUSD 50,00'));
    await waitFor(() => expect(preview(dialog)).toHaveTextContent(recordPaymentCopy.preview.pendingUnavailable));
    expect(preview(dialog)).not.toHaveTextContent(/Pendiente tras el abono/);
  });

  it('la tasa del día se recorta a 8 decimales, como la congela la API', async () => {
    mockedRates.mockResolvedValue({ base: 'USD', source: 'AUTOMATIC', rates: { VES: 0.123456785 } });
    mockedBalance.mockResolvedValue(usdBalance({ billable: 100000, balance: 100000 }));
    const { user, dialog } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await user.type(within(dialog).getByLabelText('Importe'), '10000');
    // 10.000 / 0,12345678 = 81.000,01 (con la tasa cruda saldría 81.000,00).
    await waitFor(() => expect(money(preview(dialog).textContent)).toContain('Equivalente en USDUSD 81.000,01'));
  });

  it('al escribir la fecha deprisa no pide la tasa de cada día intermedio: solo la del día final', async () => {
    const { user, dialog } = await openUsdPlan();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'VES');
    await waitFor(() => expect(mockedRates).toHaveBeenCalled());
    mockedRates.mockClear();
    const date = within(dialog).getByLabelText('Fecha de pago');
    // Lo que emite un <input type="date"> mientras se teclea el año.
    for (const value of ['0002-10-01', '0020-10-01', '0202-10-01', '2026-10-01']) {
      fireEvent.change(date, { target: { value } });
    }
    await waitFor(() => expect(mockedRates).toHaveBeenCalledWith('tok', '2026-10-01'));
    expect(mockedRates).toHaveBeenCalledTimes(1);
  });

  it('en la moneda del plan no enseña previsualización ni consulta la tasa', async () => {
    const { user, dialog } = await openUsdPlan();
    await user.type(within(dialog).getByLabelText('Importe'), '50');
    expect(within(dialog).queryByTestId('rp-rate-preview')).not.toBeInTheDocument();
    expect(mockedRates).not.toHaveBeenCalled();
  });

  it('ningún texto de la previsualización nombra un país ni un banco central', () => {
    const all = JSON.stringify(recordPaymentCopy.preview);
    expect(all).not.toMatch(/venezuela|colombia|bcv|banco central/i);
  });
});
