import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordPaymentModal, recordPaymentCopy } from './record-payment-modal';
import { ApiError } from '@/lib/api/client';
import { recordOpeningBalancePayment, recordPayment } from '@/lib/payments/payments-api';
import { listBillablePlans, type BillablePlan } from '@/lib/payments/billable-plans-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { getExchangeRates } from '@/lib/exchange/exchange-api';

jest.mock('../../lib/payments/payments-api', () => ({
  recordPayment: jest.fn(),
  recordOpeningBalancePayment: jest.fn(),
}));
jest.mock('../../lib/payments/billable-plans-api', () => ({
  ...jest.requireActual('../../lib/payments/billable-plans-api'),
  listBillablePlans: jest.fn(),
}));
jest.mock('../../lib/exchange/exchange-api', () => ({
  getExchangeRates: jest.fn(),
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
    notes: null,
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
  expect(within(plan).getAllByRole('option').map((o) => money(o.textContent))).toEqual([
    'Plan del 01/08/2026 · Aceptado · Saldo 1.800.000,00 COP',
    'Plan del 10/09/2026 · Aceptado · Saldo 500,00 US$',
  ]);
  expect(within(dialog).getByLabelText('Moneda')).toHaveValue('COP');
  expect((within(dialog).getByLabelText('Fecha de pago') as HTMLInputElement).value).toMatch(
    /^\d{4}-\d{2}-\d{2}$/,
  );
  expect(money(dialog.textContent)).toContain(
    'Saldo 1.800.000,00 COP · Total 3.000.000,00 COP · Abonado 1.200.000,00 COP',
  );

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
  expect(onRecorded.mock.calls[0][0]).toMatch(/^Abono registrado: 50,00\sUS\$ · .+\. /);
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
  await user.selectOptions(within(dialog).getByLabelText('Método'), 'TRANSFER');
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
        method: 'TRANSFER',
      },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    ),
  );
  expect(onRecorded).toHaveBeenCalledWith(
    expect.stringMatching(/^Abono registrado: 150\.000,00\sCOP · 01\/10\/2026 · Plan del 01\/08\/2026\.$/),
  );
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
    expect.stringMatching(/^Abono registrado: 1\.?000,00\sCOP · 01\/10\/2026 · Plan del 01\/08\/2026\.$/),
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
    expect(
      within(target)
        .getAllByRole('option')
        .map((o) => money(o.textContent)),
    ).toEqual(['Un plan de tratamiento', 'Saldo migrado · Ortodoncia 2025 · pendiente 150.000,00 COP']);
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

    await waitFor(() => expect(money(preview(dialog).textContent)).toContain('Equivalente en USD50,00 US$'));
    const date = (within(dialog).getByLabelText('Fecha de pago') as HTMLInputElement).value;
    expect(mockedRates).toHaveBeenCalledWith('tok', date);
    const [y, m, d] = date.split('-');
    const text = money(preview(dialog).textContent);
    expect(text).toContain(`Tasa: 1 USD = 36,50 VES · automática · ${d}/${m}/${y}`);
    expect(text).toContain('Pendiente tras el abono450,00 US$');
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
    await waitFor(() => expect(money(preview(dialog).textContent)).toContain('1 USD = 36,50 VES'));
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
    await waitFor(() => expect(money(preview(dialog).textContent)).toContain('Equivalente en USD50,00 US$'));

    mockedRates.mockRejectedValueOnce(new Error('red'));
    await user.clear(within(dialog).getByLabelText('Fecha de pago'));
    await user.type(within(dialog).getByLabelText('Fecha de pago'), '2026-10-01');
    await within(dialog).findByRole('button', { name: recordPaymentCopy.preview.retry });
    await user.click(within(dialog).getByRole('button', { name: 'Registrar abono' }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
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
