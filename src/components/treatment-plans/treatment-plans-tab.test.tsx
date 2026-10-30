import { moneyInputCopy } from '@/lib/format/money';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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
import {
  BALANCE_WITHOUT_ALLOCATIONS,
  ITEM_WITHOUT_DISCOUNT,
  PAYMENT_IN_PLAN_CURRENCY,
  PLAN_WITHOUT_OPTIONS,
} from './plan-fixture';
import { withoutRateCopy } from '@/components/payments/without-rate-notice';
import { paymentRateCopy } from '@/lib/payments/payment-rate';
import { getPriceQuote, type PriceQuote } from '@/lib/patients/patient-agreement-api';
import { applyBulkDiscount, getDiscountPolicy } from '@/lib/discounts/discounts-api';
import { listStaff } from '@/lib/appointments/staff-api';
import { voidCancellationFee } from '@/lib/cancellations/cancellation-fee-api';
import { getPaymentAllocations, replacePaymentAllocations } from '@/lib/payments/payment-allocations-api';
import { presentPlan } from '@/lib/treatment-plans/plan-options-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching odontogram-tab.test.tsx's / agenda-view.test.tsx's
// convention.
// DX-256: la disponibilidad de visitas es una lectura del hijo, aislada de los fallos del detalle.
jest.mock('../../lib/treatment-plans/plan-visits-api', () => ({
  getPlanVisits: jest.fn().mockResolvedValue({planId:'plan-1',items:[],visitIntervals:{},visits:[]}),
  updatePlanVisits: jest.fn(),
}));
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
// SEC-050: «Anular cargo» del ítem de un cargo por inasistencia.
jest.mock('../../lib/cancellations/cancellation-fee-api', () => ({
  ...jest.requireActual('../../lib/cancellations/cancellation-fee-api'),
  voidCancellationFee: jest.fn(),
}));
jest.mock('../../lib/payments/payments-api', () => ({
  getPlanBalance: jest.fn(),
  listPayments: jest.fn(),
  recordPayment: jest.fn(),
  voidPayment: jest.fn(),
}));
// DX-051: la imputación de un abono (modal «Imputar abono», solo ADMIN).
// Una sede en Bogotá (fixture explícito): la fecha por defecto del abono es su «hoy».
jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/locations').clinicLocation()]),
}));
jest.mock('../../lib/payments/payment-allocations-api', () => ({
  getPaymentAllocations: jest.fn(),
  replacePaymentAllocations: jest.fn(),
}));
// DX-040: presentar un plan (DX-051: tras hacerlo también se relee el saldo).
jest.mock('../../lib/treatment-plans/plan-options-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-options-api'),
  presentPlan: jest.fn(),
}));
// DX-050: los profesionales que pueden figurar como quien realizó un ítem.
jest.mock('../../lib/appointments/staff-api', () => ({
  listStaff: jest.fn(),
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
/**
 * Token por defecto de la suite: RECEPTION, un rol de cobro (DX-051: saldo y
 * abonos solo se piden y se pintan para ADMIN y RECEPTION).
 */
const tok = `h.${btoa(JSON.stringify({ sub: 'u-recep', tenantId: 't1', role: 'RECEPTION' }))}.s`;
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
  visit: 1,
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
  visit: 1,
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
  openingBalanceId: null,
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
  ...PAYMENT_IN_PLAN_CURRENCY,
};

const balance1: PlanBalance = {
  planCurrency: 'USD',
  billable: 130000,
  paid: 50000,
  balance: 80000,
  paymentsCount: 1,
  ...BALANCE_WITHOUT_ALLOCATIONS,
};

/** Empty balance/payments — the default for tests that don't exercise the abonos block. */
function emptyBalance(): PlanBalance {
  return { planCurrency: 'USD', billable: 0, paid: 0, balance: 0, paymentsCount: 0, ...BALANCE_WITHOUT_ALLOCATIONS };
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
    jest.mocked(listStaff).mockReset();
    jest.mocked(listStaff).mockResolvedValue([
      { userId: 'u-laura', fullName: 'Dra. Laura Gómez', role: 'DENTIST', locationIds: null },
      { userId: 'u-asis', fullName: 'Ana Asistente', role: 'ASSISTANT', locationIds: null },
    ]);
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
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

    expect(await screen.findByText(/todavía no tiene un plan de tratamiento/i)).toBeInTheDocument();

    // The "Nuevo plan" currency select has no adjacent <label> (it sits next
    // to the button, not in a FormField) — must still be reachable by its
    // accessible name (WCAG 4.1.2, via CurrencySelect's `ariaLabel`).
    expect(screen.getByLabelText(/moneda del nuevo plan/i)).toHaveDisplayValue(/./);

    await user.click(screen.getByRole('button', { name: /nuevo plan/i }));

    // GLOBAL-G1 (R14): sin sede activa, la moneda común de la clínica (la del
    // fixture de sede, COP), nunca USD por defecto.
    await waitFor(() =>
      expect(mockedCreatePlan).toHaveBeenCalledWith(tok, 'pat-1', { currency: 'COP' }),
    );
    await waitFor(() => expect(mockedListPlans).toHaveBeenCalledTimes(2));
    // The new plan is auto-selected -> its (empty) detail is fetched.
    await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledWith(tok, 'plan-new'));
    expect(await screen.findByText(/este plan todavía no tiene ítems/i)).toBeInTheDocument();
  });

  it("renders a plan's items with the total equal to the sum of the items' prices", async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);

    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

    const table = await screen.findByRole('table', { name: /ítems de la visita/i });
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
        token={tok}
        implantHref={(item) => `/patients/pat-1?tab=implants&registerTooth=${item.toothNumber}&planItem=${item.id}`}
      />,
    );

    const table = await screen.findByRole('table', { name: /ítems de la visita/i });
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

  it('DX-291: el ítem sin diente (cargo administrativo) dice «Sin diente», sin caras ni implante ni odontograma', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    const fee = { ...item2, id: 'item-fee', toothNumber: '', surfaces: [], status: 'DONE' as const };
    mockedGetPlan.mockResolvedValue({ ...plan1, items: [fee], total: fee.price });

    render(
      <TreatmentPlansTab
        patientId="pat-1"
        token={tok}
        implantHref={(item) => `/patients/pat-1?tab=implants&registerTooth=${item.toothNumber}&planItem=${item.id}`}
        odontogramHref={(tooth) => `/patients/pat-1?tab=odontogram&tooth=${tooth}`}
      />,
    );

    const table = await screen.findByRole('table', { name: /ítems de la visita/i });
    expect(within(table).getByText('Sin diente')).toBeInTheDocument();
    expect(within(table).queryByText('Diente completo')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /registrar implante/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /odontograma/i })).not.toBeInTheDocument();
  });

  it('DX-191: sin `implantHref` (rol que no registra) no hay «Registrar implante»', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);

    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

    await screen.findByRole('table', { name: /ítems de la visita/i });
    expect(screen.queryByRole('link', { name: /registrar implante/i })).not.toBeInTheDocument();
  });

  it("falls back to the raw catalogItemId when the item's procedure isn't in the catalog map", async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    const orphanItem = { ...item1, id: 'item-orphan', catalogItemId: 'cat-missing' };
    mockedGetPlan.mockResolvedValue({ ...plan1, items: [orphanItem], total: orphanItem.price });

    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

    const table = await screen.findByRole('table', { name: /ítems de la visita/i });
    expect(within(table).getByText('cat-missing')).toBeInTheDocument();
  });

  it("prefills the price with the selected procedure's catalog defaultPrice, staying editable", async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

    await screen.findByRole('table', { name: /ítems de la visita/i });

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
      expect(mockedAddItem).toHaveBeenCalledWith(tok, 'plan-1', {
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
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
    await screen.findByRole('table', { name: /ítems de la visita/i });

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
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

    const table = await screen.findByRole('table', { name: /ítems de la visita/i });
    const statusSelect = within(table).getByRole<HTMLSelectElement>('combobox', {
      name: /estado del ítem del diente 11/i,
    });
    expect(statusSelect.value).toBe('PROPOSED');
    expect(statusSelect).not.toBeDisabled();

    await user.selectOptions(statusSelect, 'ACCEPTED');

    await waitFor(() =>
      expect(mockedUpdateItem).toHaveBeenCalledWith(tok, 'plan-1', 'item-1', { status: 'ACCEPTED' }),
    );
    // The refresh-in-place fetch has started (2nd getPlan call pending on
    // `refetch`) — same mounted table node, and the row stays disabled while
    // its own refresh is in flight (it must NOT re-enable just because the
    // PATCH itself settled).
    await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('table', { name: /ítems de la visita/i })).toBe(table);
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
    expect(screen.getByRole('table', { name: /ítems de la visita/i })).toBe(table);
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
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

    const table = await screen.findByRole('table', { name: /ítems de la visita/i });
    const row = within(table).getByText('11').closest('tr') as HTMLTableRowElement;
    const removeButton = within(row).getByRole('button', { name: /quitar/i });

    await user.click(removeButton);
    // La fila ya no quita directamente: abre la confirmación.
    const confirm = await screen.findByRole('dialog', { name: /quitar este ítem del plan/i });
    expect(mockedRemoveItem).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Quitar ítem' }));

    await waitFor(() => expect(mockedRemoveItem).toHaveBeenCalledWith(tok, 'plan-1', 'item-1'));
    await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledTimes(2));
    // Still the same table node while the refetch is pending — no remount.
    expect(screen.getByRole('table', { name: /ítems de la visita/i })).toBe(table);
    expect(within(row).getByRole('button', { name: /quitando/i })).toBeDisabled();

    refetch.resolve({ ...plan1Detail, items: [item2], total: item2.price });

    await waitFor(() => expect(within(table).queryByText('11')).not.toBeInTheDocument());
    expect(screen.getByRole('table', { name: /ítems de la visita/i })).toBe(table);
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
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

    const table = await screen.findByRole('table', { name: /ítems de la visita/i });
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

  // DX-375: cada abono en otra moneda dice con qué tasa se congeló, o que
  // sigue «sin tasa».
  it('cada abono en otra moneda enseña su tasa congelada o «Sin tasa»', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedGetPlanBalance.mockResolvedValue(balance1);
    mockedListPayments.mockResolvedValue([
      {
        ...payment1,
        id: 'pay-cop',
        amount: 200000,
        currency: 'COP',
        exchangeRateCurrency: 'USD',
        exchangeRateStatus: 'FROZEN',
        frozenRate: {
          currency: 'USD',
          fromPerBase: 4000,
          toPerBase: 1,
          source: 'MANUAL',
          date: '2026-01-05',
        },
      },
      {
        ...payment1,
        id: 'pay-ves',
        amount: 365,
        currency: 'VES',
        exchangeRateCurrency: 'USD',
        exchangeRateStatus: 'MISSING',
      },
    ]);

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
    const paymentsTable = await openPaymentsTable(user);

    expect(
      // DX-378: con el formato de la sede (es-CO del fixture) y el código ISO.
      await within(paymentsTable).findByText(/Tasa congelada: 1 USD = COP\s4\.000,00 · manual · 05\/01\/2026/),
    ).toBeInTheDocument();
    expect(within(paymentsTable).getByText(paymentRateCopy.missing)).toBeInTheDocument();
  });

  it('cancelling the "anular abono" confirmation leaves the abono alone — voidPayment is never called', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedGetPlanBalance.mockResolvedValue(balance1);
    mockedListPayments.mockResolvedValue([payment1]);
    mockedVoidPayment.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

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
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
    await screen.findByRole('table', { name: /ítems de la visita/i });

    mockedGetPlan.mockResolvedValueOnce({ ...plan1Detail, status: 'CANCELLED' });
    mockedListPlans.mockResolvedValueOnce([{ ...plan1, status: 'CANCELLED' }]);

    const planStatusSelect = screen.getByLabelText<HTMLSelectElement>(/^estado del plan$/i);
    await user.selectOptions(planStatusSelect, 'CANCELLED');

    await waitFor(() =>
      expect(mockedUpdatePlan).toHaveBeenCalledWith(tok, 'plan-1', { status: 'CANCELLED' }),
    );
    await waitFor(() => expect(planStatusSelect.value).toBe('CANCELLED'));
  });

  it('shows the balance figures (A pagar, Pagado, Saldo) formatted in the plan currency, and lists abonos in their own currency', async () => {
    mockedListPlans.mockResolvedValue([plan1]);
    mockedGetPlan.mockResolvedValue(plan1Detail);
    mockedGetPlanBalance.mockResolvedValue(balance1);
    mockedListPayments.mockResolvedValue([payment1]);

    const user = userEvent.setup();
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
    await screen.findByRole('table', { name: /ítems de la visita/i });

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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });
      expect(await screen.findByText('A pagar')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^registrar abono$/i }));

      // La sede del fixture está en Bogotá: el día es el 15, aunque en UTC ya
      // sea el 16.
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
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
    await screen.findByRole('table', { name: /ítems de la visita/i });
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
    expect(tokenArg).toBe(tok);
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
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

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

    await waitFor(() => expect(mockedVoidPayment).toHaveBeenCalledWith(tok, 'pay-1', 'Cobro duplicado'));
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
    render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

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
    expect(mockedGetReceipt).toHaveBeenCalledWith(tok, 'pay-1');

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

      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });

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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });
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

      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });

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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });

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
      // DX-050: antes, quién lo realizó (la única que atiende viene elegida).
      const dialog = await screen.findByRole('dialog', { name: 'Marcar como realizado' });
      await waitFor(() =>
        expect(within(dialog).getByRole('combobox', { name: 'Profesional que lo realizó' })).toHaveValue('u-laura'),
      );
      expect(mockedUpdateItem).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Marcar realizado' }));
      await waitFor(() =>
        expect(mockedUpdateItem).toHaveBeenCalledWith(tok, 'plan-1', 'item-2', {
          status: 'DONE',
          performedById: 'u-laura',
        }),
      );
    });
  });

  describe('SEC-050 · ítem de un cargo por inasistencia', () => {
    const adminToken = `h.${btoa(JSON.stringify({ sub: 'u-admin', tenantId: 't1', role: 'ADMIN' }))}.s`;
    const dentistToken = `h.${btoa(JSON.stringify({ sub: 'u-den', tenantId: 't1', role: 'DENTIST' }))}.s`;
    const feeItem: TreatmentPlanItem = {
      ...item1,
      id: 'item-fee',
      toothNumber: '',
      status: 'DONE',
      cancellationFeeAppointmentId: 'appt-1',
    };
    const feePlan = { ...plan1, status: 'ACCEPTED' as const, optionLabel: 'Cargos administrativos' };

    function renderFeePlan(token: string) {
      mockedListPlans.mockResolvedValue([feePlan]);
      mockedGetPlan.mockResolvedValue({ ...feePlan, items: [feeItem, item2], total: feeItem.price + item2.price });
      render(<TreatmentPlansTab patientId="pat-1" token={token} />);
    }

    it.each([
      ['DENTIST', dentistToken],
      ['ADMIN', adminToken],
    ])('%s: sin «Quitar» ni cambio de estado en el ítem del cargo; el ítem normal, como hoy', async (_role, token) => {
      renderFeePlan(token);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      const rows = within(table).getAllByRole('row').slice(1);
      const feeRow = rows.find((r) => within(r).queryByText(/Cargo por inasistencia/))!;
      const normalRow = rows.find((r) => r !== feeRow)!;
      expect(within(feeRow).queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument();
      expect(within(feeRow).getByRole('combobox')).toBeDisabled();
      expect(within(normalRow).getByRole('button', { name: 'Quitar' })).toBeInTheDocument();
      expect(within(normalRow).getByRole('combobox')).toBeEnabled();
      // La lista móvil tampoco lo ofrece: un solo «Quitar» (el del ítem normal) por vista.
      expect(screen.getAllByRole('button', { name: 'Quitar' })).toHaveLength(2);
    });

    it('DENTIST no ve «Anular cargo»', async () => {
      renderFeePlan(dentistToken);
      await screen.findByRole('table', { name: /ítems de la visita/i });
      expect(screen.queryByRole('button', { name: /Anular cargo/ })).not.toBeInTheDocument();
    });

    it('un solo cargo: «Anular cargo» nombra el ítem y el importe, sin numeración (DX-343)', async () => {
      renderFeePlan(adminToken);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      const action = within(table).getByRole('button', { name: /Anular cargo/ });
      expect(action).toHaveAccessibleName(/^Anular cargo: Resina, .*50\.000/);
      expect(screen.queryByText(/^Cargo 1 de/)).not.toBeInTheDocument();
    });

    it('varios cargos iguales: cada «Anular cargo» tiene un nombre único que coincide con su fila (DX-343)', async () => {
      const second = { ...feeItem, id: 'item-fee-2', cancellationFeeAppointmentId: 'appt-2' };
      mockedListPlans.mockResolvedValue([feePlan]);
      mockedGetPlan.mockResolvedValue({ ...feePlan, items: [feeItem, second], total: feeItem.price * 2 });
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      const rows = within(table).getAllByRole('row').slice(1);
      expect(within(rows[0]).getByRole('button', { name: /Anular cargo/ })).toHaveAccessibleName(
        /^Anular cargo 1 de 2: Resina, .*50\.000/,
      );
      expect(within(rows[0]).getByText('Cargo 1 de 2')).toBeInTheDocument();
      expect(within(rows[1]).getByRole('button', { name: /Anular cargo/ })).toHaveAccessibleName(
        /^Anular cargo 2 de 2: Resina, .*50\.000/,
      );
      expect(within(rows[1]).getByText('Cargo 2 de 2')).toBeInTheDocument();
      // Las tarjetas (móvil) dicen lo mismo: dos nombres por cargo, uno por vista.
      const names = screen.getAllByRole('button', { name: /Anular cargo/ }).map((b) => b.getAttribute('aria-label'));
      expect(new Set(names).size).toBe(2);
      expect(names.some((name) => name?.includes('item-fee'))).toBe(false);
    });

    it('«Cargo n de N» sigue el orden en pantalla (visita a visita), no el de los ítems (DX-343)', async () => {
      // El primer cargo de `items` se movió a la visita 2: en pantalla va segundo.
      const movedFirst = { ...feeItem, visit: 2 };
      const second = { ...feeItem, id: 'item-fee-2', cancellationFeeAppointmentId: 'appt-2', visit: 1 };
      mockedListPlans.mockResolvedValue([feePlan]);
      mockedGetPlan.mockResolvedValue({ ...feePlan, items: [movedFirst, second], total: feeItem.price * 2 });
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      const visit1 = await screen.findByRole('table', { name: 'Ítems de la visita 1' });
      const visit2 = screen.getByRole('table', { name: 'Ítems de la visita 2' });
      expect(within(visit1).getByText('Cargo 1 de 2')).toBeInTheDocument();
      expect(within(visit1).getByRole('button', { name: /Anular cargo/ })).toHaveAccessibleName(/^Anular cargo 1 de 2:/);
      expect(within(visit2).getByText('Cargo 2 de 2')).toBeInTheDocument();
      expect(within(visit2).getByRole('button', { name: /Anular cargo/ })).toHaveAccessibleName(/^Anular cargo 2 de 2:/);
    });

    it('cada tabla nombra su visita y ninguna repite el encabezado de los ítems (DX-343)', async () => {
      mockedListPlans.mockResolvedValue([feePlan]);
      mockedGetPlan.mockResolvedValue({
        ...feePlan,
        items: [feeItem, { ...item2, visit: 2 }],
        total: feeItem.price + item2.price,
      });
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      await screen.findByRole('table', { name: 'Ítems de la visita 1' });
      const heading = screen.getByRole('heading', { name: 'Ítems del plan de tratamiento' });
      const names = screen.getAllByRole('table').map((t) => t.querySelector('caption')?.textContent);
      expect(names).toEqual(expect.arrayContaining(['Ítems de la visita 1', 'Ítems de la visita 2']));
      expect(names).not.toContain(heading.textContent);
    });

    it('tras un 409, si releer el plan falla, los ítems ceden su sitio al error de sección y Reintentar los trae (DX-343)', async () => {
      const fresh = { ...feePlan, items: [item2], total: item2.price };
      mockedListPlans.mockResolvedValue([feePlan]);
      mockedGetPlan
        .mockResolvedValueOnce({ ...feePlan, items: [feeItem, item2], total: feeItem.price + item2.price })
        .mockRejectedValueOnce(new Error('red'))
        .mockResolvedValue(fresh);
      jest.mocked(voidCancellationFee).mockRejectedValueOnce(new ApiError(409, 'El cargo ya está anulado.'));
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      await user.click(within(table).getByRole('button', { name: /Anular cargo/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Anular el cargo' });
      await user.type(within(dialog).getByLabelText('Motivo'), 'Cargo erróneo');
      await user.click(within(dialog).getByRole('button', { name: 'Anular cargo' }));
      await within(dialog).findByText('El cargo ya está anulado.');
      expect(within(dialog).getByRole('status')).toHaveTextContent(/cambió mientras lo tenías abierto/);
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      const failure = await screen.findByRole('alert');
      expect(failure).toHaveTextContent('No pudimos actualizar el plan.');
      // Sin datos fiables no queda ni la tabla vieja ni un «Actualizando…» que ya no es verdad.
      expect(screen.queryByRole('table', { name: /ítems de la visita/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/Actualizando el estado del cargo/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Anular cargo/ })).not.toBeInTheDocument();
      await user.click(within(failure).getByRole('button', { name: 'Reintentar' }));
      const refreshed = await screen.findByRole('table', { name: /ítems de la visita/i });
      expect(within(refreshed).queryByRole('button', { name: /Anular cargo/ })).not.toBeInTheDocument();
    });

    it('tras un 409, al cerrar el foco va al encabezado de los ítems (DX-343)', async () => {
      mockedListPlans.mockResolvedValue([feePlan]);
      mockedGetPlan
        .mockResolvedValueOnce({ ...feePlan, items: [feeItem, item2], total: feeItem.price + item2.price })
        .mockResolvedValue({ ...feePlan, items: [item2], total: item2.price });
      jest.mocked(voidCancellationFee).mockRejectedValueOnce(new ApiError(409, 'El cargo ya está anulado.'));
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      await user.click(within(table).getByRole('button', { name: /Anular cargo/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Anular el cargo' });
      await user.type(within(dialog).getByLabelText('Motivo'), 'Cargo erróneo');
      await user.click(within(dialog).getByRole('button', { name: 'Anular cargo' }));
      await within(dialog).findByText('El cargo ya está anulado.');
      // La relectura quita la fila del cargo (y con ella el botón que abrió el diálogo).
      await waitFor(() => expect(screen.queryAllByRole('button', { name: /Anular cargo \d|Anular cargo:/, hidden: true })).toHaveLength(0));
      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Ítems del plan de tratamiento' })).toHaveFocus());
    });

    it('ignora la respuesta tardía del plan anterior tras un conflicto', async () => {
      let resolveOld!: (value: typeof feePlan & { items: TreatmentPlanItem[]; total: number }) => void;
      const oldDetail = { ...feePlan, items: [feeItem], total: feeItem.price };
      mockedListPlans.mockResolvedValue([feePlan, plan2]);
      mockedGetPlan.mockResolvedValueOnce(oldDetail)
        .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
        .mockResolvedValue(plan2Detail);
      jest.mocked(voidCancellationFee).mockRejectedValueOnce(new ApiError(409, 'Cargo actualizado'));
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      await user.click(within(table).getByRole('button', { name: /Anular cargo/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Anular el cargo' });
      await user.type(within(dialog).getByLabelText('Motivo'), 'Cargo erróneo');
      await user.click(within(dialog).getByRole('button', { name: 'Anular cargo' }));
      await within(dialog).findByText('Cargo actualizado');
      await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
      await user.selectOptions(screen.getByLabelText(/^plan$/i), 'plan-2');
      await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledWith(adminToken, 'plan-2'));
      await act(async () => { resolveOld(oldDetail); });
      expect(screen.getByLabelText<HTMLSelectElement>(/^plan$/i)).toHaveValue('plan-2');
      expect(screen.queryByRole('button', { name: /Anular cargo/ })).not.toBeInTheDocument();
    });

    it('ADMIN anula el cargo con motivo y el plan se refresca', async () => {
      jest.mocked(voidCancellationFee).mockResolvedValue({} as never);
      const user = userEvent.setup();
      renderFeePlan(adminToken);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      await user.click(within(table).getByRole('button', { name: /Anular cargo/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Anular el cargo' });
      await user.type(within(dialog).getByLabelText('Motivo'), 'Cargo generado por error');
      const calls = mockedGetPlan.mock.calls.length;
      await user.click(within(dialog).getByRole('button', { name: 'Anular cargo' }));
      await waitFor(() =>
        expect(voidCancellationFee).toHaveBeenCalledWith(adminToken, 'appt-1', 'Cargo generado por error'),
      );
      await waitFor(() => expect(mockedGetPlan.mock.calls.length).toBeGreaterThan(calls));
      expect(screen.getByRole('heading', { name: 'Ítems del plan de tratamiento' })).toHaveFocus();
      expect(mockedRemoveItem).not.toHaveBeenCalled();
    });
  });

  describe('DX-050 · quién realizó cada ítem', () => {
    const adminToken = `h.${btoa(JSON.stringify({ sub: 'u-admin', tenantId: 't1', role: 'ADMIN' }))}.s`;
    const otherDentistToken = `h.${btoa(JSON.stringify({ sub: 'u-otra', tenantId: 't1', role: 'DENTIST' }))}.s`;
    const doneByLaura: TreatmentPlanItem = {
      ...item2,
      status: 'DONE',
      performedById: 'u-laura',
      performedByName: 'Dra. Laura Gómez',
      performedLocationId: 'loc-norte',
      performedLocationName: 'Sede Norte',
      completedAt: new Date(2026, 9, 20, 10, 0).toISOString(),
    };
    const legacyDone: TreatmentPlanItem = { ...item1, id: 'item-9', toothNumber: '47', status: 'DONE' };

    it('la ficha dice quién, cuándo y en qué sede, o «Sin atribuir»', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue({ ...plan1, items: [doneByLaura, legacyDone], total: 0 });
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      expect(within(table).getByText('Realizado por Dra. Laura Gómez · 20/10/2026 · Sede Norte')).toBeInTheDocument();
      expect(within(table).getByText('Sin atribuir')).toBeInTheDocument();
      // La lista móvil dice lo mismo.
      expect(screen.getAllByText('Realizado por Dra. Laura Gómez · 20/10/2026 · Sede Norte')).toHaveLength(2);
    });

    it('otra dentista no puede sacarlo de «Realizado» ni corregirlo', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue({ ...plan1, items: [doneByLaura], total: 0 });
      render(<TreatmentPlansTab patientId="pat-1" token={otherDentistToken} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      const select = within(table).getByRole('combobox', { name: /estado del ítem del diente 26/i });
      expect(within(select).getByRole('option', { name: 'Aceptado' })).toBeDisabled();
      expect(within(table).queryByRole('button', { name: /corregir quién/i })).not.toBeInTheDocument();
    });

    it('un ADMIN corrige quién lo realizó desde la ficha', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue({ ...plan1, items: [doneByLaura], total: 0 });
      jest.mocked(listStaff).mockResolvedValue([
        { userId: 'u-laura', fullName: 'Dra. Laura Gómez', role: 'DENTIST', locationIds: null },
        { userId: 'u-admin', fullName: 'Dr. Owner', role: 'ADMIN', locationIds: null },
      ]);
      mockedUpdateItem.mockResolvedValue({ ...doneByLaura, performedById: 'u-admin' });
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      const select = within(table).getByRole('combobox', { name: /estado del ítem del diente 26/i });
      expect(within(select).getByRole('option', { name: 'Aceptado' })).toBeEnabled();
      await user.click(within(table).getByRole('button', { name: 'Corregir quién realizó el ítem del diente 26' }));
      const dialog = await screen.findByRole('dialog', { name: 'Corregir quién lo realizó' });
      const performer = within(dialog).getByRole('combobox', { name: 'Profesional que lo realizó' });
      await waitFor(() => expect(performer).toHaveValue('u-laura'));
      await user.selectOptions(performer, 'u-admin');
      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
      await waitFor(() =>
        expect(mockedUpdateItem).toHaveBeenCalledWith(adminToken, 'plan-1', 'item-2', {
          performedById: 'u-admin',
        }),
      );
    });

    it('un ADMIN atribuye un «Sin atribuir»: el modal pide sede y fecha (DX-305)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue({ ...plan1, items: [legacyDone], total: 0 });
      jest.mocked(listStaff).mockResolvedValue([
        { userId: 'u-laura', fullName: 'Dra. Laura Gómez', role: 'DENTIST', locationIds: null },
      ]);
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      expect(within(table).queryByRole('button', { name: /corregir quién/i })).not.toBeInTheDocument();
      await user.click(
        within(table).getByRole('button', { name: 'Atribuir quién, cuándo y dónde se realizó el ítem del diente 47' }),
      );
      const dialog = await screen.findByRole('dialog', { name: 'Atribuir el procedimiento' });
      expect(within(dialog).getByRole('combobox', { name: 'Sede donde se realizó' })).toBeInTheDocument();
      expect(within(dialog).getByLabelText('Fecha en que se realizó')).toBeInTheDocument();
    });

    it('volver de «Realizado» a aceptado no pide profesional', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue({ ...plan1, items: [doneByLaura], total: 0 });
      mockedUpdateItem.mockResolvedValue({ ...item2 });
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      await user.selectOptions(
        within(table).getByRole('combobox', { name: /estado del ítem del diente 26/i }),
        'ACCEPTED',
      );
      await waitFor(() =>
        expect(mockedUpdateItem).toHaveBeenCalledWith(adminToken, 'plan-1', 'item-2', { status: 'ACCEPTED' }),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('error states ladder', () => {
    it('cuando no hay planes que mostrar, usa el estado de sección con reintento (escalón 1: loadError)', async () => {
      mockedListPlans.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));

      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

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
          <TreatmentPlansTab patientId="pat-1" token={tok} />
          <Toaster />
        </>,
      );
      await screen.findByRole('table', { name: /ítems de la visita/i });

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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByText(/todavía no tiene un plan de tratamiento/i);

      await user.click(screen.getByRole('button', { name: /^nuevo plan$/i }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('No pudimos crear el plan. Intenta de nuevo.');
    });

    it('el detalle del plan que falla al cargar usa el estado de sección con reintento, y el reintento limpia el error y muestra el contenido (escalón 1: planDetailError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockRejectedValueOnce(new ApiError(500, 'No se pudo cargar el plan'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

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
      await screen.findByRole('table', { name: /ítems de la visita/i });
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
          <TreatmentPlansTab patientId="pat-1" token={tok} />
          <Toaster />
        </>,
      );
      await screen.findByRole('table', { name: /ítems de la visita/i });

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
          <TreatmentPlansTab patientId="pat-1" token={tok} />
          <Toaster />
        </>,
      );
      await screen.findByRole('table', { name: /ítems de la visita/i });

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
      await screen.findByRole('table', { name: /ítems de la visita/i });
      await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledTimes(3));
      expect(mockedGetPlan).toHaveBeenNthCalledWith(3, tok, 'plan-2');

      // Now click the *stale* toast's retry. It reads `selectedPlanId` fresh
      // at click time — plan-2, the currently selected plan — not plan-1,
      // the plan the toast was originally about.
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      await waitFor(() => expect(mockedGetPlan).toHaveBeenCalledTimes(4));
      expect(mockedGetPlan).toHaveBeenNthCalledWith(4, tok, 'plan-2');
    });

    it('un cambio de estado del plan que falla se muestra en línea (escalón 4: planStatusError)', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedUpdatePlan.mockRejectedValueOnce(new ApiError(500, 'No se pudo cambiar el estado'));

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });

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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });

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
          <TreatmentPlansTab patientId="pat-1" token={tok} />
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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });

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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      expect(
        within(table).getByText(`Descuento −${expectedCurrencyText(5000)}`),
      ).toBeInTheDocument();

      await user.type(screen.getByLabelText(/código fdi/i), '16');
      await user.click(screen.getByRole('radio', { name: /resina/i }));
      await user.type(screen.getByLabelText(/descuento/i), '2500');
      await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));
      await waitFor(() =>
        expect(mockedAddItem).toHaveBeenCalledWith(tok, 'plan-1', {
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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });

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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });

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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });

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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });
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
      await screen.findByRole('table', { name: /ítems de la visita/i });
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
      await screen.findByRole('table', { name: /ítems de la visita/i });
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
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
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

    it('DENTIST: aplicar «Descuento %» no relee saldo ni abonos (403) ni lanza un toast', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedGetPlanBalance.mockRejectedValue(new ApiError(403, 'Forbidden'));
      mockedListPayments.mockRejectedValue(new ApiError(403, 'Forbidden'));
      mockedApplyBulkDiscount.mockResolvedValue({
        items: [{ ...item1, discount: 2500 }],
        skippedNoDiscount: 0,
      });
      const user = userEvent.setup();
      render(
        <>
          <TreatmentPlansTab patientId="pat-1" token={discountDentistToken} />
          <Toaster />
        </>,
      );
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      await waitFor(() => expect(mockedGetDiscountPolicy).toHaveBeenCalled());
      await user.click(within(table).getByRole('checkbox', { name: 'Seleccionar el ítem del diente 11' }));
      await user.click(screen.getByRole('button', { name: 'Descuento %' }));
      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Porcentaje de descuento'), '5');
      await user.click(within(dialog).getByRole('button', { name: 'Aplicar descuento' }));
      expect(await screen.findByText('Descuento aplicado a 1 ítem.')).toBeInTheDocument();
      await waitFor(() => expect(mockedGetPlan.mock.calls.length).toBeGreaterThan(1));
      // Puerta por rol: ni una petición de cobro, ni toast, ni sección de abonos.
      expect(mockedGetPlanBalance).not.toHaveBeenCalled();
      expect(mockedListPayments).not.toHaveBeenCalled();
      expect(screen.queryByText('No pudimos actualizar el saldo.')).not.toBeInTheDocument();
      expect(screen.queryByText(/Forbidden/)).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Abonos y saldo' })).not.toBeInTheDocument();
    });

    it('a token without a readable role is not a billing role: no balance requests, no «Abonos y saldo»', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      render(<TreatmentPlansTab patientId="pat-1" token="tok-sin-rol" />);
      await screen.findByRole('table', { name: /ítems de la visita/i });
      expect(mockedGetPlanBalance).not.toHaveBeenCalled();
      expect(mockedListPayments).not.toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: 'Abonos y saldo' })).not.toBeInTheDocument();
    });

    it.each([['ADMIN'], ['RECEPTION']])('%s sigue leyendo saldo y abonos y ve «Abonos y saldo»', async (role) => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      const token = `h.${btoa(JSON.stringify({ sub: 'u1', tenantId: 't1', role }))}.s`;
      render(<TreatmentPlansTab patientId="pat-1" token={token} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });
      await waitFor(() => expect(mockedGetPlanBalance).toHaveBeenCalledWith(token, 'plan-1'));
      expect(mockedListPayments).toHaveBeenCalledWith(token, 'plan-1');
      expect(await screen.findByRole('heading', { name: 'Abonos y saldo' })).toBeInTheDocument();
    });

    // SEC-041: un precio por debajo del de catálogo cuenta como descuento.
    describe('precio por debajo del de catálogo (SEC-041)', () => {
      async function openForm(token: string) {
        mockedListPlans.mockResolvedValue([plan1]);
        mockedGetPlan.mockResolvedValue(plan1Detail);
        const user = userEvent.setup();
        render(<TreatmentPlansTab patientId="pat-1" token={token} />);
        await screen.findByRole('table', { name: /ítems de la visita/i });
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
        const table = await screen.findByRole('table', { name: /ítems de la visita/i });
        expect(within(table).getByText(/Rebaja −10\.000,00 .* \(catálogo 60\.000,00/)).toBeInTheDocument();
        expect(within(table).getByText('Motivo: Paciente frecuente')).toBeInTheDocument();
      });
    });

    it('un presupuesto aceptado no ofrece casillas ni «Descuento %»', async () => {
      const accepted = { ...plan1Detail, status: 'ACCEPTED' as const };
      mockedListPlans.mockResolvedValue([{ ...plan1, status: 'ACCEPTED' as const }]);
      mockedGetPlan.mockResolvedValue(accepted);
      render(<TreatmentPlansTab patientId="pat-1" token={discountAdminToken} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });
      await user.type(screen.getByLabelText(/código fdi/i), '16');
      return user;
    }

    const submit = () => screen.getByRole('button', { name: /^agregar ítem$/i });

    it('pide el precio del paciente para la prestación, lo precarga y dice de dónde sale', async () => {
      mockedGetPriceQuote.mockResolvedValue(agreementQuote());
      const user = await openForm();
      await user.click(screen.getByRole('radio', { name: /resina/i }));

      await waitFor(() =>
        expect(mockedGetPriceQuote).toHaveBeenCalledWith(tok, 'pat-1', {
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
        expect(mockedAddItem).toHaveBeenCalledWith(tok, 'plan-1', { toothNumber: '16', catalogItemId: 'cat-1' }),
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
        expect(mockedAddItem).toHaveBeenCalledWith(tok, 'plan-1', {
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
        expect(mockedAddItem).toHaveBeenCalledWith(tok, 'plan-1', {
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
        expect(mockedAddItem).toHaveBeenCalledWith(tok, 'plan-1', {
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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
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
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
      expect(within(table).getAllByText(/Lista de precios de la sede · precio de lista/)).toHaveLength(1);
    });

    it('«Descuento %» avisa cuántas prestaciones no admiten descuento y se dejaron igual', async () => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedGetDiscountPolicy.mockResolvedValue(DISCOUNT_POLICY);
      mockedApplyBulkDiscount.mockResolvedValue({ items: [{ ...item1, discount: 2500 }], skippedNoDiscount: 2 });
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={discountDentistToken} />);
      const table = await screen.findByRole('table', { name: /ítems de la visita/i });
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

  // DX-051: cobrado y pendiente por ítem (ADMIN; DENTIST y ASSISTANT reciben
  // 403 del saldo y no ven nada nuevo).
  describe('cobrado por ítem (DX-051)', () => {
    const adminToken = `h.${btoa(JSON.stringify({ sub: 'u-admin', tenantId: 't1', role: 'ADMIN' }))}.s`;
    const balanceWithItems: PlanBalance = {
      ...balance1,
      allocated: 50000,
      items: [
        {
          itemId: item1.id,
          toothNumber: '11',
          procedureName: 'Resina',
          status: 'PROPOSED',
          billable: 0,
          paid: 0,
          balance: 0,
        },
        {
          itemId: item2.id,
          toothNumber: '26',
          procedureName: 'Limpieza',
          status: 'ACCEPTED',
          billable: 80000,
          paid: 50000,
          balance: 30000,
        },
      ],
    };

    async function itemsTable() {
      return screen.findByRole('table', { name: /ítems de la visita/i });
    }

    /** El `<dl>` de cifras del plan: «Sin imputar» vive ahí, junto a «Pagado». */
    function moneySummary(): HTMLElement {
      return screen.getByText('A pagar').closest('dl') as HTMLElement;
    }

    beforeEach(() => {
      mockedListPlans.mockResolvedValue([plan1]);
      mockedGetPlan.mockResolvedValue(plan1Detail);
      mockedListPayments.mockResolvedValue([payment1]);
    });

    it('renders Cobrado/Pendiente when balance has items', async () => {
      mockedGetPlanBalance.mockResolvedValue(balanceWithItems);
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);

      const table = await itemsTable();
      const headers = await within(table).findAllByRole('columnheader');
      const names = headers.map((h) => h.textContent);
      // Tras el importe, antes del estado.
      expect(names.indexOf('Cobrado')).toBe(names.indexOf('Precio') + 1);
      expect(names.indexOf('Pendiente')).toBe(names.indexOf('Precio') + 2);

      const accepted = within(table).getByText('26').closest('tr') as HTMLTableRowElement;
      expect(within(accepted).getByText(expectedCurrencyText(50000))).toBeInTheDocument();
      expect(within(accepted).getByText(expectedCurrencyText(30000))).toBeInTheDocument();
      const proposed = within(table).getByText('11').closest('tr') as HTMLTableRowElement;
      expect(within(proposed).getAllByLabelText('Sin importe a cobrar')).toHaveLength(2);

      // Tarjetas móviles: «Cobrado {x} · Pendiente {y}».
      expect(
        screen.getByText(`Cobrado ${expectedCurrencyText(50000)} · Pendiente ${expectedCurrencyText(30000)}`),
      ).toBeInTheDocument();
    });

    it('Sin imputar only when unallocated > 0', async () => {
      mockedGetPlanBalance.mockResolvedValue(balanceWithItems);
      const { unmount } = render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      await itemsTable();
      await within(await itemsTable()).findAllByText('Cobrado');
      expect(within(moneySummary()).queryByText('Sin imputar')).not.toBeInTheDocument();
      unmount();

      mockedGetPlanBalance.mockResolvedValue({ ...balanceWithItems, unallocated: 12500 });
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      await within(await itemsTable()).findAllByText('Cobrado');
      const figure = within(moneySummary()).getByText('Sin imputar').closest('div') as HTMLElement;
      expect(within(figure).getByText(expectedCurrencyText(12500))).toBeInTheDocument();
      expect(figure).toHaveTextContent('Abonos que todavía no cubren ningún ítem.');
    });

    it('unconverted notice reads «{n} abono(s) todavía sin convertir a la moneda del plan: no se imputan a ítems.»', async () => {
      mockedGetPlanBalance.mockResolvedValue({ ...balanceWithItems, unconvertedPaymentsCount: 2 });
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);

      expect(
        await screen.findByText('2 abonos todavía sin convertir a la moneda del plan: no se imputan a ítems.'),
      ).toBeInTheDocument();
    });

    // DX-375: el saldo de arriba no cuenta los abonos «sin tasa»: el aviso
    // lo dice junto a las cifras, con el enlace a Ajustes › Tasa de cambio.
    it('abonos sin tasa: el aviso va junto al saldo y enlaza a Ajustes › Tasa de cambio', async () => {
      mockedGetPlanBalance.mockResolvedValue({
        ...balanceWithItems,
        unconvertedPaymentsCount: 1,
        paymentsWithoutRate: [
          {
            paymentId: 'p9',
            amount: 150000,
            currency: 'COP',
            paidOn: '2026-10-30',
          },
        ],
      });
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);

      const notice = await screen.findByText(withoutRateCopy.title(1));
      expect(notice.closest('[role="status"]')).toHaveTextContent('30/10/2026');
      expect(screen.getByRole('link', { name: withoutRateCopy.adminLink })).toHaveAttribute(
        'href',
        '/settings/tasa-de-cambio',
      );
      expect(screen.queryByText(/todavía sin convertir/)).not.toBeInTheDocument();
    });

    it('unconverted notice for a single abono reads in singular, and is absent at 0', async () => {
      mockedGetPlanBalance.mockResolvedValue({
        ...balanceWithItems,
        unconvertedPaymentsCount: 1,
      });
      const { unmount } = render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      expect(
        await screen.findByText('1 abono todavía sin convertir a la moneda del plan: no se imputa a ítems.'),
      ).toBeInTheDocument();
      unmount();

      mockedGetPlanBalance.mockResolvedValue(balanceWithItems);
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      await within(await itemsTable()).findAllByText('Cobrado');
      expect(screen.queryByText(/todavía sin convertir/)).not.toBeInTheDocument();
    });

    it('no new columns when balance is 403', async () => {
      const dentistToken = `h.${btoa(JSON.stringify({ sub: 'u-d', tenantId: 't1', role: 'DENTIST' }))}.s`;
      mockedGetPlanBalance.mockRejectedValue(new ApiError(403, 'Forbidden'));
      mockedListPayments.mockRejectedValue(new ApiError(403, 'Forbidden'));
      render(<TreatmentPlansTab patientId="pat-1" token={dentistToken} />);

      const table = await itemsTable();
      // DX-051: DENTIST no ve datos de pago; ni se piden ni hay sección.
      expect(mockedGetPlanBalance).not.toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: 'Abonos y saldo' })).not.toBeInTheDocument();
      const names = within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent);
      expect(names).not.toContain('Cobrado');
      expect(names).not.toContain('Pendiente');
      expect(screen.queryByText(/^Cobrado /)).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Sin importe a cobrar')).not.toBeInTheDocument();
      expect(screen.queryByText('Sin imputar')).not.toBeInTheDocument();
    });

    it('Fijada a mano badge for ids in manualPaymentIds', async () => {
      const payment2: Payment = { ...payment1, id: 'pay-2', amount: 20000, receiptNumber: 'PRI-000002' };
      mockedListPayments.mockResolvedValue([payment1, payment2]);
      mockedGetPlanBalance.mockResolvedValue({ ...balanceWithItems, manualPaymentIds: ['pay-2'] });

      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      const payments = await openPaymentsTable(user);

      const pinned = within(payments).getByText('PRI-000002').closest('tr') as HTMLTableRowElement;
      expect(within(pinned).getByText('Fijada a mano')).toBeInTheDocument();
      const auto = within(payments).getByText('PRI-000001').closest('tr') as HTMLTableRowElement;
      expect(within(auto).queryByText('Fijada a mano')).not.toBeInTheDocument();
      // También en la tarjeta móvil del abono, solo una vez.
      expect(screen.getAllByText('Fijada a mano')).toHaveLength(2);
    });

    describe('las mutaciones de ítems releen el saldo por ítem (I-1)', () => {
      /** Espera a que el saldo se pida una vez más que `before`. */
      async function expectBalanceReloaded(before: number) {
        await waitFor(() => expect(mockedGetPlanBalance.mock.calls.length).toBe(before + 1));
        expect(mockedListPayments.mock.calls.length).toBeGreaterThanOrEqual(before + 1);
      }

      beforeEach(() => {
        mockedGetPlanBalance.mockResolvedValue(balanceWithItems);
      });

      it('after removing an item', async () => {
        mockedRemoveItem.mockResolvedValue(undefined);
        const user = userEvent.setup();
        render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
        const table = await itemsTable();
        await within(table).findAllByText('Cobrado');
        const before = mockedGetPlanBalance.mock.calls.length;

        const row = within(table).getByText('26').closest('tr') as HTMLTableRowElement;
        await user.click(within(row).getByRole('button', { name: /quitar/i }));
        const confirm = await screen.findByRole('dialog', { name: /quitar este ítem del plan/i });
        await user.click(within(confirm).getByRole('button', { name: 'Quitar ítem' }));

        await waitFor(() => expect(mockedRemoveItem).toHaveBeenCalled());
        await expectBalanceReloaded(before);
      });

      it('after adding an item', async () => {
        mockedAddItem.mockResolvedValue({ ...item1, id: 'item-3' });
        const user = userEvent.setup();
        render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
        const table = await itemsTable();
        await within(table).findAllByText('Cobrado');
        const before = mockedGetPlanBalance.mock.calls.length;

        await user.type(screen.getByLabelText(/código fdi/i), '16');
        await user.click(screen.getByRole('radio', { name: /resina/i }));
        await user.click(screen.getByRole('button', { name: /^agregar ítem$/i }));

        await waitFor(() => expect(mockedAddItem).toHaveBeenCalled());
        await expectBalanceReloaded(before);
      });

      it('after a bulk discount', async () => {
        mockedGetDiscountPolicy.mockResolvedValue(DISCOUNT_POLICY);
        mockedApplyBulkDiscount.mockResolvedValue({ items: [{ ...item2, discount: 4000 }], skippedNoDiscount: 0 });
        const user = userEvent.setup();
        render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
        const table = await itemsTable();
        await within(table).findAllByText('Cobrado');
        await waitFor(() => expect(mockedGetDiscountPolicy).toHaveBeenCalled());
        const before = mockedGetPlanBalance.mock.calls.length;

        await user.click(within(table).getByRole('checkbox', { name: 'Seleccionar el ítem del diente 26' }));
        await user.click(screen.getByRole('button', { name: 'Descuento %' }));
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText('Porcentaje de descuento'), '5');
        await user.click(within(dialog).getByRole('button', { name: 'Aplicar descuento' }));

        await waitFor(() => expect(mockedApplyBulkDiscount).toHaveBeenCalled());
        await expectBalanceReloaded(before);
      });

      it('after presenting the plan (plan options)', async () => {
        jest.mocked(presentPlan).mockResolvedValue({ ...plan1, status: 'PRESENTED' });
        const user = userEvent.setup();
        render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
        const table = await itemsTable();
        await within(table).findAllByText('Cobrado');
        const before = mockedGetPlanBalance.mock.calls.length;

        await user.click(screen.getByRole('button', { name: 'Presentar al paciente' }));

        await waitFor(() => expect(presentPlan).toHaveBeenCalled());
        await expectBalanceReloaded(before);
      });
    });

    it('Imputación action only for ADMIN', async () => {
      mockedGetPlanBalance.mockResolvedValue(balanceWithItems);
      const user = userEvent.setup();
      const { unmount } = render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      const payments = await openPaymentsTable(user);
      const row = within(payments).getByText('PRI-000001').closest('tr') as HTMLTableRowElement;
      // El nombre dice de qué abono es: con varios, «Imputación» a secas no distingue.
      expect(within(row).getByRole('button', { name: 'Imputación del abono PRI-000001' })).toBeInTheDocument();
      // Tabla de escritorio y tarjeta móvil.
      expect(screen.getAllByRole('button', { name: /^Imputación/ })).toHaveLength(2);
      unmount();

      const receptionToken = `h.${btoa(JSON.stringify({ sub: 'u-r', tenantId: 't1', role: 'RECEPTION' }))}.s`;
      render(<TreatmentPlansTab patientId="pat-1" token={receptionToken} />);
      await openPaymentsTable(user);
      expect(screen.queryByRole('button', { name: /^Imputación/ })).not.toBeInTheDocument();
    });

    it('no Imputación action on a cancelled plan: its payments are not allocated', async () => {
      const cancelled = plan({ id: 'plan-1', status: 'CANCELLED' });
      mockedListPlans.mockResolvedValue([cancelled]);
      mockedGetPlan.mockResolvedValue({ ...plan1Detail, ...cancelled });
      mockedGetPlanBalance.mockResolvedValue(balanceWithItems);
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      await openPaymentsTable(user);
      expect(screen.queryByRole('button', { name: /^Imputación/ })).not.toBeInTheDocument();
    });

    it('saving the allocation closes the modal and refreshes balance and payments', async () => {
      mockedGetPlanBalance.mockResolvedValue(balanceWithItems);
      const allocations = {
        paymentId: 'pay-1',
        receiptNumber: 'PRI-000001',
        treatmentPlanId: 'plan-1',
        paymentAmount: 50000,
        paymentCurrency: 'USD',
        paidOn: '2026-01-05',
        planCurrency: 'USD',
        planStatus: 'DRAFT' as const,
        planAmount: 50000,
        manual: false,
        allocated: 50000,
        unallocated: 0,
        version: 'a'.repeat(64),
        allocations: [{ treatmentPlanItemId: item2.id, amount: 50000, source: 'AUTO' as const }],
        items: [
          {
            itemId: item2.id,
            toothNumber: '26',
            procedureName: 'Limpieza',
            status: 'ACCEPTED' as const,
            billable: 80000,
            paidByOthers: 0,
            free: 80000,
          },
        ],
      };
      jest.mocked(getPaymentAllocations).mockResolvedValue(allocations);
      jest.mocked(replacePaymentAllocations).mockResolvedValue({ ...allocations, manual: true, previous: [] });

      const user = userEvent.setup();
      render(
        <>
          <TreatmentPlansTab patientId="pat-1" token={adminToken} />
          <Toaster />
        </>,
      );
      const payments = await openPaymentsTable(user);
      const row = within(payments).getByText('PRI-000001').closest('tr') as HTMLTableRowElement;
      const trigger = within(row).getByRole('button', { name: /^Imputación/ });
      await user.click(trigger);

      const modal = await screen.findByRole('dialog', { name: 'Imputar abono' });
      expect(jest.mocked(getPaymentAllocations)).toHaveBeenCalledWith(adminToken, 'pay-1');
      await within(modal).findByRole('radio', { name: /fijar a mano/i });
      const balanceCalls = mockedGetPlanBalance.mock.calls.length;
      const paymentsCalls = mockedListPayments.mock.calls.length;

      await user.click(within(modal).getByRole('radio', { name: /fijar a mano/i }));
      await user.click(within(modal).getByRole('button', { name: 'Guardar imputación' }));

      expect(await screen.findByText('Imputación guardada.')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Imputar abono' })).not.toBeInTheDocument());
      await waitFor(() => expect(mockedGetPlanBalance.mock.calls.length).toBe(balanceCalls + 1));
      expect(mockedListPayments.mock.calls.length).toBe(paymentsCalls + 1);
      // El foco vuelve al botón que abrió el modal (sigue en la fila).
      await waitFor(() => expect(trigger).toHaveFocus());
    });

    it('if the row is gone when the modal closes, focus goes to the payments fold', async () => {
      mockedGetPlanBalance.mockResolvedValue(balanceWithItems);
      jest.mocked(getPaymentAllocations).mockRejectedValue(new ApiError(404, 'Abono no encontrado.'));
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={adminToken} />);
      const payments = await openPaymentsTable(user);
      const row = within(payments).getByText('PRI-000001').closest('tr') as HTMLTableRowElement;
      await user.click(within(row).getByRole('button', { name: /^Imputación/ }));
      const modal = await screen.findByRole('dialog', { name: 'Imputar abono' });
      expect(await within(modal).findByText('Abono no encontrado.')).toBeInTheDocument();

      // Otra persona anuló el abono: la fila ya no está al cerrar.
      row.remove();
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /abonos y saldo/i })).toHaveFocus(),
      );
    });
  });
  describe('moneda del plan (GLOBAL-G1, R14)', () => {
    const mockedLocations = jest.mocked(listLocations);
    const tokyo = clinicLocation({ id: 'loc-jp', name: 'Tokio', country: 'CO', currency: 'JPY', timeZone: 'Asia/Tokyo' });
    const madrid = clinicLocation({ id: 'loc-es', name: 'Madrid', country: 'ES', currency: 'EUR', timeZone: 'Europe/Madrid' });

    beforeEach(() => {
      window.localStorage.clear();
      mockedListCurrencies.mockResolvedValue([
        { code: 'JPY', name: 'Yen japonés', symbol: '¥' },
        { code: 'EUR', name: 'Euro', symbol: '€' },
      ]);
      mockedListPlans.mockResolvedValue([]);
    });
    afterEach(() => {
      window.localStorage.clear();
      mockedLocations.mockResolvedValue([clinicLocation()]);
    });

    it('new plan at a JPY location is created in JPY', async () => {
      window.localStorage.setItem('dentalix.activeLocationId', 'loc-jp');
      mockedLocations.mockResolvedValue([tokyo, madrid]);
      mockedCreatePlan.mockResolvedValue(plan({ id: 'plan-jp', currency: 'JPY' }));
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);

      const select = await screen.findByLabelText<HTMLSelectElement>('Moneda del nuevo plan');
      await waitFor(() => expect(select.value).toBe('JPY'));
      await user.click(screen.getByRole('button', { name: /^nuevo plan$/i }));
      await waitFor(() => expect(mockedCreatePlan).toHaveBeenCalledWith(tok, 'pat-1', { currency: 'JPY' }));
    });

    it('mixed currencies and no location leaves the plan currency empty and required', async () => {
      mockedLocations.mockResolvedValue([tokyo, madrid]);
      mockedCreatePlan.mockResolvedValue(plan({ id: 'plan-es', currency: 'EUR' }));
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByText(/todavía no tiene un plan de tratamiento/i);
      await waitFor(() => expect(mockedLocations).toHaveBeenCalled());

      const select = screen.getByLabelText<HTMLSelectElement>('Moneda del nuevo plan');
      expect(select.value).toBe('');
      await user.click(screen.getByRole('button', { name: /^nuevo plan$/i }));
      expect(await screen.findByText('Elige la moneda del nuevo plan.')).toBeInTheDocument();
      expect(mockedCreatePlan).not.toHaveBeenCalled();

      await waitFor(() => expect(select.querySelector('option[value="EUR"]')).not.toBeNull());
      await user.selectOptions(select, 'EUR');
      await user.click(screen.getByRole('button', { name: /^nuevo plan$/i }));
      await waitFor(() => expect(mockedCreatePlan).toHaveBeenCalledWith(tok, 'pat-1', { currency: 'EUR' }));
    });

    it('location without currency leaves the plan currency empty, never COP or USD', async () => {
      window.localStorage.setItem('dentalix.activeLocationId', 'loc-1');
      mockedLocations.mockResolvedValue([clinicLocation({ id: 'loc-1', country: 'CO', currency: null })]);
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByText(/todavía no tiene un plan de tratamiento/i);
      await waitFor(() => expect(mockedLocations).toHaveBeenCalled());

      expect(screen.getByLabelText<HTMLSelectElement>('Moneda del nuevo plan').value).toBe('');
      await user.click(screen.getByRole('button', { name: /^nuevo plan$/i }));
      expect(await screen.findByText('Elige la moneda del nuevo plan.')).toBeInTheDocument();
      expect(mockedCreatePlan).not.toHaveBeenCalled();
    });

    it('payment currency is the plan currency', async () => {
      const jpyPlan = plan({ id: 'plan-1', currency: 'JPY' });
      mockedListPlans.mockResolvedValue([jpyPlan]);
      mockedGetPlan.mockResolvedValue({ ...plan1Detail, currency: 'JPY' });
      mockedGetPlanBalance.mockResolvedValue({ ...balance1, planCurrency: 'JPY' });
      mockedListPayments.mockResolvedValue([]);
      const user = userEvent.setup();
      render(<TreatmentPlansTab patientId="pat-1" token={tok} />);
      await screen.findByRole('table', { name: /ítems de la visita/i });
      await user.click(await screen.findByRole('button', { name: /^registrar abono$/i }));
      expect(screen.getByLabelText<HTMLSelectElement>(/^moneda$/i).value).toBe('JPY');
    });
  });
});
