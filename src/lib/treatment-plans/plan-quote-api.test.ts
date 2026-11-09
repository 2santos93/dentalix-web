import { apiFetch } from '../api/client';
import {
  acceptPlan,
  canAcceptPlan,
  canPrintPlanQuote,
  getPlanQuote,
  isPlanAcceptable,
  isPendingRest,
  isPlanPartiallyAcceptable,
  issuePlanQuote,
  partialAcceptanceLine,
  partialRestLine,
  previewPartialAcceptance,
  planQuotePrintHref,
  SIGNABLE_PLAN_STATUSES,
} from './plan-quote-api';

jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  apiFetch: jest.fn(),
}));

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('plan-quote-api (DX-012)', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('imprime cualquier rol de la clínica (recepción incluida); sin rol, nadie', () => {
    expect(['ADMIN', 'DENTIST', 'ASSISTANT', 'RECEPTION'].every((r) => canPrintPlanQuote(r as never))).toBe(
      true,
    );
    expect(canPrintPlanQuote(null)).toBe(false);
  });

  it('acepta con firma quien decide el plan: odontólogo y ADMIN (DX-040)', () => {
    expect(canAcceptPlan('DENTIST')).toBe(true);
    expect(canAcceptPlan('ASSISTANT')).toBe(false);
    expect(canAcceptPlan('ADMIN')).toBe(true);
    expect(canAcceptPlan('RECEPTION')).toBe(false);
    expect(canAcceptPlan(null)).toBe(false);
  });

  it('solo se firma un plan sin firmar, abierto y con ítems', () => {
    expect(SIGNABLE_PLAN_STATUSES).toEqual(['DRAFT', 'PRESENTED', 'ACCEPTED']);
    expect(isPlanAcceptable({ status: 'PRESENTED', acceptance: null, items: [{}] })).toBe(true);
    expect(isPlanAcceptable({ status: 'REJECTED', acceptance: null, items: [{}] })).toBe(false);
    expect(isPlanAcceptable({ status: 'DRAFT', acceptance: null, items: [{}] })).toBe(true);
    expect(isPlanAcceptable({ status: 'ACCEPTED', acceptance: null, items: [{}] })).toBe(true);
    expect(isPlanAcceptable({ status: 'DRAFT', acceptance: null, items: [] })).toBe(false);
    expect(isPlanAcceptable({ status: 'CANCELLED', acceptance: null, items: [{}] })).toBe(false);
    expect(
      isPlanAcceptable({
        status: 'ACCEPTED',
        acceptance: { signerName: 'Ana', acceptedAt: '2026-10-16T15:00:00Z', remote: null },
        items: [{}],
      }),
    ).toBe(false);
  });

  it('la ruta imprimible escapa los ids', () => {
    expect(planQuotePrintHref('p 1', 'pl/2')).toBe('/print/patients/p%201/treatment-plans/pl%2F2');
  });

  it('GET …/quote y POST …/acceptance con sus rutas y cuerpo', async () => {
    mockedFetch.mockResolvedValue({});
    await getPlanQuote('tok', 'p1', 'plan1');
    expect(mockedFetch).toHaveBeenCalledWith('/patients/p1/treatment-plans/plan1/quote', { token: 'tok' });

    const body = { signerName: 'Ana', signature: 'data:image/png;base64,AAA', contentHash: 'a'.repeat(64) };
    await acceptPlan('tok', 'p1', 'plan1', body);
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p1/treatment-plans/plan1/acceptance', {
      method: 'POST',
      body,
      token: 'tok',
    });
  });

  it('DX-379: imprimir es POST …/quote/issue, sin cuerpo (fija la validez la primera vez)', async () => {
    mockedFetch.mockResolvedValue({});
    await issuePlanQuote('tok', 'p 1', 'plan/1');
    expect(mockedFetch).toHaveBeenCalledWith('/patients/p%201/treatment-plans/plan%2F1/quote/issue', {
      method: 'POST',
      token: 'tok',
    });
  });

  it('DX-417: la vista previa parcial es POST …/acceptance/partial-preview con los ids (y `reprice` solo si se pide)', async () => {
    mockedFetch.mockResolvedValue({});
    await previewPartialAcceptance('tok', 'p 1', 'plan/1', { itemIds: ['i2', 'i1'] });
    expect(mockedFetch).toHaveBeenCalledWith('/patients/p%201/treatment-plans/plan%2F1/acceptance/partial-preview', {
      method: 'POST',
      body: { itemIds: ['i2', 'i1'] },
      token: 'tok',
    });
    await previewPartialAcceptance('tok', 'p1', 'plan1', { itemIds: ['i1'], reprice: true });
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p1/treatment-plans/plan1/acceptance/partial-preview', {
      method: 'POST',
      body: { itemIds: ['i1'], reprice: true },
      token: 'tok',
    });
  });

  it('DX-417: «Aceptar en parte» solo en un presentado sin aceptación con dos o más propuestos', () => {
    const proposed = { status: 'PROPOSED' as const };
    expect(isPlanPartiallyAcceptable({ status: 'PRESENTED', acceptance: null, items: [proposed, proposed] })).toBe(true);
    expect(isPlanPartiallyAcceptable({ status: 'PRESENTED', acceptance: null, items: [proposed] })).toBe(false);
    expect(
      isPlanPartiallyAcceptable({ status: 'PRESENTED', acceptance: null, items: [proposed, { status: 'ACCEPTED' }] }),
    ).toBe(false);
    expect(isPlanPartiallyAcceptable({ status: 'DRAFT', acceptance: null, items: [proposed, proposed] })).toBe(false);
    expect(isPlanPartiallyAcceptable({ status: 'ACCEPTED', acceptance: null, items: [proposed, proposed] })).toBe(false);
    expect(
      isPlanPartiallyAcceptable({
        status: 'PRESENTED',
        acceptance: { signerName: 'Ana', acceptedAt: '2026-10-16T15:00:00Z', remote: null },
        items: [proposed, proposed],
      }),
    ).toBe(false);
  });

  it('DX-417: la línea del aceptado en parte (fuera del hash) y la del pendiente', () => {
    const money = (amount: number, currency: string) => `${currency} ${amount}`;
    expect(
      partialAcceptanceLine({ pendingItemIds: ['a', 'b'], pendingTotal: 150000, pendingPlanId: 'x' }, 'VES', money),
    ).toBe('Aceptación parcial: 2 procedimientos (VES 150000) quedan en un presupuesto pendiente.');
    expect(partialAcceptanceLine({ pendingItemIds: ['a'], pendingTotal: 80, pendingPlanId: 'x' }, 'USD', money)).toBe(
      'Aceptación parcial: 1 procedimiento (USD 80) queda en un presupuesto pendiente.',
    );
    expect(partialAcceptanceLine({ pendingItemIds: null, pendingTotal: null, pendingPlanId: null }, 'USD', money)).toBeNull();
    expect(partialRestLine('16/10/2026')).toBe('Resto de la aceptación parcial del 16/10/2026');
    expect(partialRestLine(null)).toBe('Resto de una aceptación parcial');
  });

  it('DX-417 (I-1): el pendiente solo es «pendiente» mientras siga presentado y sin aceptar', () => {
    expect(isPendingRest({ splitFromPlanId: 'o', status: 'PRESENTED', acceptance: null })).toBe(true);
    expect(isPendingRest({ splitFromPlanId: null, status: 'PRESENTED', acceptance: null })).toBe(false);
    for (const status of ['ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED'] as const) {
      expect(isPendingRest({ splitFromPlanId: 'o', status, acceptance: null })).toBe(false);
    }
    expect(
      isPendingRest({
        splitFromPlanId: 'o',
        status: 'PRESENTED',
        acceptance: { signerName: 'Ana', acceptedAt: '2026-10-16T15:00:00Z', remote: null },
      }),
    ).toBe(false);
  });
});
