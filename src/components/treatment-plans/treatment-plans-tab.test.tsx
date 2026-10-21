import { moneyInputCopy } from '@/lib/format/money';
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
import { getPaymentReceipt } from '@/lib/payments/payment-receipts-api';
import { paymentReceiptFixture } from '@/lib/test/payment-receipt';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { getPaymentPlan } from '@/lib/payment-plans/payment-plan-api';
import { ITEM_WITHOUT_DISCOUNT, PLAN_WITHOUT_OPTIONS } from './plan-fixture';
import { getPriceQuote, type PriceQuote } from '@/lib/patients/patient-agreement-api';
import { applyBulkDiscount, getDiscountPolicy } from '@/lib/discounts/discounts-api';

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
// DX-204: la política de descuentos. Por defecto no carga (como si fallara):
// el formulario no avisa y decide la API; los tests de descuento la resuelven.
jest.mock('../../lib/discounts/discounts-api', () => ({
  getDiscountPolicy: jest.fn(),
  applyBulkDiscount: jest.fn(),
}));
// DX-105: el precio resuelto del paciente. Por defecto el de catálogo (sin
// convenio); los tests de convenio lo sustituyen.
jest.mock('../../lib/patients/patient-agreement-api', () => ({
  getPriceQuote: jest.fn(),
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
// Recibo de caja (DX-136): el diálogo pide el recibo a la API.
jest.mock('../../lib/payments/payment-receipts-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-receipts-api'),
  getPaymentReceipt: jest.fn(),
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

/** El texto de lo que describe un campo (`aria-describedby`): error y vista previa. */
function describedText(field: HTMLElement): string {
  return (field.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}
const mockedVoidPayment = voidPayment as jest.MockedFunction<typeof voidPayment>;
const mockedGetReceipt = getPaymentReceipt as jest.MockedFunction<typeof getPaymentReceipt>;
const mockedListCurrencies = listCurrencies as jest.MockedFunction<typeof listCurrencies>;
const mockedGetPaymentPlan = getPaymentPlan as jest.MockedFunction<typeof getPaymentPlan>;
const mockedGetDiscountPolicy = getDiscountPolicy as jest.MockedFunction<typeof getDiscountPolicy>;
const mockedGetPriceQuote = getPriceQuote as jest.MockedFunction<typeof getPriceQuote>;
const mockedApplyBulkDiscount = applyBulkDiscount as jest.MockedFunction<typeof applyBulkDiscount>;
const DISCOUNT_POLICY = {
  maxPercentByRole: { ADMIN: 100, DENTIST: 10, ASSISTANT: 0, RECEPTION: 0 },
  reasonRequiredAbovePercent: 10,
  isDefault: true,
  updatedAt: null,
  updatedById: null,
};
const discountDentistToken = `h.${btoa(JSON.stringify({ sub: 'u1', tenantId: 't1', role: 'DENTIST' }))}.s`;
const discountAdminToken = `h.${btoa(JSON.stringify({ sub: 'u2', tenantId: 't1', role: 'ADMIN' }))}.s`;

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
    ...PLAN_WITHOUT_OPTIONS,
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
  discount: 0,
  ...ITEM_WITHOUT_DISCOUNT,
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
  discount: 0,
  ...ITEM_WITHOUT_DISCOUNT,
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
  paidOn: '2026-01-05',
  method: 'CASH',
  notes: null,
  createdById: null,
  createdAt: '2026-01-05T00:00:00.000Z',
  updatedAt: '2026-01-05T00:00:00.000Z',
  receiptNumber: 'PRI-000001',
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

/**
 * La tabla de abonos vive plegada dentro de un `Disclosure` cuando el plan ya
 * tiene abonos: lo que decide si hace falta abrirla —cuántos hay— se lee en la
 * propia fila, y el Saldo sigue arriba. Los tests que miran el detalle abren
 * el pliegue primero.
 */
async function openPaymentsTable(
  user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> {
  const trigger = await screen.findByRole("button", { name: /abonos y saldo/i });
  if (trigger.getAttribute("aria-expanded") === "false") await user.click(trigger);
  return screen.findByRole("table", { name: /abonos del plan de tratamiento/i });
}

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

/** Precio resuelto de ejemplo: por defecto el de catálogo, sin convenio. */
function quoteOf(catalogItemId: string, overrides: Partial<PriceQuote> = {}, currency = 'USD'): PriceQuote {
  const base = catalog.find((c) => c.id === catalogItemId)?.defaultPrice ?? null;
  return {
    basePrice: base,
    price: base,
    source: 'CATALOG',
    agreementId: null,
    agreementName: null,
    allowDiscount: true,
    currency,
    ...overrides,
  };
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
    mockedGetDiscountPolicy.mockReset();
    mockedGetDiscountPolicy.mockRejectedValue(new Error('sin política en este test'));
    mockedApplyBulkDiscount.mockReset();
    mockedGetPriceQuote.mockReset();
    mockedGetPriceQuote.mockImplementation(async (_token, _patientId, { catalogItemId, currency }) =>
      quoteOf(catalogItemId, {}, currency),
    );
    mockedGetPlanBalance.mockReset();
    mockedListPayments.mockReset();
    mockedRecordPayment.mockReset();
    mockedVoidPayment.mockReset();
    mockedGetReceipt.mockReset();
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

  it('DX-191: «Registrar implante» en los ítems aceptados o realizados lleva a Implantes con el ítem y el diente', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    const done = { ...item2, id: 'item-3', toothNumber: '36', status: 'DONE' as const };
    mockedGetPlan.mockResolvedValue({ ...plan1, items: [item1, item2, done], total: 0 });

    render(
      <TreatmentPlansTab
        patientId="pat-1"
        token="tok"
        implantHref={(item) => `/patients/pat-1?tab=implants&registerTooth=${item.toothNumber}&planItem=${item.id}`}
      />,
    );

    const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
    const links = within(table).getAllByRole('link', { name: /^registrar implante/i });
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/patients/pat-1?tab=implants&registerTooth=26&planItem=item-2',
      '/patients/pat-1?tab=implants&registerTooth=36&planItem=item-3',
    ]);
    expect(links[0]).toHaveAccessibleName('Registrar implante en el diente 26');
    // Un ítem solo propuesto (11) aún no se ejecuta: sin acceso directo.
    expect(
      within(table).queryByRole('link', { name: /registrar implante en el diente 11/i }),
    ).not.toBeInTheDocument();
    // La lista móvil ofrece el mismo acceso.
    const mobile = screen.getAllByRole('link', { name: /registrar implante en el diente 36/i });
    expect(mobile).toHaveLength(2);
  });

  it('DX-191: sin `implantHref` (rol que no registra) no hay «Registrar implante»', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);

    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
    expect(screen.queryByRole('link', { name: /registrar implante/i })).not.toBeInTheDocument();
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

    // El procedimiento se elige en el `CatalogPicker` filtrado (radios), el
    // mismo que usa el odontograma — ya no en un `<select>` nativo sobre el
    // catálogo entero.
    const priceInput = screen.getByLabelText<HTMLInputElement>(/^precio$/i);
    expect(priceInput.value).toBe('');

    await user.click(screen.getByRole('radio', { name: /resina/i }));
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

    await user.type(screen.getByLabelText(/código fdi/i), '16');
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

    await user.type(screen.getByLabelText(/código fdi/i), '99');
    await user.click(screen.getByRole('radio', { name: /resina/i }));
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
    // La fila ya no quita directamente: abre la confirmación.
    const confirm = await screen.findByRole('dialog', { name: /quitar este ítem del plan/i });
    expect(mockedRemoveItem).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Quitar ítem' }));

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

  it('cancelling the "quitar ítem" confirmation leaves the item alone — removeItem is never called', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedRemoveItem.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
    const row = within(table).getByText('11').closest('tr') as HTMLTableRowElement;
    await user.click(within(row).getByRole('button', { name: /quitar/i }));

    const confirm = await screen.findByRole('dialog', { name: /quitar este ítem del plan/i });
    // La descripción dice lo que de verdad hace el backend (soft-delete: sale
    // del plan, no se borra de la base de datos) — no promete un deshacer.
    expect(confirm).toHaveTextContent(/no se borra de la base de datos/i);
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedRemoveItem).not.toHaveBeenCalled();
    expect(within(table).getByText('11')).toBeInTheDocument();
  });

  it('cancelling the "anular abono" confirmation leaves the abono alone — voidPayment is never called', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedGetPlanBalance.mockResolvedValue(balance1);
    mockedListPayments.mockResolvedValue([payment1]);
    mockedVoidPayment.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    const paymentsTable = await openPaymentsTable(user);
    const row = within(paymentsTable)
      .getByText(expectedCurrencyText(payment1.amount))
      .closest('tr') as HTMLTableRowElement;
    await user.click(within(row).getByRole('button', { name: /anular/i }));

    const confirm = await screen.findByRole('dialog', { name: /anular este abono/i });
    expect(confirm).toHaveTextContent(/quién lo anuló, cuándo y por qué/i);
    await user.click(within(confirm).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedVoidPayment).not.toHaveBeenCalled();
    expect(within(paymentsTable).getByText(expectedCurrencyText(payment1.amount))).toBeInTheDocument();
  });

  it("changing the plan's status calls updatePlan then refreshes the detail (and the plan list) in place", async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedUpdatePlan.mockResolvedValue({ ...plan1, status: 'CANCELLED' });

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
    await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

    mockedGetPlan.mockResolvedValueOnce({ ...plan1Detail, status: 'CANCELLED' });
    mockedListPlans.mockResolvedValueOnce([{ ...plan1, status: 'CANCELLED' }]);

    const planStatusSelect = screen.getByLabelText<HTMLSelectElement>(/^estado del plan$/i);
    await user.selectOptions(planStatusSelect, 'CANCELLED');

    await waitFor(() =>
      expect(mockedUpdatePlan).toHaveBeenCalledWith('tok', 'plan-1', { status: 'CANCELLED' }),
    );
    await waitFor(() => expect(planStatusSelect.value).toBe('CANCELLED'));
  });

  it('shows the balance figures (A pagar, Pagado, Saldo) formatted in the plan currency, and lists abonos in their own currency', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedGetPlanBalance.mockResolvedValue(balance1);
    mockedListPayments.mockResolvedValue([payment1]);

    const user = userEvent.setup();
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

    const paymentsTable = await openPaymentsTable(user);
    expect(within(paymentsTable).getByText(expectedCurrencyText(payment1.amount))).toBeInTheDocument();
    expect(within(paymentsTable).getByText('Efectivo')).toBeInTheDocument();
  });

  it('DX-097: la fecha por defecto del abono es hoy en la sede, no en el navegador (20:30 en Bogotá = 01:30Z)', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-16T01:30:00.000Z'), advanceTimers: true });
    try {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedGetPlanBalance.mockResolvedValue(balance1);
      mockedListPayments.mockResolvedValue([]);

      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      expect(await screen.findByText('A pagar')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^registrar abono$/i }));

      // Sin la lista de sedes (no se simula aquí), la zona por defecto de la
      // sede (Bogotá): el día es el 15, aunque en UTC ya sea el 16.
      expect(screen.getByLabelText<HTMLInputElement>(/^fecha$/i).value).toBe('2026-10-15');
    } finally {
      jest.useRealTimers();
    }
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
    // DX-097: el día civil, sin hora (la API lo guarda al mediodía de la sede).
    expect(input.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

    const paymentsTable = await openPaymentsTable(user);
    const row = within(paymentsTable)
      .getByText(expectedCurrencyText(payment1.amount))
      .closest('tr') as HTMLTableRowElement;
    const voidButton = within(row).getByRole('button', { name: /anular/i });

    const updatedBalance = { ...balance1, paid: 0, balance: balance1.billable, paymentsCount: 0 };
    mockedGetPlanBalance.mockResolvedValueOnce(updatedBalance);
    mockedListPayments.mockResolvedValueOnce([]);

    await user.click(voidButton);
    // La fila ya no anula directamente: abre la confirmación.
    const confirm = await screen.findByRole('dialog', { name: /anular este abono/i });
    expect(mockedVoidPayment).not.toHaveBeenCalled();
    // paste, no type: teclear tecla a tecla roza el timeout de 5 s aquí.
    await user.click(within(confirm).getByLabelText(/motivo de la anulación/i));
    await user.paste('Cobro duplicado');
    await user.click(within(confirm).getByRole('button', { name: 'Anular abono' }));

    await waitFor(() => expect(mockedVoidPayment).toHaveBeenCalledWith('tok', 'pay-1', 'Cobro duplicado'));
    await waitFor(() => expect(mockedGetPlanBalance).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockedListPayments).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/este plan todavía no tiene abonos/i)).toBeInTheDocument();
  });

  it('cada abono muestra su número de recibo y «Recibo» abre el recibo de caja de ESE abono (DX-136)', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedGetPlanBalance.mockResolvedValue(balance1);
    mockedListPayments.mockResolvedValue([payment1, { ...payment1, id: 'pay-old', receiptNumber: null, amount: 1000 }]);
    mockedGetReceipt.mockResolvedValue(paymentReceiptFixture({ paymentId: 'pay-1', reference: 'PRI-000001' }));

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

    const paymentsTable = await openPaymentsTable(user);
    expect(within(paymentsTable).getByText('PRI-000001')).toBeInTheDocument();
    // Un abono anterior a la numeración no se renumera: «Sin serie».
    expect(within(paymentsTable).getByText('Sin serie')).toBeInTheDocument();
    const row = within(paymentsTable)
      .getByText(expectedCurrencyText(payment1.amount))
      .closest('tr') as HTMLTableRowElement;
    await user.click(within(row).getByRole('button', { name: /^recibo$/i }));

    const dialog = await screen.findByRole('dialog', { name: /recibo de caja/i });
    expect(await within(dialog).findByTestId('receipt-document')).toHaveTextContent('N.º PRI-000001');
    expect(mockedGetReceipt).toHaveBeenCalledWith('tok', 'pay-1');

    await user.click(within(dialog).getAllByRole('button', { name: /^cerrar$/i })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  // Error-states ladder (Task 8): each `text-danger` site classified by what
  // the user can still do — see task-8-report.md for the full table.
  describe('DX-109: planes no cobrables o cerrados', () => {
    it('un plan rechazado deshabilita «Registrar abono» con el motivo, no ofrece plan de cuotas y congela los ítems', async () => {
      const rejected = { ...plan1Detail, status: 'REJECTED' as const };
      mockedListPlans.mockResolvedValue([{ ...plan1, status: 'REJECTED' as const }]);
      mockedGetPlan.mockResolvedValue(rejected);

      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      const payButton = await screen.findByRole('button', { name: /^registrar abono$/i });
      expect(payButton).toBeDisabled();
      expect(payButton).toHaveAccessibleDescription(
        'Este plan está «Rechazado»: no admite abonos ni planes de cuotas.',
      );
      expect(await screen.findByText('Un plan rechazado o cancelado no se financia en cuotas.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /crear plan de pagos/i })).not.toBeInTheDocument();
      // El vacío de abonos no invita a registrar uno.
      expect(await screen.findByText(/este plan todavía no tiene abonos/i)).toBeInTheDocument();
      expect(screen.queryByText(/registra el primer abono/i)).not.toBeInTheDocument();

      expect(
        screen.getByText('Este plan está «Rechazado»: sus ítems ya no se pueden añadir, cambiar ni quitar.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('form', { name: /agregar ítem/i })).not.toBeInTheDocument();
      for (const select of screen.getAllByLabelText(/estado del ítem/i)) {
        expect(select).toBeDisabled();
      }
      expect(screen.queryByRole('button', { name: /^quitar$/i })).not.toBeInTheDocument();
    });

    it('cambiar el estado desde el selector refresca el saldo sin recargar (QA DX-109)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedGetPlanBalance.mockResolvedValue(balance1);
      mockedUpdatePlan.mockResolvedValue({ ...plan1, status: 'CANCELLED' });

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      const billableCard = (await screen.findByText('A pagar')).closest('div') as HTMLElement;
      expect(within(billableCard).getByText(expectedCurrencyText(balance1.billable))).toBeInTheDocument();

      mockedGetPlan.mockResolvedValue({ ...plan1Detail, status: 'CANCELLED' });
      mockedListPlans.mockResolvedValue([{ ...plan1, status: 'CANCELLED' }]);
      mockedGetPlanBalance.mockResolvedValue({ ...balance1, billable: 0, balance: 0 });
      await user.selectOptions(screen.getByLabelText(/^estado del plan$/i), 'CANCELLED');

      await waitFor(() => {
        const card = screen.getByText('A pagar').closest('div') as HTMLElement;
        expect(within(card).getByText(expectedCurrencyText(0))).toBeInTheDocument();
      });
    });

    it('un plan completado sigue cobrando, pero sus ítems quedan congelados', async () => {
      const completed = { ...plan1Detail, status: 'COMPLETED' as const };
      mockedListPlans.mockResolvedValue([{ ...plan1, status: 'COMPLETED' as const }]);
      mockedGetPlan.mockResolvedValue(completed);

      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      expect(await screen.findByRole('button', { name: /^registrar abono$/i })).toBeEnabled();
      expect(await screen.findByRole('button', { name: /crear plan de pagos/i })).toBeInTheDocument();
      expect(screen.queryByRole('form', { name: /agregar ítem/i })).not.toBeInTheDocument();
    });

    it('en un plan completado, un ítem aceptado se puede marcar como realizado (y nada más)', async () => {
      const completed = { ...plan1Detail, status: 'COMPLETED' as const };
      mockedListPlans.mockResolvedValue([{ ...plan1, status: 'COMPLETED' as const }]);
      mockedGetPlan.mockResolvedValue(completed);
      mockedUpdateItem.mockResolvedValue({ ...item2, status: 'DONE' });

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      expect(
        screen.getByText(
          'Este plan está «Completado»: sus ítems ya no se pueden añadir, cambiar ni quitar. Solo puedes marcar como realizado un procedimiento que quedó aceptado.',
        ),
      ).toBeInTheDocument();
      // Propuesto: congelado. Aceptado: solo puede pasar a realizado.
      expect(within(table).getByRole('combobox', { name: /estado del ítem del diente 11/i })).toBeDisabled();
      const accepted = within(table).getByRole<HTMLSelectElement>('combobox', {
        name: /estado del ítem del diente 26/i,
      });
      expect(accepted).toBeEnabled();
      expect(within(accepted).getByRole<HTMLOptionElement>('option', { name: 'Propuesto' }).disabled).toBe(true);
      expect(within(accepted).getByRole<HTMLOptionElement>('option', { name: 'Realizado' }).disabled).toBe(false);

      await user.selectOptions(accepted, 'DONE');
      await waitFor(() =>
        expect(mockedUpdateItem).toHaveBeenCalledWith('tok', 'plan-1', 'item-2', { status: 'DONE' }),
      );
    });
  });

  describe('error states ladder', () => {
    it('cuando no hay planes que mostrar, usa el estado de sección con reintento (escalón 1: loadError)', async () => {
      mockedListPlans.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));

      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('No pudimos cargar los planes de tratamiento.');
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

      const toastText = await screen.findByText('No pudimos actualizar los planes de tratamiento.');
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
      expect(alert).toHaveTextContent('No pudimos crear el plan. Intenta de nuevo.');
    });

    it('el detalle del plan que falla al cargar usa el estado de sección con reintento, y el reintento limpia el error y muestra el contenido (escalón 1: planDetailError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockRejectedValueOnce(new ApiError(500, 'No se pudo cargar el plan'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('No pudimos cargar el plan.');
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
      await user.selectOptions(planStatusSelect, 'CANCELLED');

      const toastText = await screen.findByText('No pudimos actualizar el plan.');
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
      await user.selectOptions(planStatusSelect, 'CANCELLED');

      // Plan 1's background refresh fails — its toast appears, built with an
      // `onRetry` that only bumps `planDetailReloadKey` (see the component's
      // comment on `refreshPlanDetail`'s catch: it re-reads `selectedPlanId`
      // fresh rather than closing over it, precisely so a leftover toast
      // can't replay a stale plan id).
      await screen.findByText('No pudimos actualizar el plan.');
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
      await user.selectOptions(planStatusSelect, 'CANCELLED');

      const alert = await screen.findByText('No pudimos actualizar el estado del plan. Intenta de nuevo.');
      expect(alert.closest('[role="alert"]')).not.toBeNull();
    });

    it('quitar un ítem que falla se muestra dentro del diálogo de confirmación (escalón 4: removeItemError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedRemoveItem.mockRejectedValueOnce(new ApiError(500, 'No se pudo quitar'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      const row = within(table).getByText('11').closest('tr') as HTMLTableRowElement;

      await user.click(within(row).getByRole('button', { name: /quitar/i }));
      const confirm = await screen.findByRole('dialog', { name: /quitar este ítem del plan/i });
      await user.click(within(confirm).getByRole('button', { name: 'Quitar ítem' }));

      const alert = await screen.findByText('No pudimos quitar el ítem. Intenta de nuevo.');
      expect(alert.closest('[role="alert"]')).not.toBeNull();
      // El fallo se queda donde el usuario decidió: el diálogo sigue abierto.
      expect(screen.getByRole('dialog', { name: /quitar este ítem del plan/i })).toBeInTheDocument();
    });

    it('el saldo/abonos que fallan al cargar usan el estado de sección con reintento, y el reintento limpia el error y muestra el contenido (escalón 1: paymentsError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedGetPlanBalance.mockRejectedValueOnce(new ApiError(500, 'No se pudo cargar el saldo'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('No pudimos cargar el saldo.');
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
      const paymentsTable = await openPaymentsTable(user);
      const row = within(paymentsTable)
        .getByText(expectedCurrencyText(payment1.amount))
        .closest('tr') as HTMLTableRowElement;

      await user.click(within(row).getByRole('button', { name: /anular/i }));
      const confirm = await screen.findByRole('dialog', { name: /anular este abono/i });
      // paste, no type: teclear tecla a tecla roza el timeout de 5 s aquí.
      await user.click(within(confirm).getByLabelText(/motivo de la anulación/i));
      await user.paste('Cobro duplicado');
      await user.click(within(confirm).getByRole('button', { name: 'Anular abono' }));

      const toastText = await screen.findByText('No pudimos actualizar el saldo.');
      expect(toastText.closest('[role="alert"]')).toBeNull();
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();

      // Fix round 1: retry must bump `paymentsReloadKey` and genuinely
      // re-fetch, not replay a stale closure.
      mockedGetPlanBalance.mockResolvedValueOnce(balance1);
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(mockedGetPlanBalance).toHaveBeenCalledTimes(3));
    });

    it('anular un abono que falla se muestra dentro del diálogo de confirmación (escalón 4: paymentActionError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedGetPlanBalance.mockResolvedValue(balance1);
      mockedListPayments.mockResolvedValue([payment1]);
      mockedVoidPayment.mockRejectedValueOnce(new ApiError(500, 'No se pudo anular'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      const paymentsTable = await openPaymentsTable(user);
      const row = within(paymentsTable)
        .getByText(expectedCurrencyText(payment1.amount))
        .closest('tr') as HTMLTableRowElement;

      await user.click(within(row).getByRole('button', { name: /anular/i }));
      const confirm = await screen.findByRole('dialog', { name: /anular este abono/i });
      // paste, no type: teclear tecla a tecla roza el timeout de 5 s aquí.
      await user.click(within(confirm).getByLabelText(/motivo de la anulación/i));
      await user.paste('Cobro duplicado');
      await user.click(within(confirm).getByRole('button', { name: 'Anular abono' }));

      // Un 500 no enseña el texto del servidor (puede venir en inglés): la
      // copia genérica en español (DX-057).
      const alert = await screen.findByText('No pudimos anular el abono. Intenta de nuevo.');
      expect(alert.closest('[role="alert"]')).not.toBeNull();
      expect(screen.getByRole('dialog', { name: /anular este abono/i })).toBeInTheDocument();
    });

    it('anular un abono que ya no está activo (404 en inglés de la API) explica en español qué pasó', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedGetPlanBalance.mockResolvedValue(balance1);
      mockedListPayments.mockResolvedValue([payment1]);
      mockedVoidPayment.mockRejectedValueOnce(new ApiError(404, 'Payment not found'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      const paymentsTable = await openPaymentsTable(user);
      const row = within(paymentsTable)
        .getByText(expectedCurrencyText(payment1.amount))
        .closest('tr') as HTMLTableRowElement;

      await user.click(within(row).getByRole('button', { name: /anular/i }));
      const confirm = await screen.findByRole('dialog', { name: /anular este abono/i });
      // paste, no type: teclear tecla a tecla roza el timeout de 5 s aquí.
      await user.click(within(confirm).getByLabelText(/motivo de la anulación/i));
      await user.paste('Cobro duplicado');
      await user.click(within(confirm).getByRole('button', { name: 'Anular abono' }));

      const alert = await within(confirm).findByRole('alert');
      expect(alert).toHaveTextContent(/ya estaba anulado o ya no existe/i);
      expect(alert).not.toHaveTextContent('Payment not found');
    });

    it('agregar un ítem que falla en el backend se muestra en línea junto al formulario (escalón 4: addItemError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedAddItem.mockRejectedValueOnce(new ApiError(400, 'Precio requerido'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      await user.type(screen.getByLabelText(/código fdi/i), '16');
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));

      const alert = await screen.findByText('Precio requerido');
      expect(alert.closest('[role="alert"]')).not.toBeNull();
    });
  });

  describe('presupuesto y aceptación firmada (DX-012)', () => {
    // Token de clínica con rol (solo se leen los claims para decidir qué pintar).
    const dentistToken = `h.${btoa(JSON.stringify({ sub: 'u1', tenantId: 't1', role: 'DENTIST' }))}.s`;
    const signedDetail = {
      ...plan1Detail,
      status: 'ACCEPTED' as const,
      items: [{ ...item1, status: 'ACCEPTED' as const }, item2],
      acceptance: { signerName: 'Ana García', acceptedAt: '2026-10-16T15:30:00.000Z' },
    };

    it('ofrece «Imprimir presupuesto» y «Aceptar con firma» en un plan sin firmar', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue({ ...plan1Detail, acceptance: null });
      render(<TreatmentPlansTab patientId="pat-1" token={dentistToken} />);
      const link = await screen.findByRole('link', { name: /imprimir presupuesto/i });
      expect(link).toHaveAttribute('href', '/print/patients/pat-1/treatment-plans/plan-1');
      expect(screen.getByRole('button', { name: 'Aceptar con firma' })).toBeInTheDocument();
    });

    it('un plan firmado lo dice y congela sus ítems: sin «Quitar», sin «Agregar ítem», sin volver a propuesto ni a borrador', async () => {
      mockedListPlans.mockResolvedValue([{ ...plan1, status: 'ACCEPTED' }]);
      mockedGetPlan.mockResolvedValue(signedDetail);
      render(<TreatmentPlansTab patientId="pat-1" token={dentistToken} />);

      expect(
        await screen.findByText('Aceptado y firmado por Ana García el 16/10/2026 15:30'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Aceptar con firma' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^quitar$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('form', { name: /agregar ítem/i })).not.toBeInTheDocument();
      const [statusSelect] = screen.getAllByLabelText('Estado del ítem del diente 11');
      expect(within(statusSelect).getByRole('option', { name: 'Propuesto' })).toBeDisabled();
      expect(within(statusSelect).getByRole('option', { name: 'Realizado' })).toBeEnabled();
      // Máquina de estados (DX-040): un plan aceptado solo pasa a completado o
      // cancelado; volver a borrador ni se ofrece.
      const planStatus = screen.getByLabelText(/estado del plan/i);
      expect(within(planStatus).queryByRole('option', { name: 'Borrador' })).not.toBeInTheDocument();
      expect(
        within(planStatus)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Aceptado', 'Completado', 'Cancelado']);
    });

    it('el selector de estado solo ofrece transiciones válidas; «Aceptado» solo a quien decide el plan (DX-040)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      const assistantToken = `h.${btoa(JSON.stringify({ sub: 'u2', tenantId: 't1', role: 'ASSISTANT' }))}.s`;
      const { unmount } = render(<TreatmentPlansTab patientId="pat-1" token={dentistToken} />);
      const forDentist = await screen.findByLabelText(/^estado del plan$/i);
      expect(within(forDentist).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Borrador',
        'Aceptado',
        'Cancelado',
      ]);
      expect(screen.getByRole('button', { name: 'Presentar al paciente' })).toBeInTheDocument();
      unmount();

      render(<TreatmentPlansTab patientId="pat-1" token={assistantToken} />);
      const forAssistant = await screen.findByLabelText(/^estado del plan$/i);
      expect(within(forAssistant).getAllByRole('option').map((o) => o.textContent)).toEqual([
        'Borrador',
        'Cancelado',
      ]);
      expect(screen.queryByRole('button', { name: 'Presentar al paciente' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Crear alternativa' })).toBeInTheDocument();
    });

    it('con opciones A/B, el selector las nombra y el detalle las compara (DX-040)', async () => {
      const optionA = { ...plan1, optionGroupId: 'plan-1', optionLabel: 'Opción A: implante', status: 'PRESENTED' as const };
      const optionB = {
        ...plan1,
        id: 'plan-b',
        optionGroupId: 'plan-1',
        optionLabel: 'Opción B: puente',
        status: 'PRESENTED' as const,
      };
      mockedListPlans.mockResolvedValue([optionA, optionB]);
      mockedGetPlan.mockImplementation((_t, id) =>
        Promise.resolve(id === 'plan-b' ? { ...plan1Detail, ...optionB } : { ...plan1Detail, ...optionA }),
      );
      render(<TreatmentPlansTab patientId="pat-1" token={dentistToken} />);
      const select = await screen.findByLabelText<HTMLSelectElement>(/^plan$/i);
      expect(within(select).getAllByRole('option')[1].textContent).toMatch(/Presentado · Opción B: puente$/);
      expect(await screen.findByRole('heading', { name: 'Comparar opciones' })).toBeInTheDocument();
      expect(await screen.findByRole('listitem', { name: 'Opción B: puente' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Marcar rechazado' })).toBeInTheDocument();
    });

    it('el descuento del ítem se envía al agregarlo y se muestra en la fila', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue({
        ...plan1Detail,
        items: [{ ...item1, discount: 5000 }, item2],
        total: plan1Detail.total - 5000,
      });
      mockedAddItem.mockResolvedValue({ ...item1, id: 'item-3' });
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);

      const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      expect(
        within(table).getByText(`Descuento −${expectedCurrencyText(5000)}`),
      ).toBeInTheDocument();

      await user.type(screen.getByLabelText(/código fdi/i), '16');
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      await user.type(screen.getByLabelText(/descuento/i), '2500');
      await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
      await waitFor(() =>
        expect(mockedAddItem).toHaveBeenCalledWith('tok', 'plan-1', {
          toothNumber: '16',
          catalogItemId: 'cat-1',
          discount: 2500,
        }),
      );
    });

    it('un descuento mayor que el precio se rechaza antes de enviar', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      await user.type(screen.getByLabelText(/código fdi/i), '16');
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      await user.type(screen.getByLabelText(/descuento/i), '60000');
      await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
      expect(
        await screen.findByText('El descuento debe ser un monto válido, no mayor que el precio.'),
      ).toBeInTheDocument();
      expect(mockedAddItem).not.toHaveBeenCalled();
    });
    // Revisión DX-241 (2.ª pasada): un precio o descuento ambiguo dice por qué
    // (no un «monto válido» genérico) y no llega a la API.
    it.each([
      ['Precio', 'El precio no se entiende.'],
      ['Descuento (opcional)', 'El descuento no se entiende.'],
    ])('«1.50.0» en «%s» se rechaza con el motivo antes de enviar', async (label, lead) => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      await user.type(screen.getByLabelText(/código fdi/i), '16');
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      const field = screen.getByLabelText(label, { exact: true });
      await user.clear(field);
      await user.type(field, '1.50.0');
      await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
      // QA DX-241 (BUG-1): el motivo va junto al campo, que queda inválido y
      // enlazado al error, como en el resto de formularios de dinero.
      await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
      expect(describedText(field)).toMatch(new RegExp(`${lead} No sabemos leer «1\\.50\\.0»`));
      expect(mockedAddItem).not.toHaveBeenCalled();
      // Al volver a escribir, el error se va.
      await user.type(field, '0');
      expect(field).not.toHaveAttribute('aria-invalid');
    });

    it('«-50» en el descuento y un descuento mayor que el precio marcan el campo «Descuento»', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });

      await user.type(screen.getByLabelText(/código fdi/i), '16');
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      const field = screen.getByLabelText('Descuento (opcional)', { exact: true });
      await user.type(field, '-50');
      await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
      await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
      expect(describedText(field)).toContain(moneyInputCopy.signed);

      await user.clear(field);
      await user.type(field, '60000');
      await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
      await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
      expect(describedText(field)).toContain('El descuento debe ser un monto válido, no mayor que el precio.');
      expect(mockedAddItem).not.toHaveBeenCalled();
    });

    it.each(['1.50.0', '-50', '0'])('«%s» en el monto de «Registrar abono» marca el campo y no envía', async (text) => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedGetPlanBalance.mockResolvedValue(balance1);
      mockedListPayments.mockResolvedValue([]);
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      expect(await screen.findByText('A pagar')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^registrar abono$/i }));
      const field = screen.getByLabelText(/^monto$/i);
      await user.type(field, text);
      await user.click(screen.getByRole('button', { name: /^registrar abono$/i }));
      await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
      const expected =
        text === '1.50.0' ? /No sabemos leer «1\.50\.0»/ : text === '-50' ? /sin signo/ : /Escribe un importe mayor que 0\./;
      expect(describedText(field)).toMatch(expected);
      expect(mockedRecordPayment).not.toHaveBeenCalled();
    });
  });
  describe('tope de descuento por rol y «Descuento %» (DX-204)', () => {
    beforeEach(() => {
      mockedGetPlanBalance.mockResolvedValue(emptyBalance());
      mockedListPayments.mockResolvedValue([]);
      mockedGetPaymentPlan.mockResolvedValue(null);
      mockedListCurrencies.mockResolvedValue([]);
      mockedGetDiscountPolicy.mockResolvedValue(DISCOUNT_POLICY);
    });

    it('un DENTIST no puede agregar un 15 %: aviso en español y no se envía', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={discountDentistToken} />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      await waitFor(() => expect(mockedGetDiscountPolicy).toHaveBeenCalled());

      await user.type(screen.getByLabelText(/código fdi/i), '16');
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      await user.type(screen.getByLabelText(/^descuento/i), '7500');
      await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
      expect(
        await screen.findByText('Tu rol permite hasta un 10 % de descuento por ítem.'),
      ).toBeInTheDocument();
      expect(mockedAddItem).not.toHaveBeenCalled();
    });

    it('por encima del umbral el formulario exige el motivo y lo envía', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedAddItem.mockResolvedValue({ ...item1, id: 'item-3' });
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={discountAdminToken} />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      await waitFor(() => expect(mockedGetDiscountPolicy).toHaveBeenCalled());

      await user.type(screen.getByLabelText(/código fdi/i), '16');
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      await user.type(screen.getByLabelText(/^descuento/i), '10000');
      expect(screen.getByText('Por encima del 10 % el motivo es obligatorio.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
      expect(await screen.findByText('Elige el motivo del descuento.')).toBeInTheDocument();
      expect(mockedAddItem).not.toHaveBeenCalled();

      await user.selectOptions(screen.getByLabelText('Motivo del descuento'), 'LOYALTY');
      await user.type(screen.getByLabelText('Nota del motivo (opcional)'), 'Viene hace 10 años');
      await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
      await waitFor(() =>
        expect(mockedAddItem).toHaveBeenCalledWith(discountAdminToken, 'plan-1', {
          toothNumber: '16',
          catalogItemId: 'cat-1',
          discount: 10000,
          discountReason: 'LOYALTY',
          discountReasonNote: 'Viene hace 10 años',
        }),
      );
    });

    it('«Descuento %» sobre los ítems seleccionados aplica y refresca el plan', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedApplyBulkDiscount.mockResolvedValue({
        items: [
          { ...item1, discount: 2500 },
          { ...item2, discount: 4000 },
        ],
        skippedNoDiscount: 0,
      });
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={discountDentistToken} />);
      const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      await waitFor(() => expect(mockedGetDiscountPolicy).toHaveBeenCalled());

      const bulk = screen.getByRole('button', { name: 'Descuento %' });
      expect(bulk).toBeDisabled();
      await user.click(within(table).getByRole('checkbox', { name: 'Seleccionar el ítem del diente 11' }));
      await user.click(within(table).getByRole('checkbox', { name: 'Seleccionar el ítem del diente 26' }));
      expect(screen.getByText('2 ítems seleccionados')).toBeInTheDocument();
      await user.click(bulk);

      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Porcentaje de descuento'), '5');
      await user.click(within(dialog).getByRole('button', { name: 'Aplicar descuento' }));
      await waitFor(() =>
        expect(mockedApplyBulkDiscount).toHaveBeenCalledWith(discountDentistToken, 'plan-1', {
          itemIds: ['item-1', 'item-2'],
          percent: 5,
        }),
      );
      expect(await screen.findByText('Descuento aplicado a 2 ítems.')).toBeInTheDocument();
      await waitFor(() => expect(mockedGetPlan.mock.calls.length).toBeGreaterThan(1));
    });

    // SEC-041: un precio por debajo del de catálogo cuenta como descuento.
    describe('precio por debajo del de catálogo (SEC-041)', () => {
      async function openForm(token: string) {
        mockedListPlans.mockResolvedValue([plan1]);
        mockedGetPlan.mockResolvedValue(plan1Detail);
        const user = userEvent.setup();
        render(<TreatmentPlansTab patientId="pat-1" token={token} />);
        await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
        await waitFor(() => expect(mockedGetDiscountPolicy).toHaveBeenCalled());
        await user.type(screen.getByLabelText(/código fdi/i), '16');
        // Resina: 50.000 de catálogo, que rellena el precio.
        await user.click(screen.getByRole('radio', { name: /resina/i }));
        return user;
      }

      async function typePrice(user: ReturnType<typeof userEvent.setup>, price: string) {
        const field = screen.getByLabelText('Precio', { exact: true });
        await user.clear(field);
        await user.type(field, price);
      }

      it('avisa bajo el precio y, por encima del umbral, exige el motivo y lo envía sin descuento', async () => {
        mockedAddItem.mockResolvedValue({ ...item1, id: 'item-3' });
        const user = await openForm(discountAdminToken);
        expect(
          screen.queryByText('Precio por debajo del de catálogo: cuenta como descuento.'),
        ).not.toBeInTheDocument();

        await typePrice(user, '40000');
        expect(screen.getByText('Precio por debajo del de catálogo: cuenta como descuento.')).toBeInTheDocument();
        expect(screen.getByText(/Rebaja de 10\.000,00 .* sobre 50\.000,00/)).toBeInTheDocument();
        // 20 % > 10 %: el motivo es obligatorio aunque no haya descuento.
        expect(screen.getByText('Por encima del 10 % el motivo es obligatorio.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
        expect(await screen.findByText('Elige el motivo del descuento.')).toBeInTheDocument();
        expect(mockedAddItem).not.toHaveBeenCalled();

        await user.selectOptions(screen.getByLabelText('Motivo del descuento'), 'PROMOTION');
        await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
        await waitFor(() =>
          expect(mockedAddItem).toHaveBeenCalledWith(discountAdminToken, 'plan-1', {
            toothNumber: '16',
            catalogItemId: 'cat-1',
            price: 40000,
            discountReason: 'PROMOTION',
          }),
        );
      });

      it('un DENTIST no puede bajar más de su 10 %: aviso en español y no se envía', async () => {
        const user = await openForm(discountDentistToken);
        await typePrice(user, '40000');
        await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
        expect(
          await screen.findByText(
            'Precio por debajo del de catálogo: cuenta como descuento. Tu rol permite hasta un 10 % de descuento por ítem.',
          ),
        ).toBeInTheDocument();
        expect(mockedAddItem).not.toHaveBeenCalled();
      });

      it('dentro del tope avisa pero el motivo es opcional; subir el precio no avisa', async () => {
        mockedAddItem.mockResolvedValue({ ...item1, id: 'item-3' });
        const user = await openForm(discountDentistToken);
        await typePrice(user, '60000');
        expect(
          screen.queryByText('Precio por debajo del de catálogo: cuenta como descuento.'),
        ).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/motivo del descuento/i)).not.toBeInTheDocument();

        await typePrice(user, '47500');
        expect(screen.getByText('Precio por debajo del de catálogo: cuenta como descuento.')).toBeInTheDocument();
        expect(screen.getByLabelText('Motivo del descuento (opcional)')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
        await waitFor(() =>
          expect(mockedAddItem).toHaveBeenCalledWith(discountDentistToken, 'plan-1', {
            toothNumber: '16',
            catalogItemId: 'cat-1',
            price: 47500,
          }),
        );
      });

      it('el 403 de la API se enseña en español, con su texto', async () => {
        mockedAddItem.mockRejectedValueOnce(
          new ApiError(
            403,
            'Precio por debajo del de catálogo: cuenta como descuento. Tu rol permite hasta un 0 % de descuento por ítem.',
          ),
        );
        const user = await openForm(discountAdminToken);
        await typePrice(user, '49000');
        await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
        expect(
          await screen.findByText(
            'Precio por debajo del de catálogo: cuenta como descuento. Tu rol permite hasta un 0 % de descuento por ítem.',
          ),
        ).toBeInTheDocument();
      });

      it('el ítem con el precio rebajado muestra el de catálogo y la rebaja', async () => {
        const reduced = { ...item1, catalogPrice: 60000, discountReason: 'LOYALTY' as const };
        mockedListPlans.mockResolvedValue([plan1]);
        mockedGetPlan.mockResolvedValue({ ...plan1Detail, items: [reduced, item2] });
        render(<TreatmentPlansTab patientId="pat-1" token={discountAdminToken} />);
        const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
        expect(within(table).getByText(/Rebaja −10\.000,00 .* \(catálogo 60\.000,00/)).toBeInTheDocument();
        expect(within(table).getByText('Motivo: Paciente frecuente')).toBeInTheDocument();
      });
    });

    it('un presupuesto aceptado no ofrece casillas ni «Descuento %»', async () => {
      const accepted = { ...plan1Detail, status: 'ACCEPTED' as const };
      mockedListPlans.mockResolvedValue([{ ...plan1, status: 'ACCEPTED' as const }]);
      mockedGetPlan.mockResolvedValue(accepted);
      render(<TreatmentPlansTab patientId="pat-1" token={discountAdminToken} />);
      const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Descuento %' })).not.toBeInTheDocument();
      expect(
        screen.getByText('El presupuesto está aceptado: sus descuentos ya no se pueden cambiar.'),
      ).toBeInTheDocument();
    });
  });

  // DX-105: el precio sale del convenio del paciente; la web lo precarga y
  // solo manda `price` si el usuario lo tocó.
  describe('precio resuelto por convenio (DX-105)', () => {
    const agreementQuote = (overrides: Partial<PriceQuote> = {}) =>
      quoteOf(
        'cat-1',
        {
          price: 40000,
          basePrice: 50000,
          source: 'AGREEMENT_PERCENT',
          agreementId: 'ag-1',
          agreementName: 'Seguros Sol',
          ...overrides,
        },
        'USD',
      );

    async function openForm() {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      await user.type(screen.getByLabelText(/código fdi/i), '16');
      return user;
    }

    const submit = () => screen.getByRole('button', { name: /^agregar ítem$/i });

    it('pide el precio del paciente para la prestación, lo precarga y dice de dónde sale', async () => {
      mockedGetPriceQuote.mockResolvedValue(agreementQuote());
      const user = await openForm();
      await user.click(screen.getByRole('radio', { name: /resina/i }));

      await waitFor(() =>
        expect(mockedGetPriceQuote).toHaveBeenCalledWith('tok', 'pat-1', {
          catalogItemId: 'cat-1',
          currency: 'USD',
        }),
      );
      const price = screen.getByLabelText<HTMLInputElement>(/^precio$/i);
      await waitFor(() => expect(price.value).toBe('40000'));
      expect(await screen.findByText(/Convenio · Seguros Sol · precio de lista 50\.000,00/)).toBeInTheDocument();
    });

    it('la línea de origen queda atada al campo de precio (aria-describedby)', async () => {
      mockedGetPriceQuote.mockResolvedValue(agreementQuote());
      const user = await openForm();
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      const line = await screen.findByText(/Convenio · Seguros Sol · precio de lista/);
      const price = screen.getByLabelText(/^precio$/i);
      expect(line.id).toBeTruthy();
      expect(price.getAttribute('aria-describedby')?.split(' ')).toContain(line.id);
    });

    it('mientras llega el precio el campo está en espera y no se puede agregar', async () => {
      let resolve!: (q: PriceQuote) => void;
      mockedGetPriceQuote.mockReturnValue(new Promise<PriceQuote>((r) => (resolve = r)));
      const user = await openForm();
      await user.click(screen.getByRole('radio', { name: /resina/i }));

      expect(screen.getByLabelText(/^precio$/i)).toBeDisabled();
      expect(screen.getByText('Calculando el precio…')).toBeInTheDocument();
      expect(submit()).toBeDisabled();

      resolve(agreementQuote());
      await waitFor(() => expect(screen.getByLabelText(/^precio$/i)).toBeEnabled());
      expect(submit()).toBeEnabled();
    });

    it('sin tocar el precio precargado, no lo envía: lo resuelve la API', async () => {
      mockedGetPriceQuote.mockResolvedValue(agreementQuote());
      mockedAddItem.mockResolvedValue({ ...item1, id: 'item-3' });
      const user = await openForm();
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>(/^precio$/i).value).toBe('40000'));
      await user.click(submit());

      await waitFor(() =>
        expect(mockedAddItem).toHaveBeenCalledWith('tok', 'plan-1', { toothNumber: '16', catalogItemId: 'cat-1' }),
      );
    });

    it('si el usuario cambia el precio, lo envía', async () => {
      mockedGetPriceQuote.mockResolvedValue(agreementQuote());
      mockedAddItem.mockResolvedValue({ ...item1, id: 'item-3' });
      const user = await openForm();
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      const price = screen.getByLabelText<HTMLInputElement>(/^precio$/i);
      await waitFor(() => expect(price.value).toBe('40000'));
      await user.clear(price);
      await user.type(price, '45000');
      await user.click(submit());

      await waitFor(() =>
        expect(mockedAddItem).toHaveBeenCalledWith('tok', 'plan-1', {
          toothNumber: '16',
          catalogItemId: 'cat-1',
          price: 45000,
        }),
      );
    });

    it('sin precio resuelto (null) el campo queda vacío y lo que se escribe se envía', async () => {
      mockedGetPriceQuote.mockResolvedValue(agreementQuote({ price: null, basePrice: null, source: 'CATALOG' }));
      mockedAddItem.mockResolvedValue({ ...item1, id: 'item-3' });
      const user = await openForm();
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      const price = screen.getByLabelText<HTMLInputElement>(/^precio$/i);
      await waitFor(() => expect(price).toBeEnabled());
      expect(price.value).toBe('');
      await user.type(price, '30000');
      await user.click(submit());

      await waitFor(() =>
        expect(mockedAddItem).toHaveBeenCalledWith('tok', 'plan-1', {
          toothNumber: '16',
          catalogItemId: 'cat-1',
          price: 30000,
        }),
      );
    });

    it('si falla el precio resuelto: aviso con reintento, campo editable y precio de catálogo', async () => {
      mockedGetPriceQuote.mockRejectedValueOnce(new Error('boom'));
      mockedAddItem.mockResolvedValue({ ...item1, id: 'item-3' });
      const user = await openForm();
      await user.click(screen.getByRole('radio', { name: /resina/i }));

      expect(await screen.findByText('No pudimos traer el precio')).toBeInTheDocument();
      const price = screen.getByLabelText<HTMLInputElement>(/^precio$/i);
      expect(price).toBeEnabled();
      expect(price.value).toBe('50000');

      // El fallo de vista previa no convierte el catálogo en un precio manual:
      // la API debe resolver el convenio al crear el ítem.
      await user.click(submit());
      await waitFor(() =>
        expect(mockedAddItem).toHaveBeenCalledWith('tok', 'plan-1', {
          toothNumber: '16',
          catalogItemId: 'cat-1',
        }),
      );
    });

    it('«Reintentar» vuelve a pedir el precio y lo precarga', async () => {
      mockedGetPriceQuote.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(agreementQuote());
      const user = await openForm();
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      await user.click(await screen.findByRole('button', { name: /reintentar/i }));

      await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>(/^precio$/i).value).toBe('40000'));
      expect(screen.queryByText('No pudimos traer el precio')).not.toBeInTheDocument();
    });

    it('una prestación sin descuentos bloquea el campo de descuento y rechaza un precio por debajo', async () => {
      mockedGetPriceQuote.mockResolvedValue(agreementQuote({ allowDiscount: false }));
      const user = await openForm();
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      const price = screen.getByLabelText<HTMLInputElement>(/^precio$/i);
      await waitFor(() => expect(price.value).toBe('40000'));

      const discount = screen.getByLabelText(/^descuento/i);
      expect(discount).toBeDisabled();
      const hint = screen.getByText('Esta prestación no admite descuentos.');
      expect(hint.id).toBeTruthy();
      expect(discount.getAttribute('aria-describedby')?.split(' ')).toContain(hint.id);

      await user.clear(price);
      await user.type(price, '35000');
      await user.click(submit());
      // El mismo texto, ahora también como error del campo de precio.
      await waitFor(() => expect(screen.getAllByText('Esta prestación no admite descuentos.')).toHaveLength(2));
      expect(price).toHaveAttribute('aria-invalid', 'true');
      expect(mockedAddItem).not.toHaveBeenCalled();
    });

    it('una prestación sin descuentos admite subir el precio', async () => {
      mockedGetPriceQuote.mockResolvedValue(agreementQuote({ allowDiscount: false }));
      mockedAddItem.mockResolvedValue({ ...item1, id: 'item-3' });
      const user = await openForm();
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      const price = screen.getByLabelText<HTMLInputElement>(/^precio$/i);
      await waitFor(() => expect(price.value).toBe('40000'));
      await user.clear(price);
      await user.type(price, '42000');
      await user.click(submit());

      await waitFor(() => expect(mockedAddItem).toHaveBeenCalled());
    });

    it('el ítem con convenio muestra «Convenio X · precio de lista»', async () => {
      const withAgreement = {
        ...item1,
        catalogPrice: 40000,
        basePrice: 50000,
        priceSource: 'AGREEMENT_PERCENT' as const,
        agreementId: 'ag-1',
        agreementName: 'Seguros Sol',
      };
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue({ ...plan1Detail, items: [withAgreement, item2] });
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      expect(within(table).getByText(/Convenio Seguros Sol · precio de lista 50\.000,00/)).toBeInTheDocument();
    });

    it('un ítem con convenio y descuento muestra la línea del convenio Y la del descuento', async () => {
      const both = {
        ...item1,
        catalogPrice: 40000,
        basePrice: 50000,
        discount: 2000,
        priceSource: 'AGREEMENT_PERCENT' as const,
        agreementId: 'ag-1',
        agreementName: 'Seguros Sol',
      };
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue({ ...plan1Detail, items: [both, item2] });
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      expect(within(table).getByText(/Convenio Seguros Sol · precio de lista 50\.000,00/)).toBeInTheDocument();
      expect(within(table).getByText(/Descuento −2000,00/)).toBeInTheDocument();
    });

    it('el ítem con lista de precios de la sede lo dice solo si el precio de lista difiere', async () => {
      const fromList = {
        ...item1,
        catalogPrice: 45000,
        basePrice: 50000,
        priceSource: 'PRICE_LIST' as const,
      };
      const sameAsList = { ...item2, catalogPrice: 80000, basePrice: 80000, priceSource: 'PRICE_LIST' as const };
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue({ ...plan1Detail, items: [fromList, sameAsList] });
      render(<TreatmentPlansTab patientId="pat-1" token="tok" />);
      const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      expect(within(table).getAllByText(/Lista de precios de la sede · precio de lista/)).toHaveLength(1);
    });

    it('«Descuento %» avisa cuántas prestaciones no admiten descuento y se dejaron igual', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedGetDiscountPolicy.mockResolvedValue(DISCOUNT_POLICY);
      mockedApplyBulkDiscount.mockResolvedValue({ items: [{ ...item1, discount: 2500 }], skippedNoDiscount: 2 });
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={discountDentistToken} />);
      const table = await screen.findByRole('table', { name: /ítems del plan de tratamiento/i });
      await waitFor(() => expect(mockedGetDiscountPolicy).toHaveBeenCalled());
      await user.click(within(table).getByRole('checkbox', { name: 'Seleccionar el ítem del diente 11' }));
      await user.click(screen.getByRole('button', { name: 'Descuento %' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Porcentaje de descuento'), '5');
      await user.click(within(dialog).getByRole('button', { name: 'Aplicar descuento' }));

      expect(
        await screen.findByText('Descuento aplicado a 1 ítem. 2 prestaciones no admiten descuento y se dejaron igual.'),
      ).toBeInTheDocument();
    });
  });
});
