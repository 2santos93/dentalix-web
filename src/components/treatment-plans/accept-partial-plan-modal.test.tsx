import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { ApiError } from '@/lib/api/client';
import type { ClinicRole } from '@/lib/me/me-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import {
  acceptPlan,
  getPlanQuote,
  previewPartialAcceptance,
  type PartialAcceptancePreview,
  type PlanQuoteItem,
} from '@/lib/treatment-plans/plan-quote-api';
import { getPlan, type TreatmentPlan, type TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import { AcceptPartialPlanModal, PARTIAL_PREVIEW_DEBOUNCE_MS } from './accept-partial-plan-modal';
import { ITEM_WITHOUT_DISCOUNT, PLAN_WITHOUT_OPTIONS } from './plan-fixture';
import { planQuoteFixture, SIGNED_ACCEPTANCE } from './plan-quote-fixture';

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/treatment-plans-api'),
  getPlan: jest.fn(),
}));
jest.mock('../../lib/treatment-plans/plan-quote-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-quote-api'),
  getPlanQuote: jest.fn(),
  acceptPlan: jest.fn(),
  previewPartialAcceptance: jest.fn(),
}));

const mockedQuote = jest.mocked(getPlanQuote);
const mockedAccept = jest.mocked(acceptPlan);
const mockedPreview = jest.mocked(previewPartialAcceptance);
const mockedGetPlan = jest.mocked(getPlan);

beforeAll(() => {
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        setTransform: jest.fn(),
        clearRect: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        stroke: jest.fn(),
      }) as unknown as CanvasRenderingContext2D,
  );
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:image/png;base64,FIRMA');
});

