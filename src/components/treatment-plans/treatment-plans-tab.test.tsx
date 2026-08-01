import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreatmentPlansTab } from './treatment-plans-tab';
import { ApiError } from '@/lib/api/client';
import { Toaster } from '@/components/errors/toaster';
import {
  addItem,
  createPlan,
  getPlan,
  listPlans,
  removeItem,
  updateItem,
  updatePlan,
  type TreatmentPlanItem,
} from '@/lib/treatment-plans/treatment-plans-api';
import {
  getPlanBalance,
  listPayments,
  recordPayment,
  voidPayment,
  type Payment,
  type PlanBalance,
} from '@/lib/payments/payments-api';
import { listCatalogItems } from '@/lib/odontogram/catalog-api';
import { getPatient, type Patient } from '@/lib/patients/patients-api';
import { fetchClinicName } from '@/lib/clinic-branding';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { getPaymentPlan } from '@/lib/payment-plans/payment-plan-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching odontogram-tab.test.tsx's / agenda-view.test.tsx's
// convention.
jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  createPlan: jest.fn(),
  listPlans: jest.fn(),
  getPlan: jest.fn(),
  updatePlan: jest.fn(),
  addItem: jest.fn(),
  updateItem: jest.fn(),
  removeItem: jest.fn(),
}));
jest.mock('../../lib/payments/payments-api', () => ({
  getPlanBalance: jest.fn(),
  listPayments: jest.fn(),
  recordPayment: jest.fn(),
  voidPayment: jest.fn(),
}));
jest.mock('../../lib/odontogram/catalog-api', () => ({
  listCatalogItems: jest.fn(),
}));
// PaymentPlanSection (a child rendered whenever the balance loads) fetches
// its own payment plan — unmocked, it hits the real (unavailable) network
// and pollutes the DOM with its own error alert. Mock it to the normal
// "no active plan" (`null`) response so it renders its empty state instead.
jest.mock('../../lib/payment-plans/payment-plan-api', () => ({
  getPaymentPlan: jest.fn(),
  createPaymentPlan: jest.fn(),
  deletePaymentPlan: jest.fn(),
}));
// CurrencySelect (Task 10, wired in this component per Task 11) fetches its
// own options via `listCurrencies` — mock it here so the abono-currency and
// new-plan-currency selects render deterministically.
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn(),
}));
// Recibo (RECIBO-T1): patient name + clinic name, fetched once by the tab.
jest.mock('../../lib/patients/patients-api', () => ({
  getPatient: jest.fn(),
}));
jest.mock('../../lib/clinic-branding', () => ({
  fetchClinicName: jest.fn(),
}));

const mockedCreatePlan = createPlan as jest.MockedFunction<typeof createPlan>;
const mockedListPlans = listPlans as jest.MockedFunction<typeof listPlans>;
const mockedGetPlan = getPlan as jest.MockedFunction<typeof getPlan>;
const mockedUpdatePlan = updatePlan as jest.MockedFunction<typeof updatePlan>;
const mockedAddItem = addItem as jest.MockedFunction<typeof addItem>;
const mockedUpdateItem = updateItem as jest.MockedFunction<typeof updateItem>;
const mockedRemoveItem = removeItem as jest.MockedFunction<typeof removeItem>;
const mockedListCatalogItems = listCatalogItems as jest.MockedFunction<typeof listCatalogItems>;
const mockedGetPlanBalance = getPlanBalance as jest.MockedFunction<typeof getPlanBalance>;
const mockedListPayments = listPayments as jest.MockedFunction<typeof listPayments>;
const mockedRecordPayment = recordPayment as jest.MockedFunction<typeof recordPayment>;
const mockedVoidPayment = voidPayment as jest.MockedFunction<typeof voidPayment>;
const mockedGetPatient = getPatient as jest.MockedFunction<typeof getPatient>;
const mockedFetchClinicName = fetchClinicName as jest.MockedFunction<typeof fetchClinicName>;
const mockedListCurrencies = listCurrencies as jest.MockedFunction<typeof listCurrencies>;
const mockedGetPaymentPlan = getPaymentPlan as jest.MockedFunction<typeof getPaymentPlan>;

