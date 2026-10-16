import { apiFetch } from '../api/client';
import {
  acceptPlan,
  canAcceptPlan,
  canPrintPlanQuote,
  getPlanQuote,
  isPlanAcceptable,
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
        acceptance: { signerName: 'Ana', acceptedAt: '2026-10-16T15:00:00Z' },
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
});