function sign() {
  const canvas = screen.getByRole('img', { name: 'Firma del paciente' });
  fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 50, clientY: 30, pointerId: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

/** axe estructural en jsdom (sin colores ni geometría: los cubre el e2e). */
async function violations(element: Element) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function quoteItem(id: string, procedure: string, tooth: string, subtotal: number): PlanQuoteItem {
  return {
    id,
    toothNumber: tooth,
    surfaces: [],
    procedure,
    quantity: 1,
    unitPrice: subtotal,
    discount: 0,
    subtotal,
    listPrice: null,
    agreementName: null,
    listPriceCurrency: null,
  };
}

const I1 = quoteItem('i1', 'Implante', '36', 900);
const I2 = quoteItem('i2', 'Resina', '16', 80);
const I3 = quoteItem('i3', 'Limpieza', '', 40);

function usd(net: number) {
  return [{ currency: 'USD', gross: net, discount: 0, net, agreementSaving: 0 }];
}

const QUOTE = planQuoteFixture({
  planStatus: 'PRESENTED',
  currency: 'USD',
  items: [I1, I2, I3],
  totals: usd(1020),
  contentHash: 'c'.repeat(64),
});

function planItem(id: string, status: TreatmentPlanItem['status'] = 'PROPOSED'): TreatmentPlanItem {
  return {
    id,
    tenantId: 't1',
    planId: 'plan-1',
    toothNumber: '11',
    surfaces: [],
    catalogItemId: `cat-${id}`,
    price: 100,
    discount: 0,
    visit: 1,
    ...ITEM_WITHOUT_DISCOUNT,
    status,
    notes: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function planOf(overrides: Partial<TreatmentPlan> = {}): TreatmentPlan {
  return {
    id: 'plan-1',
    tenantId: 't1',
    patientId: 'p1',
    status: 'PRESENTED',
    currency: 'USD',
    notes: null,
    createdById: null,
    ...PLAN_WITHOUT_OPTIONS,
    presentedAt: '2026-10-01T14:00:00.000Z',
    presentedLocationId: 'loc-1',
    quoteIssuedOn: '2026-10-16',
    quoteValidUntil: '2026-11-15',
    quoteExpired: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    items: [planItem('i1'), planItem('i2'), planItem('i3')],
    total: 1020,
    acceptance: null,
    ...overrides,
  };
}

const ALL = [I1, I2, I3];

/** La vista previa de aceptar `ids` (los importes del servidor, a mano). */
function previewOf(
  ids: string[],
  { hash = `h-${ids.join('')}`, repricing = null }: { hash?: string; repricing?: PartialAcceptancePreview['repricing'] } = {},
): PartialAcceptancePreview {
  const accepted = ALL.filter((i) => ids.includes(i.id));
  const pending = ALL.filter((i) => !ids.includes(i.id));
  const sum = (items: PlanQuoteItem[]) => items.reduce((a, i) => a + i.subtotal, 0);
  return {
    accepted: planQuoteFixture({
      planStatus: 'PRESENTED',
      currency: 'USD',
      items: accepted,
      totals: usd(sum(accepted)),
      contentHash: hash,
    }),
    pending: { items: pending, totals: usd(sum(pending)) },
    original: { totals: usd(1020) },
    repricing,
  };
}

function renderModal(extra: { plan?: TreatmentPlan; role?: ClinicRole } = {}) {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    onAccepted: jest.fn(),
    onStale: jest.fn(),
    token: 'tok',
    patientId: 'p1',
    plan: extra.plan ?? planOf(),
    role: extra.role ?? ('DENTIST' as ClinicRole),
  };
  render(<AcceptPartialPlanModal {...props} />);
  return props;
}

const text = (el: Element) => (el.textContent ?? '').replace(/\s/g, ' ');

async function totals() {
  return screen.findByRole('region', { name: 'Totales de la aceptación parcial' });
}

describe('AcceptPartialPlanModal (DX-417)', () => {
  beforeEach(() => {
    mockedQuote.mockReset().mockResolvedValue(QUOTE);
    mockedAccept.mockReset();
    mockedPreview.mockReset().mockImplementation(async (_t, _p, _pl, input) => previewOf(input.itemIds));
    mockedGetPlan.mockReset();
    (listLocations as jest.Mock).mockResolvedValue([clinicLocation({ id: 'loc-1', locale: 'es-VE' })]);
  });

  it('elegir procedimientos pide la vista previa con esos ids y enseña los totales del servidor; firma lo aceptado', async () => {
    const user = userEvent.setup();
    const accepted = planQuoteFixture({
      planStatus: 'ACCEPTED',
      acceptance: { ...SIGNED_ACCEPTANCE, pendingPlanId: 'plan-2', pendingItemIds: ['i3'], pendingTotal: 40 },
    });
    mockedAccept.mockResolvedValue(accepted);
    const props = renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Aceptar en parte' });
    await within(dialog).findByLabelText('Aceptar Implante');
    // Sin elegir nada, el servidor lo dice (400) y no se continúa.
    mockedPreview.mockRejectedValueOnce(new ApiError(400, 'Elige al menos un procedimiento para aceptar.'));
    expect(await within(dialog).findByText('Elige al menos un procedimiento para aceptar.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Continuar' })).toBeDisabled();

    await user.click(within(dialog).getByLabelText('Aceptar Resina'));
    await user.click(within(dialog).getByLabelText('Aceptar Implante'));
    const region = await totals();
    // DX-378: importes con el código ISO y el formato de la sede (es-VE).
    await waitFor(() => expect(text(region)).toContain('USD 980,00'));
    expect(text(region)).toContain('USD 40,00');
    expect(text(region)).toContain('USD 1.020,00');
    expect(mockedPreview).toHaveBeenLastCalledWith('tok', 'p1', 'plan-1', { itemIds: ['i1', 'i2'] });
    expect(await violations(dialog)).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    const summary = await within(dialog).findByRole('region', { name: 'Lo que se acepta y se firma' });
    expect(summary).toHaveTextContent('Implante');
    expect(summary).not.toHaveTextContent('Limpieza');
    expect(await violations(dialog)).toEqual([]);
    const submit = within(dialog).getByRole('button', { name: 'Aceptar en parte y firmar' });
    expect(submit).toBeDisabled();
    sign();
    await user.click(submit);
    await user.click(submit);
    expect(mockedAccept).toHaveBeenCalledTimes(1);
    expect(mockedAccept).toHaveBeenCalledWith('tok', 'p1', 'plan-1', {
      signerName: 'Ana Pérez',
      signature: 'data:image/png;base64,FIRMA',
      contentHash: 'h-i1i2',
      partial: { itemIds: ['i1', 'i2'] },
    });
    await waitFor(() => expect(props.onAccepted).toHaveBeenCalledWith(accepted));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('los ya aceptados o realizados salen marcados y fijos, con el porqué, y van en la vista previa', async () => {
    renderModal({ plan: planOf({ items: [planItem('i1', 'ACCEPTED'), planItem('i2', 'DONE'), planItem('i3')] }) });
    const implant = await screen.findByLabelText('Aceptar Implante');
    expect(implant).toBeChecked();
    expect(implant).toBeDisabled();
    expect(implant).toHaveAccessibleDescription('Ya aceptado o realizado: forma parte de lo aceptado.');
    expect(screen.getByLabelText('Aceptar Resina')).toBeDisabled();
    expect(screen.getByLabelText('Aceptar Limpieza')).not.toBeChecked();
    expect(screen.getByLabelText('Aceptar Limpieza')).toBeEnabled();
    await totals();
    expect(mockedPreview).toHaveBeenCalledWith('tok', 'p1', 'plan-1', { itemIds: ['i1', 'i2'] });
  });

  it('todos elegidos: el texto del servidor junto al botón y sin continuar', async () => {
    const user = userEvent.setup();
    mockedPreview.mockImplementation(async (_t, _p, _pl, input) => {
      if (input.itemIds.length === 3) throw new ApiError(400, 'Has elegido todos los procedimientos: acéptalo entero.');
      if (input.itemIds.length === 0) throw new ApiError(400, 'Elige al menos un procedimiento para aceptar.');
      return previewOf(input.itemIds);
    });
    renderModal();
    await screen.findByText('Elige al menos un procedimiento para aceptar.');
    for (const name of ['Implante', 'Resina', 'Limpieza']) await user.click(screen.getByLabelText(`Aceptar ${name}`));
    expect(await screen.findByText('Has elegido todos los procedimientos: acéptalo entero.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    expect(screen.queryByRole('region', { name: 'Totales de la aceptación parcial' })).not.toBeInTheDocument();
  });

  it('con espera y una sola en vuelo: varios clics seguidos son UNA vista previa; la siguiente espera a la anterior', async () => {
    const user = userEvent.setup();
    let release: (() => void) | null = null;
    mockedPreview.mockImplementation(
      (_t, _p, _pl, input) =>
        new Promise((resolve) => {
          release = () => resolve(previewOf(input.itemIds));
        }),
    );
    renderModal();
    await screen.findByLabelText('Aceptar Implante');
    await waitFor(() => expect(mockedPreview).toHaveBeenCalledTimes(1)); // la selección inicial (vacía)
    await user.click(screen.getByLabelText('Aceptar Implante'));
    await user.click(screen.getByLabelText('Aceptar Resina'));
    await new Promise((r) => setTimeout(r, PARTIAL_PREVIEW_DEBOUNCE_MS + 100));
    // La primera sigue en vuelo: la de la selección nueva no sale todavía.
    expect(mockedPreview).toHaveBeenCalledTimes(1);
    release!();
    await waitFor(() => expect(mockedPreview).toHaveBeenCalledTimes(2));
    expect(mockedPreview).toHaveBeenLastCalledWith('tok', 'p1', 'plan-1', { itemIds: ['i1', 'i2'] });
    release!();
    await totals();
  });

  it('409 por abonos en la vista previa: el mensaje del servidor dentro del modal y solo cerrar', async () => {
    mockedPreview.mockRejectedValue(
      new ApiError(409, 'El plan tiene abonos registrados: no se acepta en parte. Anula los abonos o acéptalo entero.'),
    );
    renderModal();
    expect(await screen.findByText('No se puede aceptar en parte')).toBeInTheDocument();
    expect(screen.getByText(/tiene abonos registrados/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
  });

  it('un fallo de red en la vista previa se reintenta', async () => {
    const user = userEvent.setup();
    mockedPreview.mockRejectedValueOnce(new Error('red'));
    renderModal();
    await screen.findByText('No pudimos calcular los totales.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await totals();
  });

  it('409 sin código al firmar (el presupuesto cambió): otra vista previa y otra firma con su huella', async () => {
    const user = userEvent.setup();
    mockedAccept
      .mockRejectedValueOnce(
        new ApiError(409, 'El presupuesto cambió desde que se mostró: revísalo de nuevo con el paciente antes de firmar.'),
      )
      .mockResolvedValueOnce(planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE }));
    renderModal();
    await chooseAndContinue(user);
    await screen.findByRole('region', { name: 'Lo que se acepta y se firma' });
    mockedPreview.mockResolvedValueOnce(previewOf(['i1'], { hash: 'nueva' }));
    const before = mockedPreview.mock.calls.length;
    sign();
    await user.click(screen.getByRole('button', { name: 'Aceptar en parte y firmar' }));
    expect(await screen.findByText(/El presupuesto cambió desde que se mostró/)).toBeInTheDocument();
    await waitFor(() => expect(mockedPreview).toHaveBeenCalledTimes(before + 1));
    const submit = await screen.findByRole('button', { name: 'Aceptar en parte y firmar' });
    await waitFor(() => expect(screen.getByRole('img', { name: 'Firma del paciente' })).toBeInTheDocument());
    expect(submit).toBeDisabled();
    sign();
    await user.click(submit);
    expect(mockedAccept).toHaveBeenLastCalledWith(
      'tok',
      'p1',
      'plan-1',
      expect.objectContaining({ contentHash: 'nueva', partial: { itemIds: ['i1'] } }),
    );
  });

  it('PARTIAL_PLAN_ALREADY_ACCEPTED al firmar (otra firma ganó): cierra y el padre recarga', async () => {
    const user = userEvent.setup();
    mockedAccept.mockRejectedValueOnce(
      new ApiError(409, 'El plan ya está aceptado: no se puede aceptar en parte.', { code: 'PARTIAL_PLAN_ALREADY_ACCEPTED' }),
    );
    const props = renderModal();
    await chooseAndContinue(user);
    await screen.findByRole('region', { name: 'Lo que se acepta y se firma' });
    sign();
    await user.click(screen.getByRole('button', { name: 'Aceptar en parte y firmar' }));
    await waitFor(() => expect(props.onStale).toHaveBeenCalled());
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onAccepted).not.toHaveBeenCalled();
  });
});

describe('AcceptPartialPlanModal — presupuesto vencido (DX-417 + DX-379 C)', () => {
  const REPRICING = {
    planId: 'plan-1',
    currency: 'USD',
    previewHash: 'p'.repeat(64),
    lines: [],
    skipped: [],
    rate: null,
    previousValidity: { issuedOn: '2026-10-16', validUntil: '2026-11-15' },
    validityRenewed: true,
    validityNote: null,
    validity: { issuedOn: '2026-11-20', validUntil: '2026-12-20' },
    totals: { before: 1020, after: 1100, difference: 80 },
  } satisfies NonNullable<PartialAcceptancePreview['repricing']>;

  beforeEach(() => {
    mockedQuote.mockReset().mockResolvedValue(QUOTE);
    mockedAccept.mockReset().mockResolvedValue(planQuoteFixture({ planStatus: 'ACCEPTED', acceptance: SIGNED_ACCEPTANCE }));
    mockedPreview
      .mockReset()
      .mockImplementation(async (_t, _p, _pl, input) =>
        input.reprice ? previewOf(input.itemIds, { hash: 'repriced', repricing: REPRICING }) : previewOf(input.itemIds),
      );
    mockedGetPlan.mockReset();
    (listLocations as jest.Mock).mockResolvedValue([clinicLocation({ id: 'loc-1', locale: 'es-VE' })]);
  });

  const expiredPlan = () => planOf({ quoteExpired: true });

  it('tres pasos; «Actualizar los precios» repite la vista previa con `reprice` y firma con sus dos huellas', async () => {
    const user = userEvent.setup();
    renderModal({ plan: expiredPlan() });
    await chooseAndContinueExpired(user);
    const group = await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    expect(within(group).getByRole('radio', { name: /Actualizar los precios y aceptar/ })).toBeChecked();
    expect(await violations(screen.getByRole('dialog'))).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('region', { name: 'Lo que se acepta y se firma' });
    expect(mockedPreview).toHaveBeenLastCalledWith('tok', 'p1', 'plan-1', { itemIds: ['i1'], reprice: true });
    sign();
    await user.click(screen.getByRole('button', { name: 'Aceptar en parte y firmar' }));
    expect(mockedAccept).toHaveBeenCalledWith('tok', 'p1', 'plan-1', {
      signerName: 'Ana Pérez',
      signature: 'data:image/png;base64,FIRMA',
      contentHash: 'repriced',
      expired: { mode: 'REPRICE', repricePreviewHash: 'p'.repeat(64) },
      partial: { itemIds: ['i1'] },
    });
  });

  it('precios originales: motivo, vista previa sin `reprice`, aviso de que lo pendiente queda vencido', async () => {
    const user = userEvent.setup();
    renderModal({ plan: expiredPlan() });
    await chooseAndContinueExpired(user);
    await user.click(await screen.findByRole('radio', { name: /Aceptar con los precios originales/ }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Elige el motivo para aceptarlo con los precios originales.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Motivo'), 'LOYALTY');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('region', { name: 'Lo que se acepta y se firma' });
    expect(screen.getByText('Lo pendiente quedará vencido hasta que actualices sus precios.')).toBeInTheDocument();
    expect(mockedPreview).not.toHaveBeenCalledWith('tok', 'p1', 'plan-1', expect.objectContaining({ reprice: true }));
    sign();
    await user.click(screen.getByRole('button', { name: 'Aceptar en parte y firmar' }));
    expect(mockedAccept).toHaveBeenCalledWith('tok', 'p1', 'plan-1', {
      signerName: 'Ana Pérez',
      signature: 'data:image/png;base64,FIRMA',
      contentHash: 'h-i1',
      expired: { mode: 'ORIGINAL_PRICES', reason: 'LOYALTY' },
      partial: { itemIds: ['i1'] },
    });
  });

  it('REPRICE_INCOMPLETE (algún procedimiento, elegido o no, sin precio vigente): vuelve a la elección y sugiere los originales', async () => {
    const user = userEvent.setup();
    mockedPreview.mockImplementation(async (_t, _p, _pl, input) => {
      if (input.reprice) {
        throw new ApiError(409, 'Algún procedimiento propuesto no tiene precio vigente.', { code: 'REPRICE_INCOMPLETE' });
      }
      return previewOf(input.itemIds);
    });
    renderModal({ plan: expiredPlan() });
    await chooseAndContinueExpired(user);
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    const group = await screen.findByRole('radiogroup', { name: 'Cómo aceptarlo' });
    await waitFor(() =>
      expect(within(group).queryByRole('radio', { name: /Actualizar los precios/ })).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Algún procedimiento del presupuesto, también entre los que no se aceptan ahora, no tiene precio vigente/),
    ).toBeInTheDocument();
    expect(screen.getByText(/precios originales indicando el motivo/)).toBeInTheDocument();
  });

  async function chooseAndContinueExpired(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByLabelText('Aceptar Implante'));
    await totals();
    // «Procedimientos» va con los precios del presupuesto: sin `reprice`.
    await waitFor(() => expect(mockedPreview).toHaveBeenLastCalledWith('tok', 'p1', 'plan-1', { itemIds: ['i1'] }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
  }
});

async function chooseAndContinue(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByLabelText('Aceptar Implante'));
  await totals();
  await waitFor(() => expect(mockedPreview).toHaveBeenLastCalledWith('tok', 'p1', 'plan-1', { itemIds: ['i1'] }));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
}
