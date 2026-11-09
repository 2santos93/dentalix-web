import { apiFetch } from '../api/client';
import {
  applyRepricing,
  canRepricePlan,
  hasSomethingToApply,
  isPlanRepriceable,
  previewRepricing,
  type RepricingPreview,
} from './plan-repricing-api';

jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  apiFetch: jest.fn(),
}));

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const price = (total: number) => ({
  price: total,
  discount: 0,
  total,
  listPrice: total,
  priceSource: 'CATALOG' as const,
  agreementId: null,
  agreementName: null,
});

function preview(overrides: Partial<RepricingPreview> = {}): RepricingPreview {
  return {
    planId: 'plan-1',
    currency: 'USD',
    previewHash: 'a'.repeat(64),
    lines: [
      { itemId: 'i1', catalogItemId: 'c1', toothNumber: '11', before: price(100), after: price(120), difference: 20, changed: true },
    ],
    skipped: [],
    rate: null,
    previousValidity: { issuedOn: '2026-10-01', validUntil: '2026-10-31' },
    validityRenewed: true,
    validityNote: null,
    validity: { issuedOn: '2026-11-09', validUntil: '2026-12-09' },
    totals: { before: 100, after: 120, difference: 20 },
    ...overrides,
  };
}

describe('plan-repricing-api (DX-379 B)', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('recotizan los roles clínicos (ADMIN, odontólogo, asistente); recepción y sin rol, no', () => {
    expect(canRepricePlan('ADMIN')).toBe(true);
    expect(canRepricePlan('DENTIST')).toBe(true);
    expect(canRepricePlan('ASSISTANT')).toBe(true);
    expect(canRepricePlan('RECEPTION')).toBe(false);
    expect(canRepricePlan(null)).toBe(false);
  });

  it('se recotiza un borrador o un presentado sin firma con algún ítem propuesto', () => {
    const proposed = [{ status: 'PROPOSED' as const }];
    expect(isPlanRepriceable({ status: 'DRAFT', acceptance: null, items: proposed })).toBe(true);
    expect(isPlanRepriceable({ status: 'PRESENTED', acceptance: null, items: proposed })).toBe(true);
    expect(isPlanRepriceable({ status: 'ACCEPTED', acceptance: null, items: proposed })).toBe(false);
    expect(isPlanRepriceable({ status: 'REJECTED', acceptance: null, items: proposed })).toBe(false);
    expect(isPlanRepriceable({ status: 'COMPLETED', acceptance: null, items: proposed })).toBe(false);
    expect(isPlanRepriceable({ status: 'CANCELLED', acceptance: null, items: proposed })).toBe(false);
    expect(
      isPlanRepriceable({
        status: 'PRESENTED',
        acceptance: { signerName: 'Ana', acceptedAt: '2026-10-16T15:00:00Z', remote: null },
        items: proposed,
      }),
    ).toBe(false);
    expect(isPlanRepriceable({ status: 'DRAFT', acceptance: null, items: [] })).toBe(false);
    expect(isPlanRepriceable({ status: 'DRAFT', acceptance: null, items: [{ status: 'DONE' }] })).toBe(false);
  });

  it('hay algo que aplicar si cambia un precio o si se renueva la validez a otra fecha', () => {
    expect(hasSomethingToApply(preview())).toBe(true);
    const unchanged = preview().lines.map((l) => ({ ...l, after: l.before, difference: 0, changed: false }));
    // Mismos precios pero el plan vencido se renueva: aplicar sí hace algo.
    expect(hasSomethingToApply(preview({ lines: unchanged }))).toBe(true);
    // Mismos precios y la validez ya es la de hoy: nada.
    expect(
      hasSomethingToApply(
        preview({ lines: unchanged, previousValidity: { issuedOn: '2026-11-09', validUntil: '2026-12-09' } }),
      ),
    ).toBe(false);
    // Mismos precios y una selección parcial (no renueva): nada.
    expect(
      hasSomethingToApply(preview({ lines: unchanged, validityRenewed: false, validity: preview().previousValidity })),
    ).toBe(false);
    // Todo saltado: nada.
    expect(hasSomethingToApply(preview({ lines: [], validityRenewed: false }))).toBe(false);
  });

  it('POST …/reprice/preview con los ítems elegidos (o sin ellos: todos)', async () => {
    mockedFetch.mockResolvedValue(preview());
    await previewRepricing('tok', 'p 1', 'plan/1');
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p%201/treatment-plans/plan%2F1/reprice/preview', {
      method: 'POST',
      body: {},
      token: 'tok',
    });
    await previewRepricing('tok', 'p1', 'plan-1', ['i1']);
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p1/treatment-plans/plan-1/reprice/preview', {
      method: 'POST',
      body: { itemIds: ['i1'] },
      token: 'tok',
    });
  });

  it('POST …/reprice/apply con la Idempotency-Key, la huella y los mismos ítems', async () => {
    mockedFetch.mockResolvedValue({});
    await applyRepricing('tok', 'p1', 'plan-1', { previewHash: 'h'.repeat(64), itemIds: ['i1'] }, 'key-1');
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p1/treatment-plans/plan-1/reprice/apply', {
      method: 'POST',
      body: { previewHash: 'h'.repeat(64), itemIds: ['i1'] },
      token: 'tok',
      headers: { 'Idempotency-Key': 'key-1' },
    });
    await applyRepricing('tok', 'p1', 'plan-1', { previewHash: 'h'.repeat(64) }, 'key-2');
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p1/treatment-plans/plan-1/reprice/apply', {
      method: 'POST',
      body: { previewHash: 'h'.repeat(64) },
      token: 'tok',
      headers: { 'Idempotency-Key': 'key-2' },
    });
  });
});
