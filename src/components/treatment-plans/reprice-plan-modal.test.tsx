import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { STAMP_SEDES, testStamp } from '@/lib/test/stamp';
import {
  applyRepricing,
  previewRepricing,
  type AppliedRepricing,
  type RepricingLine,
  type RepricingPreview,
} from '@/lib/treatment-plans/plan-repricing-api';
import type { TreatmentPlan, TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import { ITEM_WITHOUT_DISCOUNT, PLAN_WITHOUT_OPTIONS } from './plan-fixture';
import { RepricePlanModal } from './reprice-plan-modal';

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
jest.mock('../../lib/treatment-plans/plan-repricing-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/plan-repricing-api'),
  previewRepricing: jest.fn(),
  applyRepricing: jest.fn(),
}));

const mockedPreview = jest.mocked(previewRepricing);
const mockedApply = jest.mocked(applyRepricing);

/** axe estructural en jsdom (sin colores ni geometría: los cubre el e2e). */
async function violations(element: Element) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function item(id: string, catalogItemId: string, tooth: string): TreatmentPlanItem {
  return {
    id,
    tenantId: 't1',
    planId: 'plan-1',
    toothNumber: tooth,
    surfaces: [],
    catalogItemId,
    price: 100,
    discount: 0,
    visit: 1,
    ...ITEM_WITHOUT_DISCOUNT,
    status: 'PROPOSED',
    notes: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

const NAMES: Record<string, string> = { c1: 'Resina compuesta', c2: 'Limpieza', c3: 'Corona' };

const PLAN: TreatmentPlan = {
  id: 'plan-1',
  tenantId: 't1',
  patientId: 'p1',
  status: 'PRESENTED',
  currency: 'USD',
  notes: null,
  createdById: null,
  ...PLAN_WITHOUT_OPTIONS,
  presentedAt: '2026-10-01T14:00:00.000Z',
  presentedLocationId: 'sede-caracas',
  quoteIssuedOn: '2026-10-01',
  quoteValidUntil: '2026-10-31',
  quoteExpired: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  items: [item('i1', 'c1', '11'), item('i2', 'c2', ''), item('i3', 'c3', '21')],
  total: 300,
  acceptance: null,
};

const price = (total: number) => ({
  price: total,
  discount: 0,
  total,
  listPrice: total,
  priceSource: 'CATALOG' as const,
  agreementId: null,
  agreementName: null,
});

function line(itemId: string, catalogItemId: string, tooth: string, before: number, after: number): RepricingLine {
  return {
    itemId,
    catalogItemId,
    toothNumber: tooth,
    before: price(before),
    after: price(after),
    difference: after - before,
    changed: after !== before,
  };
}

const L1 = line('i1', 'c1', '11', 100, 120);
const L2 = line('i2', 'c2', '', 100, 90);

function preview(overrides: Partial<RepricingPreview> = {}): RepricingPreview {
  return {
    planId: 'plan-1',
    currency: 'USD',
    previewHash: 'a'.repeat(64),
    lines: [L1, L2],
    skipped: [{ itemId: 'i3', catalogItemId: 'c3', toothNumber: '21', reason: 'NO_CURRENT_PRICE', currency: null }],
    rate: null,
    previousValidity: { issuedOn: '2026-10-01', validUntil: '2026-10-31' },
    validityRenewed: false,
    validityNote: 'Quedan ítems con precios anteriores: la validez no se renueva.',
    validity: { issuedOn: '2026-10-01', validUntil: '2026-10-31' },
    totals: { before: 300, after: 310, difference: 10 },
    ...overrides,
  };
}

const RENEWED = {
  validityRenewed: true,
  validityNote: null,
  validity: { issuedOn: '2026-11-09', validUntil: '2026-12-09' },
};

function applied(p: RepricingPreview, overrides: Partial<AppliedRepricing> = {}): AppliedRepricing {
  return { ...p, repricingId: 'r1', appliedAt: '2026-11-09T15:00:00.000Z', replayed: false, ...overrides };
}

function renderModal(plan: TreatmentPlan = PLAN) {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    onRepriced: jest.fn(),
    token: 'tok',
    patientId: 'p1',
    plan,
    role: 'DENTIST' as const,
    procedureOf: (i: TreatmentPlanItem) => NAMES[i.catalogItemId],
    stamp: testStamp([STAMP_SEDES.caracas]),
  };
  const view = render(<RepricePlanModal {...props} />);
  return { props, ...view };
}

async function openedDialog() {
  const dialog = await screen.findByRole('dialog', { name: 'Actualizar precios' });
  await within(dialog).findByRole('table', { name: 'Procedimientos a actualizar' });
  return dialog;
}

describe('RepricePlanModal (DX-379 B)', () => {
  beforeEach(() => {
    mockedPreview.mockReset();
    mockedApply.mockReset();
    jest.mocked(toast.success).mockReset();
  });

  it('vista previa: antes, vigente y diferencia por ítem; los saltados con su motivo; totales', async () => {
    mockedPreview.mockResolvedValue(preview({ ...RENEWED }));
    renderModal();
    const dialog = await openedDialog();
    expect(mockedPreview).toHaveBeenCalledWith('tok', 'p1', 'plan-1');
    const table = within(dialog).getByRole('table', { name: 'Procedimientos a actualizar' });
    const row1 = within(table).getByRole('row', { name: /Resina compuesta/ });
    expect(row1).toHaveTextContent('Diente 11');
    expect(row1).toHaveTextContent('USD 100,00');
    expect(row1).toHaveTextContent('USD 120,00');
    expect(row1).toHaveTextContent('Sube USD 20,00');
    const row2 = within(table).getByRole('row', { name: /Limpieza/ });
    expect(row2).toHaveTextContent('Baja USD 10,00');
    const skipped = within(dialog).getByRole('region', { name: 'No se actualizan' });
    expect(skipped).toHaveTextContent('Corona');
    expect(skipped).toHaveTextContent('No tiene precio vigente en el catálogo: conserva su precio.');
    const totals = within(dialog).getByRole('region', { name: 'Totales del plan' });
    expect(totals).toHaveTextContent(/300,00/);
    expect(totals).toHaveTextContent(/310,00/);
    expect(within(dialog).getByTestId('reprice-validity')).toHaveTextContent('La validez se renueva hasta el 09/12/2026.');
    // Todas marcadas por defecto.
    expect(within(dialog).getByRole('checkbox', { name: 'Actualizar Resina compuesta' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Actualizar Limpieza' })).toBeChecked();
  });

  it('una línea sin cambio dice «Sin cambio»; con tasa, la línea de la conversión', async () => {
    mockedPreview.mockResolvedValue(
      preview({
        ...RENEWED,
        currency: 'VES',
        lines: [line('i1', 'c1', '11', 4000, 4000), L2],
        rate: { currency: 'USD', fromPerBase: 1, toPerBase: 40, source: 'MANUAL', rateDate: '2026-11-08' },
      }),
    );
    renderModal({ ...PLAN, currency: 'VES' });
    const dialog = await openedDialog();
    expect(within(dialog).getByRole('row', { name: /Resina compuesta/ })).toHaveTextContent('Sin cambio');
    expect(within(dialog).getByRole('region', { name: 'Totales del plan' })).toHaveTextContent(
      'Convertido con la tasa 1 USD = 40 VES del 08/11/2026, manual.',
    );
  });

  it('validityNote es un aviso (no un error) y no impide continuar', async () => {
    mockedPreview.mockResolvedValue(preview());
    renderModal();
    const dialog = await openedDialog();
    expect(within(dialog).getByText('Quedan ítems con precios anteriores: la validez no se renueva.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Continuar' })).toBeEnabled();
  });

  it('selección parcial: vuelve a pedir la vista previa con los itemIds y aplica con la misma clave y huella', async () => {
    const user = userEvent.setup();
    const partial = preview({ previewHash: 'b'.repeat(64), lines: [L2], totals: { before: 300, after: 290, difference: -10 } });
    mockedPreview.mockResolvedValueOnce(preview({ ...RENEWED })).mockResolvedValueOnce(partial);
    mockedApply.mockResolvedValue(applied(partial));
    const { props } = renderModal();
    const dialog = await openedDialog();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Actualizar Resina compuesta' }));
    await waitFor(() => expect(mockedPreview).toHaveBeenLastCalledWith('tok', 'p1', 'plan-1', ['i2']));
    await within(dialog).findByText('Quedan ítems con precios anteriores: la validez no se renueva.');
    expect(within(dialog).getByRole('region', { name: 'Totales del plan' })).toHaveTextContent(/290,00/);

    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    const summary = within(dialog).getByRole('region', { name: 'Resumen de la actualización' });
    expect(summary).toHaveTextContent('1 procedimiento');
    expect(summary).toHaveTextContent(/300,00.*→.*290,00/);
    expect(summary).toHaveTextContent('Se conserva la anterior');

    await user.click(within(dialog).getByRole('button', { name: 'Actualizar precios' }));
    await waitFor(() => expect(props.onRepriced).toHaveBeenCalled());
    const [, , , input, key] = mockedApply.mock.calls[0];
    expect(input).toEqual({ previewHash: 'b'.repeat(64), itemIds: ['i2'] });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(toast.success).toHaveBeenCalledWith('Precios actualizados');
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('todas elegidas: aplica sin itemIds; replayed también es éxito', async () => {
    const user = userEvent.setup();
    const full = preview({ ...RENEWED });
    mockedPreview.mockResolvedValue(full);
    mockedApply.mockResolvedValue(applied(full, { replayed: true }));
    const { props } = renderModal();
    const dialog = await openedDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    expect(within(dialog).getByRole('region', { name: 'Resumen de la actualización' })).toHaveTextContent(
      'La validez se renueva hasta el 09/12/2026.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Actualizar precios' }));
    await waitFor(() => expect(props.onRepriced).toHaveBeenCalled());
    expect(mockedApply.mock.calls[0][3]).toEqual({ previewHash: 'a'.repeat(64) });
    expect(toast.success).toHaveBeenCalledWith('Precios actualizados');
  });

  it('nada que actualizar (todo igual o todo saltado): aplicar deshabilitado con la explicación', async () => {
    mockedPreview.mockResolvedValue(
      preview({
        lines: [],
        skipped: [{ itemId: 'i1', catalogItemId: 'c1', toothNumber: '11', reason: 'NO_RATE', currency: 'USD' }],
      }),
    );
    renderModal({ ...PLAN, currency: 'VES' });
    const dialog = await screen.findByRole('dialog', { name: 'Actualizar precios' });
    await within(dialog).findByRole('region', { name: 'No se actualizan' });
    expect(within(dialog).getByText(/No hay tasa de USD para hoy/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Continuar' })).toBeDisabled();
    expect(
      within(dialog).getByText('Ningún procedimiento propuesto tiene precio vigente: no hay nada que actualizar.'),
    ).toBeInTheDocument();
  });

  it('los precios ya al día y la validez ya es la de hoy: deshabilitado', async () => {
    mockedPreview.mockResolvedValue(
      preview({
        ...RENEWED,
        previousValidity: RENEWED.validity,
        lines: [line('i1', 'c1', '11', 100, 100)],
        skipped: [],
      }),
    );
    renderModal();
    const dialog = await openedDialog();
    expect(within(dialog).getByRole('button', { name: 'Continuar' })).toBeDisabled();
    expect(within(dialog).getByText('Los precios ya están al día: no hay nada que actualizar.')).toBeInTheDocument();
  });

  it('409 REPRICE_PREVIEW_STALE: mensaje y «Volver a la vista previa» con otra clave', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(preview({ ...RENEWED }));
    mockedApply.mockRejectedValueOnce(
      new ApiError(409, 'stale', {
        code: 'REPRICE_PREVIEW_STALE',
        messages: ['Los precios vigentes cambiaron desde la vista previa: revísala de nuevo.'],
      }),
    );
    renderModal();
    const dialog = await openedDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    await user.click(within(dialog).getByRole('button', { name: 'Actualizar precios' }));
    expect(
      await within(dialog).findByText('Los precios vigentes cambiaron desde la vista previa: revísala de nuevo.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Actualizar precios' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Volver a la vista previa' }));
    await waitFor(() => expect(mockedPreview).toHaveBeenCalledTimes(2));
    await within(dialog).findByRole('table', { name: 'Procedimientos a actualizar' });
    mockedApply.mockResolvedValueOnce(applied(preview({ ...RENEWED })));
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    await user.click(within(dialog).getByRole('button', { name: 'Actualizar precios' }));
    await waitFor(() => expect(mockedApply).toHaveBeenCalledTimes(2));
    expect(mockedApply.mock.calls[1][4]).not.toBe(mockedApply.mock.calls[0][4]);
  });

  it('422 IDEMPOTENCY_KEY_REUSED: otra clave y de vuelta al paso 1', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(preview({ ...RENEWED }));
    mockedApply
      .mockRejectedValueOnce(
        new ApiError(422, 'reused', { code: 'IDEMPOTENCY_KEY_REUSED', messages: ['La clave ya se usó para otra petición.'] }),
      )
      .mockResolvedValueOnce(applied(preview({ ...RENEWED })));
    renderModal();
    const dialog = await openedDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    await user.click(within(dialog).getByRole('button', { name: 'Actualizar precios' }));
    expect(await within(dialog).findByText('La clave ya se usó para otra petición.')).toBeInTheDocument();
    await within(dialog).findByRole('table', { name: 'Procedimientos a actualizar' });
    expect(mockedPreview).toHaveBeenCalledTimes(2);
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    await user.click(within(dialog).getByRole('button', { name: 'Actualizar precios' }));
    await waitFor(() => expect(mockedApply).toHaveBeenCalledTimes(2));
    expect(mockedApply.mock.calls[1][4]).not.toBe(mockedApply.mock.calls[0][4]);
  });

  it('409 por el estado del plan: el mensaje del servidor en el modal, sin reintento', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(preview({ ...RENEWED }));
    mockedApply.mockRejectedValueOnce(
      new ApiError(409, 'payments', { messages: ['El plan tiene abonos: sus precios ya no se actualizan.'] }),
    );
    renderModal();
    const dialog = await openedDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    await user.click(within(dialog).getByRole('button', { name: 'Actualizar precios' }));
    expect(await within(dialog).findByText('El plan tiene abonos: sus precios ya no se actualizan.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Actualizar precios' })).toBeDisabled();
  });

  it('la vista previa que el plan no admite: el mensaje del servidor sin «Reintentar»; un fallo de red, con él', async () => {
    mockedPreview.mockRejectedValueOnce(
      new ApiError(409, 'accepted', { messages: ['El plan está «Aceptado»: sus precios ya no se actualizan.'] }),
    );
    const { unmount } = renderModal();
    const dialog = await screen.findByRole('dialog', { name: 'Actualizar precios' });
    expect(await within(dialog).findByText('El plan está «Aceptado»: sus precios ya no se actualizan.')).toBeInTheDocument();
    expect(within(dialog).getByText('No se pueden actualizar los precios')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    unmount();

    mockedPreview.mockRejectedValueOnce(new ApiError(503, 'down'));
    renderModal();
    const again = await screen.findByRole('dialog', { name: 'Actualizar precios' });
    expect(await within(again).findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('axe limpio en los dos pasos', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(preview());
    renderModal();
    const dialog = await openedDialog();
    expect(await violations(dialog)).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));
    expect(await violations(dialog)).toEqual([]);
  });

  it('a 390 px: los nombres largos se parten y la tabla pasa a tarjetas (sin scroll horizontal)', async () => {
    // jsdom no mide: se comprueba que las cajas pueden encogerse y partir palabras.
    const long = 'Rehabilitación-implantosoportada-con-pilar-personalizado-de-zirconio';
    mockedPreview.mockResolvedValue(preview());
    render(
      <RepricePlanModal
        open
        onOpenChange={jest.fn()}
        onRepriced={jest.fn()}
        token="tok"
        patientId="p1"
        plan={PLAN}
        role="DENTIST"
        procedureOf={(i) => (i.catalogItemId === 'c1' ? long : NAMES[i.catalogItemId])}
        stamp={testStamp([STAMP_SEDES.caracas])}
      />,
    );
    const dialog = await openedDialog();
    const name = within(dialog).getByText(long);
    expect(name.parentElement).toHaveClass('min-w-0', 'break-words');
  });
});
