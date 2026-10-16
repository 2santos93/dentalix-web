import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordPaymentModal } from './record-payment-modal';
import { ApiError } from '@/lib/api/client';
import { recordPayment } from '@/lib/payments/payments-api';
import { listBillablePlans, type BillablePlan } from '@/lib/payments/billable-plans-api';
import { listLocations } from '@/lib/locations/locations-api';

jest.mock('../../lib/payments/payments-api', () => ({
  recordPayment: jest.fn(),
}));
jest.mock('../../lib/payments/billable-plans-api', () => ({
  ...jest.requireActual('../../lib/payments/billable-plans-api'),
  listBillablePlans: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$' },
  ]),
}));

const mockedRecord = recordPayment as jest.MockedFunction<typeof recordPayment>;
const mockedList = listBillablePlans as jest.MockedFunction<typeof listBillablePlans>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

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

beforeEach(() => {
  mockedRecord.mockReset();
  mockedList.mockReset();
  mockedLocations.mockReset();
  mockedLocations.mockResolvedValue([]);
});

function renderModal() {
  const onRecorded = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <RecordPaymentModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      patientId="pat-1"
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

it('registra el abono contra el plan elegido, con Idempotency-Key, y avisa', async () => {
  const user = userEvent.setup();
  mockedList.mockResolvedValue([copPlan]);
  mockedRecord.mockResolvedValue({} as Awaited<ReturnType<typeof recordPayment>>);
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
        paidAt: '2026-10-01T00:00:00.000Z',
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
    'Ingresa un importe mayor que 0.',
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

  const submit = within(dialog).getByRole('button', { name: 'Registrar abono' });
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
    { id: 'loc-1', name: 'Sede principal', isActive: true },
    { id: 'loc-2', name: 'Sede Norte', isActive: true },
  ] as Awaited<ReturnType<typeof listLocations>>);
  mockedList.mockResolvedValue([copPlan]);
  renderModal();
  expect(
    await screen.findByText('Este abono quedará registrado en la sede Sede Norte.'),
  ).toBeInTheDocument();
  window.localStorage.clear();
});