const catalog = [
  {
    id: 'cat-1',
    tenantId: 't1',
    code: 'RES',
    category: null,
    kind: 'PROCEDURE' as const,
    labelEs: 'Resina',
    labelEn: null,
    labelPt: null,
    color: '#00AAFF',
    defaultPrice: 50000,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-2',
    tenantId: 't1',
    code: 'LIM',
    category: null,
    kind: 'PROCEDURE' as const,
    labelEs: 'Limpieza',
    labelEn: null,
    labelPt: null,
    color: '#00FFAA',
    defaultPrice: 80000,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function plan(overrides: Partial<import('@/lib/treatment-plans/treatment-plans-api').TreatmentPlan> & { id: string }) {
  return {
    tenantId: 't1',
    patientId: 'pat-1',
    status: 'DRAFT' as const,
    currency: 'USD',
    notes: null,
    createdById: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const item1: TreatmentPlanItem = {
  id: 'item-1',
  tenantId: 't1',
  planId: 'plan-1',
  toothNumber: '11',
  surfaces: [],
  catalogItemId: 'cat-1',
  price: 50000,
  status: 'PROPOSED',
  notes: null,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const item2: TreatmentPlanItem = {
  id: 'item-2',
  tenantId: 't1',
  planId: 'plan-1',
  toothNumber: '26',
  surfaces: ['OCCLUSAL'],
  catalogItemId: 'cat-2',
  price: 80000,
  status: 'ACCEPTED',
  notes: null,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const plan1 = plan({ id: 'plan-1' });
const plan1Detail = { ...plan1, items: [item1, item2], total: item1.price + item2.price };
// A second plan, used only by the "toast de plan obsoleto" coverage test
// below — needs its own id/detail so switching the plan selector is
// observable in the mocked `getPlan` call args.
const plan2 = plan({ id: 'plan-2' });
const plan2Detail = { ...plan2, items: [item1], total: item1.price };

const payment1: Payment = {
  id: 'pay-1',
  tenantId: 't1',
  treatmentPlanId: 'plan-1',
  patientId: 'pat-1',
  amount: 50000,
  currency: 'USD',
  paidAt: '2026-01-05T00:00:00.000Z',
  method: 'CASH',
  notes: null,
  createdById: null,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
};

const balance1: PlanBalance = {
  planCurrency: 'USD',
  billable: 130000,
  paid: 50000,
  balance: 80000,
  paymentsCount: 1,
};

/** Empty balance/payments — the default for tests that don't exercise the abonos block. */
function emptyBalance(): PlanBalance {
  return { planCurrency: 'USD', billable: 0, paid: 0, balance: 0, paymentsCount: 0 };
}

/** Patient fixture for the receipt's patientName fetch (RECIBO-T1). */
const patient1: Patient = {
  id: 'pat-1',
  tenantId: 't1',
  firstName: 'Ana',
  lastName: 'García',
  docType: 'CC',
  docNumber: null,
  birthDate: null,
  sex: 'F',
  phone: null,
  email: null,
  address: null,
  notes: null,
  createdById: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const currencyFormatter = new Intl.NumberFormat('es', { style: 'currency', currency: 'USD' });
/**
 * `Intl.NumberFormat`'s `es` output places a NBSP (` `) between the
 * amount and the `US$` symbol. Testing Library's default text normalizer
 * collapses whitespace (including NBSP, matched by `\s`) in the DOM node's
 * text content down to a plain space before comparing — but it does NOT run
 * that same normalization over a plain-string query — so asserting against
 * the raw formatter output (still carrying the NBSP) never matches. This
 * mirrors what the component renders, then swaps the NBSP for a regular
 * space so the query matches what `getByText` actually compares against.
 */
function expectedCurrencyText(amount: number): string {
  return currencyFormatter.format(amount).replace(/\u00A0/g, ' ');
}

/** A promise this test controls the settlement of, to assert on the interim (pending) state — same helper as odontogram-tab.test.tsx / agenda-view.test.tsx. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('TreatmentPlansTab', () => {
  beforeEach(() => {
    mockedCreatePlan.mockReset();
    mockedListPlans.mockReset();
    mockedGetPlan.mockReset();
    mockedUpdatePlan.mockReset();
    mockedAddItem.mockReset();
    mockedUpdateItem.mockReset();
    mockedRemoveItem.mockReset();
    mockedListCatalogItems.mockReset();
    mockedListCatalogItems.mockResolvedValue(catalog);
    mockedGetPlanBalance.mockReset();
    mockedListPayments.mockReset();
    mockedRecordPayment.mockReset();
    mockedVoidPayment.mockReset();
    mockedGetPatient.mockReset();
    mockedFetchClinicName.mockReset();
    mockedListCurrencies.mockReset();
    mockedListCurrencies.mockResolvedValue([
      { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
      { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    ]);
    mockedGetPaymentPlan.mockReset();
    // Default: no active payment plan — PaymentPlanSection renders its empty
    // state instead of erroring, same rationale as the balance/patient
    // defaults below.
    mockedGetPaymentPlan.mockResolvedValue(null);
    // Default: empty balance/no abonos, so tests that don't exercise the
    // payments block (most of the existing item/plan tests below) don't hang
    // on an unresolved mock.
    mockedGetPlanBalance.mockResolvedValue(emptyBalance());
    mockedListPayments.mockResolvedValue([]);
    // Default: patient/clinic name resolve — most existing tests don't
    // assert on these, but they must not hang or reject unhandled.
    mockedGetPatient.mockResolvedValue(patient1);
    mockedFetchClinicName.mockResolvedValue('Clínica Sonrisa');
  });

  it('shows the empty state when the patient has no plans, and creates a DRAFT plan on "Nuevo plan"', async () => {
    mockedListPlans.mockResolvedValueOnce([]);
    const created = plan({ id: 'plan-new', status: 'DRAFT' });
    mockedCreatePlan.mockResolvedValue(created);
    // After creation, the refresh-in-place listPlans() call returns the new plan.
    mockedListPlans.mockResolvedValueOnce([created]);
    mockedGetPlan.mockResolvedValue({ ...created, items: [], total: 0 });

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    expect(await screen.findByText(/todavía no tiene un plan de tratamiento/i)).toBeInTheDocument();

    // The "Nuevo plan" currency select has no adjacent <label> (it sits next
    // to the button, not in a FormField) — must still be reachable by its
    // accessible name (WCAG 4.1.2, via CurrencySelect's `ariaLabel`).
    expect(screen.getByLabelText(/moneda del nuevo plan/i)).toHaveDisplayValue(/./);

    await user.click(screen.getByRole('button', { name: /nuevo plan/i }));

    // The "Nuevo plan" currency select defaults to USD (Task 11).
    await waitFor(() =>
      expect(mockedCreatePlan).toHaveBeenCalledWith('tok', 'pat-1', { currency: 'USD' }),
    );
    await waitFor(() => expect(mockedListPlans).toHaveBeenCalledTimes(2));
    // The new plan is auto-selected -> its (empty) detail is fetched.
    await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledWith('tok', 'plan-new'));
    expect(await screen.findByText(/este plan todavía no tiene ítems/i)).toBeInTheDocument();
  });

  it("renders a plan's items with the total equal to the sum of the items' prices", async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);

    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
    expect(within(table).getByText('11')).toBeInTheDocument();
    expect(within(table).getByText('Resina')).toBeInTheDocument();
    expect(within(table).getByText('26')).toBeInTheDocument();
    expect(within(table).getByText('Limpieza')).toBeInTheDocument();

    // Total must equal the sum of the two items' prices (130000), formatted
    // as currency — not hardcoded independently of `item1`/`item2`.
    const expectedTotal = item1.price + item2.price;
    expect(screen.getByText(expectedCurrencyText(expectedTotal))).toBeInTheDocument();
  });

  it("falls back to the raw catalogItemId when the item's procedure isn't in the catalog map", async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    const orphanItem = { ...item1, id: 'item-orphan', catalogItemId: 'cat-missing' };
    mockedGetPlan.mockResolvedValue({ ...plan1, items: [orphanItem], total: orphanItem.price });

    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
    expect(within(table).getByText('cat-missing')).toBeInTheDocument();
  });

  it("prefills the price with the selected procedure's catalog defaultPrice, staying editable", async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

    const procedureSelect = screen.getByLabelText<HTMLSelectElement>(/^procedimiento$/i);
    const priceInput = screen.getByLabelText<HTMLInputElement>(/^precio$/i);
    expect(priceInput.value).toBe('');

    await user.selectOptions(procedureSelect, 'cat-1');
    expect(priceInput.value).toBe('50000');

    // Still editable after the prefill.
    await user.clear(priceInput);
    await user.type(priceInput, '45000');
    expect(priceInput.value).toBe('45000');

    // Submitting sends the edited price, not the catalog default.
    mockedAddItem.mockResolvedValue({ ...item1, id: 'item-3', price: 45000 });
    mockedGetPlan.mockResolvedValueOnce({
      ...plan1Detail,
      items: [...(plan1Detail.items ?? []), { ...item1, id: 'item-3', price: 45000 }],
      total: plan1Detail.total + 45000,
    });

    await user.type(screen.getByLabelText(/diente \(fdi\)/i), '16');
    await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));

    await waitFor(() =>
      expect(mockedAddItem).toHaveBeenCalledWith('tok', 'plan-1', {
        toothNumber: '16',
        catalogItemId: 'cat-1',
        price: 45000,
      }),
    );
  });

  it('rejects an invalid FDI tooth number client-side, without calling addItem', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
    await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

    await user.type(screen.getByLabelText(/diente \(fdi\)/i), '99');
    await user.selectOptions(screen.getByLabelText<HTMLSelectElement>(/^procedimiento$/i), 'cat-1');
    await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));

    expect(await screen.findByText(/número de diente inválido/i)).toBeInTheDocument();
    expect(mockedAddItem).not.toHaveBeenCalled();
  });

  it("changing an item's status calls updateItem then refreshes the plan in place — the table stays mounted (no remount), the row disabled until the refetch resolves", async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedUpdateItem.mockResolvedValue({ ...item1, status: 'ACCEPTED' });

    // First getPlan call (initial detail load) resolves immediately; the
    // second call (the post-update refresh triggered by
    // `handleItemStatusChange`) is controlled manually so the test can
    // assert the interim (disabled) state before it settles — mirrors
    // agenda-view.test.tsx's status-change test.
    const refetch = deferred<typeof plan1Detail>();
    let callCount = 0;
    mockedGetPlan.mockImplementation(() => {
      callCount += 1;
      return callCount === 1 ? Promise.resolve(plan1Detail) : refetch.promise;
    });

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
    const statusSelect = within(table).getByRole<HTMLSelectElement>('combobox', {
      name: /estado del ítem del diente 11/i,
    });
    expect(statusSelect.value).toBe('PROPOSED');
    expect(statusSelect).not.toBeDisabled();

    await user.selectOptions(statusSelect, 'ACCEPTED');

    await waitFor(() =>
      expect(mockedUpdateItem).toHaveBeenCalledWith('tok', 'plan-1', 'item-1', { status: 'ACCEPTED' }),
    );
    // The refresh-in-place fetch has started (2nd getPlan call pending on
    // `refetch`) — same mounted table node, and the row stays disabled while
    // its own refresh is in flight (it must NOT re-enable just because the
    // PATCH itself settled).
    await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('table', { name: /ítems del plan de tratamiento/i })).toBe(table);
    expect(within(table).getByRole<HTMLSelectElement>('combobox', { name: /estado del ítem del diente 11/i })).toBeDisabled();

    refetch.resolve({ ...plan1Detail, items: [{ ...item1, status: 'ACCEPTED' }, item2] });

    await waitFor(() =>
      expect(
        within(table).getByRole<HTMLSelectElement>('combobox', { name: /estado del ítem del diente 11/i }),
      ).not.toBeDisabled(),
    );
    expect(
      within(table).getByRole<HTMLSelectElement>('combobox', { name: /estado del ítem del diente 11/i }).value,
    ).toBe('ACCEPTED');
    expect(screen.getByRole('table', { name: /ítems del plan de tratamiento/i })).toBe(table);
  });

  it('removing an item calls removeItem then refreshes the plan in place — the removed item disappears and the total drops, table stays mounted', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedRemoveItem.mockResolvedValue(undefined);

    const refetch = deferred<typeof plan1Detail>();
    let callCount = 0;
    mockedGetPlan.mockImplementation(() => {
      callCount += 1;
      return callCount === 1 ? Promise.resolve(plan1Detail) : refetch.promise;
    });

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
    const row = within(table).getByText('11').closest('tr') as HTMLTableRowElement;
    const removeButton = within(row).getByRole('button', { name: /quitar/i });

    await user.click(removeButton);

    await waitFor(() => expect(mockedRemoveItem).toHaveBeenCalledWith('tok', 'plan-1', 'item-1'));
    await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledTimes(2));
    // Still the same table node while the refetch is pending — no remount.
    expect(screen.getByRole('table', { name: /ítems del plan de tratamiento/i })).toBe(table);
    expect(within(row).getByRole('button', { name: /quitando/i })).toBeDisabled();

    refetch.resolve({ ...plan1Detail, items: [item2], total: item2.price });

    await waitFor(() => expect(within(table).queryByText('11')).not.toBeInTheDocument());
    expect(screen.getByRole('table', { name: /ítems del plan de tratamiento/i })).toBe(table);
    // Scope to the "Total" row specifically — after removal the total
    // (80000) happens to equal item2's own price, which also still renders
    // in its table cell + mobile card, so an unscoped query would match 3
    // nodes.
    const totalRow = screen.getByText('Total').closest('div') as HTMLElement;
    expect(within(totalRow).getByText(expectedCurrencyText(item2.price))).toBeInTheDocument();
  });

  it("changing the plan's status calls updatePlan then refreshes the detail (and the plan list) in place", async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedUpdatePlan.mockResolvedValue({ ...plan1, status: 'ACCEPTED' });

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
    await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

    mockedGetPlan.mockResolvedValueOnce({ ...plan1Detail, status: 'ACCEPTED' });
    mockedListPlans.mockResolvedValueOnce([{ ...plan1, status: 'ACCEPTED' }]);

    const planStatusSelect = screen.getByLabelText<HTMLSelectElement>(/^estado del plan$/i);
    await user.selectOptions(planStatusSelect, 'ACCEPTED');

    await waitFor(() =>
      expect(mockedUpdatePlan).toHaveBeenCalledWith('tok', 'plan-1', { status: 'ACCEPTED' }),
    );
    await waitFor(() => expect(planStatusSelect.value).toBe('ACCEPTED'));
  });

  it('shows the balance figures (A pagar, Pagado, Saldo) formatted in the plan currency, and lists abonos in their own currency', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedGetPlanBalance.mockResolvedValue(balance1);
    mockedListPayments.mockResolvedValue([payment1]);

    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
    await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

    // Scope each figure to its own card — `billable` (130000) happens to
    // equal the items total, which also renders in the "Total" row above, so
    // an unscoped `getByText` on the formatted amount would match twice.
    const billableCard = (await screen.findByText('A pagar')).closest('div') as HTMLElement;
    expect(within(billableCard).getByText(expectedCurrencyText(balance1.billable))).toBeInTheDocument();
    const paidCard = screen.getByText('Pagado').closest('div') as HTMLElement;
    expect(within(paidCard).getByText(expectedCurrencyText(balance1.paid))).toBeInTheDocument();
    const balanceCard = screen.getByText('Saldo').closest('div') as HTMLElement;
    expect(within(balanceCard).getByText(expectedCurrencyText(balance1.balance))).toBeInTheDocument();

    const paymentsTable = screen.getByRole('table', { name: /abonos del plan de tratamiento/i });
    expect(within(paymentsTable).getByText(expectedCurrencyText(payment1.amount))).toBeInTheDocument();
    expect(within(paymentsTable).getByText('Efectivo')).toBeInTheDocument();
  });

  it('"Registrar abono" toggles the form, defaulting moneda to the plan currency and fecha to today; submitting calls recordPayment then refreshes balance + list in place', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedGetPlanBalance.mockResolvedValue(balance1);
    mockedListPayments.mockResolvedValue([]);

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
    await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
    expect(await screen.findByText('A pagar')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^registrar abono$/i }));

    const currencySelect = screen.getByLabelText<HTMLSelectElement>(/^moneda$/i);
    expect(currencySelect.value).toBe(plan1.currency);
    const dateInput = screen.getByLabelText<HTMLInputElement>(/^fecha$/i);
    expect(dateInput.value).not.toBe('');

    // Picking a different currency from the select (Task 11: CurrencySelect
    // replaces the old free-text input) must be what's submitted — wait for
    // its (mocked `listCurrencies`) options to load in first. Scoped to this
    // select specifically: the "Nuevo plan" currency select above also
    // renders the same options once loaded.
    await waitFor(() => expect(currencySelect.querySelector('option[value="COP"]')).not.toBeNull());
    await user.selectOptions(currencySelect, 'COP');

    await user.type(screen.getByLabelText(/^monto$/i), '25000');

    const newPayment = { ...payment1, id: 'pay-2', amount: 25000, currency: 'COP' };
    const updatedBalance = { ...balance1, paid: balance1.paid + 25000, balance: balance1.balance - 25000 };
    mockedRecordPayment.mockResolvedValue(newPayment);
    mockedGetPlanBalance.mockResolvedValueOnce(updatedBalance);
    mockedListPayments.mockResolvedValueOnce([newPayment]);

    await user.click(screen.getByRole('button', { name: /^registrar abono$/i }));

    await waitFor(() => expect(mockedRecordPayment).toHaveBeenCalledTimes(1));
    const [tokenArg, planIdArg, input] = mockedRecordPayment.mock.calls[0];
    expect(tokenArg).toBe('tok');
    expect(planIdArg).toBe('plan-1');
    expect(input.amount).toBe(25000);
    expect(input.currency).toBe('COP');
    expect(input.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(input.method).toBeUndefined();

    await waitFor(() => expect(mockedGetPlanBalance).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockedListPayments).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(expectedCurrencyText(updatedBalance.paid))).toBeInTheDocument();
  });

  it('"Anular" on an abono calls voidPayment then refreshes balance + list in place', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedGetPlanBalance.mockResolvedValue(balance1);
    mockedListPayments.mockResolvedValue([payment1]);
    mockedVoidPayment.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    const paymentsTable = await screen.findByRole('table', { name: /abonos del plan de tratamiento/i });
    const row = within(paymentsTable)
      .getByText(expectedCurrencyText(payment1.amount))
      .closest('tr') as HTMLTableRowElement;
    const voidButton = within(row).getByRole('button', { name: /anular/i });

    const updatedBalance = { ...balance1, paid: 0, balance: balance1.billable, paymentsCount: 0 };
    mockedGetPlanBalance.mockResolvedValueOnce(updatedBalance);
    mockedListPayments.mockResolvedValueOnce([]);

    await user.click(voidButton);

    await waitFor(() => expect(mockedVoidPayment).toHaveBeenCalledWith('tok', 'pay-1'));
    await waitFor(() => expect(mockedGetPlanBalance).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockedListPayments).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/este plan todavía no tiene abonos/i)).toBeInTheDocument();
  });

  it('"Recibo" on an abono opens the printable receipt with that abono\'s data, the patient name, and the clinic name (RECIBO-T1)', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedGetPlanBalance.mockResolvedValue(balance1);
    mockedListPayments.mockResolvedValue([payment1]);
    mockedGetPatient.mockResolvedValue(patient1);
    mockedFetchClinicName.mockResolvedValue('Clínica Sonrisa');

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    // Fetched once (not per-row), independent of the receipt being opened.
    await waitFor(() => expect(mockedGetPatient).toHaveBeenCalledWith('tok', 'pat-1'));
    await waitFor(() => expect(mockedFetchClinicName).toHaveBeenCalledTimes(1));

    const paymentsTable = await screen.findByRole('table', { name: /abonos del plan de tratamiento/i });
    const row = within(paymentsTable)
      .getByText(expectedCurrencyText(payment1.amount))
      .closest('tr') as HTMLTableRowElement;
    await user.click(within(row).getByRole('button', { name: /^recibo$/i }));

    const dialog = await screen.findByRole('dialog', { name: /comprobante de abono/i });
    expect(within(dialog).getByText('Clínica Sonrisa')).toBeInTheDocument();
    expect(within(dialog).getByText('Ana García')).toBeInTheDocument();
    expect(within(dialog).getByText('Efectivo')).toBeInTheDocument();
    expect(within(dialog).getByText(new RegExp(`REC-${payment1.id.slice(0, 8)}`))).toBeInTheDocument();

    // "Cerrar" closes the receipt (the button re-nulls `receiptPayment`).
    const actions = dialog.querySelector('.receipt-print-hide') as HTMLElement;
    await user.click(within(actions).getByRole('button', { name: /^cerrar$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a missing clinicName (branding fetch failed) does not break the receipt — it just omits the clinic line', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedGetPlanBalance.mockResolvedValue(balance1);
    mockedListPayments.mockResolvedValue([payment1]);
    mockedFetchClinicName.mockResolvedValue(null);

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    const paymentsTable = await screen.findByRole('table', { name: /abonos del plan de tratamiento/i });
    const row = within(paymentsTable)
      .getByText(expectedCurrencyText(payment1.amount))
      .closest('tr') as HTMLTableRowElement;
    await user.click(within(row).getByRole('button', { name: /^recibo$/i }));

    const dialog = await screen.findByRole('dialog', { name: /comprobante de abono/i });
    expect(within(dialog).queryByText('Clínica Sonrisa')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Ana García')).toBeInTheDocument();
  });

  // Error-states ladder (Task 8): each `text-danger` site classified by what
  // the user can still do — see task-8-report.md for the full table.
  describe('error states ladder', () => {
    it('cuando no hay planes que mostrar, usa el estado de sección con reintento (escalón 1: loadError)', async () => {
      mockedListPlans.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));

      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Error del servidor');
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
      // Rung-1 copy with its own retry affordance drops "Intenta de nuevo."
      expect(screen.queryByText(/intenta de nuevo/i)).not.toBeInTheDocument();
    });

    it('un refresh en segundo plano fallido de los planes se muestra como un toast, no como una franja roja (escalón 3: refreshError)', async () => {
      mockedListPlans
        // Initial mount load.
        .mockResolvedValueOnce([plan1])
        // `refreshPlansInPlace()`, called after "Nuevo plan" reuses the
        // existing empty DRAFT below — this is what we rig to fail.
        .mockRejectedValueOnce(new ApiError(500, 'No se pudo refrescar'));
      mockedGetPlan
        // Initial plan-detail load (has items, so the table renders).
        .mockResolvedValueOnce(plan1Detail)
        // `findReusableDraftPlan`'s emptiness check on plan1 — reports it
        // empty so "Nuevo plan" takes the reuse path (straight into
        // `refreshPlansInPlace()`) instead of POSTing a new plan.
        .mockResolvedValueOnce({ ...plan1, items: [], total: 0 });

      const user = userEvent.setup();
      render(
        <>
          <TreatmentPlansTab patientId="pat-1" token="tok" />
          <Toaster />
        </>,
      );
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      // No inline red strip for a background refresh failure.
      expect(screen.queryAllByRole('alert')).toHaveLength(0);

      await user.click(screen.getByRole('button', { name: /^nuevo plan$/i }));

      const toastText = await screen.findByText('No se pudo refrescar');
      expect(toastText.closest('[role="alert"]')).toBeNull();
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
      expect(screen.queryByText(/intenta de nuevo/i)).not.toBeInTheDocument();

      // Fix round 1: the toast's retry must trigger a genuinely fresh fetch
      // (via `reloadKey`, not a stale captured closure) — not just show a
      // button that does nothing.
      mockedListPlans.mockResolvedValueOnce([plan1]);
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(mockedListPlans).toHaveBeenCalledTimes(3));
    });

    it('crear un plan que falla se muestra junto al botón que se acaba de pulsar (escalón 4: createPlanError)', async () => {
      mockedListPlans.mockResolvedValueOnce([]);
      mockedCreatePlan.mockRejectedValueOnce(new ApiError(500, 'No se pudo crear'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByText(/todavía no tiene un plan de tratamiento/i);

      await user.click(screen.getByRole('button', { name: /^nuevo plan$/i }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('No se pudo crear');
    });

    it('el detalle del plan que falla al cargar usa el estado de sección con reintento, y el reintento limpia el error y muestra el contenido (escalón 1: planDetailError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockRejectedValueOnce(new ApiError(500, 'No se pudo cargar el plan'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('No se pudo cargar el plan');
      expect(screen.queryByText(/intenta de nuevo/i)).not.toBeInTheDocument();

      // Revisión final #1: `refreshPlanDetail` no limpiaba `planDetailError`,
      // así que aunque el reintento tuviera éxito el `SectionError` seguía
      // en pantalla para siempre y ocultaba los datos ya cargados. La
      // aserción (b) — que desaparece — es la que lo habría cazado.
      mockedGetPlan.mockResolvedValueOnce(plan1Detail);
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));

      await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
    });

    it('un refresh en segundo plano fallido del detalle del plan se muestra como un toast (escalón 3: planDetailRefreshError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedUpdatePlan.mockResolvedValue({ ...plan1, status: 'ACCEPTED' });
      mockedGetPlan
        .mockResolvedValueOnce(plan1Detail)
        .mockRejectedValueOnce(new ApiError(500, 'No se pudo refrescar el plan'));

      const user = userEvent.setup();
      render(
        <>
          <TreatmentPlansTab patientId="pat-1" token="tok" />
          <Toaster />
        </>,
      );
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      const planStatusSelect = screen.getByLabelText<HTMLSelectElement>(/^estado del plan$/i);
      await user.selectOptions(planStatusSelect, 'ACCEPTED');

      const toastText = await screen.findByText('No se pudo refrescar el plan');
      expect(toastText.closest('[role="alert"]')).toBeNull();
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();

      // Fix round 1: retry must bump `planDetailReloadKey` and genuinely
      // re-fetch, not replay a stale closure.
      mockedGetPlan.mockResolvedValueOnce({ ...plan1Detail, status: 'ACCEPTED' });
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledTimes(3));
    });

    it('un toast de refresh obsoleto: cambiar de plan antes de pulsar "Reintentar" reintenta el plan actualmente seleccionado, no el original (Minor: cobertura de plan obsoleto)', async () => {
      mockedListPlans.mockResolvedValue([plan1, plan2]);
      mockedUpdatePlan.mockResolvedValue({ ...plan1, status: 'ACCEPTED' });
      // Persistent fallback for any call beyond the three explicit ones below
      // — the toast's retry, fired after switching to plan2, should land
      // here (a *fourth* call, for plan2).
      mockedGetPlan.mockResolvedValue(plan2Detail);
      mockedGetPlan
        .mockResolvedValueOnce(plan1Detail) // 1: initial load, plan1
        .mockRejectedValueOnce(new ApiError(500, 'No se pudo refrescar el plan')) // 2: refreshPlanDetail after status change, plan1
        .mockResolvedValueOnce(plan2Detail); // 3: initial load, plan2 (selector switch)

      const user = userEvent.setup();
      render(
        <>
          <TreatmentPlansTab patientId="pat-1" token="tok" />
          <Toaster />
        </>,
      );
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      const planStatusSelect = screen.getByLabelText<HTMLSelectElement>(/^estado del plan$/i);
      await user.selectOptions(planStatusSelect, 'ACCEPTED');

      // Plan 1's background refresh fails — its toast appears, built with an
      // `onRetry` that only bumps `planDetailReloadKey` (see the component's
      // comment on `refreshPlanDetail`'s catch: it re-reads `selectedPlanId`
      // fresh rather than closing over it, precisely so a leftover toast
      // can't replay a stale plan id).
      await screen.findByText('No se pudo refrescar el plan');
      await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledTimes(2));

      // Switch plans *while the plan-1 toast is still on screen* — nothing
      // dismisses it.
      const planSelect = screen.getByLabelText<HTMLSelectElement>(/^plan$/i);
      await user.selectOptions(planSelect, 'plan-2');
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledTimes(3));
      expect(mockedGetPlan).toHaveBeenNthCalledWith(3, 'tok', 'plan-2');

      // Now click the *stale* toast's retry. It reads `selectedPlanId` fresh
      // at click time — plan-2, the currently selected plan — not plan-1,
      // the plan the toast was originally about.
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledTimes(4));
      expect(mockedGetPlan).toHaveBeenNthCalledWith(4, 'tok', 'plan-2');
    });

    it('un cambio de estado del plan que falla se muestra en línea (escalón 4: planStatusError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedUpdatePlan.mockRejectedValueOnce(new ApiError(500, 'No se pudo cambiar el estado'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      const planStatusSelect = screen.getByLabelText<HTMLSelectElement>(/^estado del plan$/i);
      await user.selectOptions(planStatusSelect, 'ACCEPTED');

      const alert = await screen.findByText('No se pudo cambiar el estado');
      expect(alert.closest('[role="alert"]')).not.toBeNull();
    });

    it('quitar un ítem que falla se muestra en línea, junto a la tabla (escalón 4: itemActionError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedRemoveItem.mockRejectedValueOnce(new ApiError(500, 'No se pudo quitar'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      const row = within(table).getByText('11').closest('tr') as HTMLTableRowElement;

      await user.click(within(row).getByRole('button', { name: /quitar/i }));

      const alert = await screen.findByText('No se pudo quitar');
      expect(alert.closest('[role="alert"]')).not.toBeNull();
    });

    it('el saldo/abonos que fallan al cargar usan el estado de sección con reintento, y el reintento limpia el error y muestra el contenido (escalón 1: paymentsError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedGetPlanBalance.mockRejectedValueOnce(new ApiError(500, 'No se pudo cargar el saldo'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('No se pudo cargar el saldo');
      expect(screen.queryByText(/intenta de nuevo/i)).not.toBeInTheDocument();

      // Revisión final #1: mismo bug que planDetailError, en
      // `refreshBalanceAndPayments`, que tampoco limpiaba `paymentsError`.
      mockedGetPlanBalance.mockResolvedValueOnce(balance1);
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));

      await waitFor(() => expect(mockedGetPlanBalance).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      // The balance grid ("A pagar"/"Pagado"/"Saldo") is the content gated by
      // `!paymentsError && planBalance` — it renders regardless of whether
      // there happen to be any abonos yet (the default mock resolves an
      // empty list, so the abonos table itself would be an `EmptyState`, not
      // a `table`).
      await screen.findByText('A pagar');
    });

    it('un refresh en segundo plano fallido del saldo/abonos se muestra como un toast (escalón 3: paymentsRefreshError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedVoidPayment.mockResolvedValue(undefined);
      mockedGetPlanBalance
        .mockResolvedValueOnce(balance1)
        .mockRejectedValueOnce(new ApiError(500, 'No se pudo refrescar el saldo'));
      mockedListPayments.mockResolvedValue([payment1]);

      const user = userEvent.setup();
      render(
        <>
          <TreatmentPlansTab patientId="pat-1" token="tok" />
          <Toaster />
        </>,
      );
      const paymentsTable = await screen.findByRole('table', { name: /abonos del plan de tratamiento/i });
      const row = within(paymentsTable)
        .getByText(expectedCurrencyText(payment1.amount))
        .closest('tr') as HTMLTableRowElement;

      await user.click(within(row).getByRole('button', { name: /anular/i }));

      const toastText = await screen.findByText('No se pudo refrescar el saldo');
      expect(toastText.closest('[role="alert"]')).toBeNull();
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();

      // Fix round 1: retry must bump `paymentsReloadKey` and genuinely
      // re-fetch, not replay a stale closure.
      mockedGetPlanBalance.mockResolvedValueOnce(balance1);
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(mockedGetPlanBalance).toHaveBeenCalledTimes(3));
    });

    it('anular un abono que falla se muestra en línea (escalón 4: paymentActionError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedGetPlanBalance.mockResolvedValue(balance1);
      mockedListPayments.mockResolvedValue([payment1]);
      mockedVoidPayment.mockRejectedValueOnce(new ApiError(500, 'No se pudo anular'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      const paymentsTable = await screen.findByRole('table', { name: /abonos del plan de tratamiento/i });
      const row = within(paymentsTable)
        .getByText(expectedCurrencyText(payment1.amount))
        .closest('tr') as HTMLTableRowElement;

      await user.click(within(row).getByRole('button', { name: /anular/i }));

      const alert = await screen.findByText('No se pudo anular');
      expect(alert.closest('[role="alert"]')).not.toBeNull();
    });

    it('agregar un ítem que falla en el backend se muestra en línea junto al formulario (escalón 4: addItemError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedAddItem.mockRejectedValueOnce(new ApiError(400, 'Precio requerido'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      await user.type(screen.getByLabelText(/diente \(fdi\)/i), '16');
      await user.selectOptions(screen.getByLabelText<HTMLSelectElement>(/^procedimiento$/i), 'cat-1');
      await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));

      const alert = await screen.findByText('Precio requerido');
      expect(alert.closest('[role="alert"]')).not.toBeNull();
    });
  });
});
