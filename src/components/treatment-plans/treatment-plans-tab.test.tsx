import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreatmentPlansTab } from './treatment-plans-tab';
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
});
