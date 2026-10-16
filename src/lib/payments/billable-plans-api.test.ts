/**
 * Mockea el `fetch` base (mismo enfoque que payments-api.test.ts) y comprueba
 * la ruta de `listBillablePlans`, quién puede cobrar y cómo se nombra un plan.
 */
import {
  billablePlanLabel,
  canRecordPayments,
  listBillablePlans,
  type BillablePlan,
} from './billable-plans-api';

const plan: BillablePlan = {
  id: 'plan-1',
  status: 'ACCEPTED',
  currency: 'COP',
  createdAt: '2026-08-01T15:00:00.000Z',
  total: 3000000,
  paid: 1200000,
  paidOtherCurrencies: [],
  balance: 1800000,
  hasActivePaymentPlan: false,
};

describe('listBillablePlans', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('GET /patients/:id/billable-plans con el token', async () => {
    const spy = jest.fn().mockResolvedValue({ ok: true, json: async () => [plan] });
    global.fetch = spy as unknown as typeof fetch;

    await expect(listBillablePlans('tok', 'pat 1')).resolves.toEqual([plan]);

    const [url, init] = spy.mock.calls[0];
    expect(new URL(String(url), 'http://x').pathname).toMatch(
      /\/patients\/pat%201\/billable-plans$/,
    );
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });
});

describe('canRecordPayments', () => {
  it.each([
    ['ADMIN', true],
    ['RECEPTION', true],
    ['DENTIST', false],
    ['ASSISTANT', false],
  ] as const)('%s -> %s (PAYMENT_ROLES de la API)', (role, expected) => {
    expect(canRecordPayments(role)).toBe(expected);
  });

  it('sin rol legible no cobra', () => {
    expect(canRecordPayments(null)).toBe(false);
  });
});

describe('billablePlanLabel', () => {
  it('nombra el plan por su fecha, su estado y lo que falta', () => {
    expect(billablePlanLabel(plan).replace(/\s/g, ' ')).toBe(
      'Plan del 01/08/2026 · Aceptado · Saldo 1.800.000,00 COP',
    );
  });

  it('un saldo negativo se lee «a favor»', () => {
    expect(billablePlanLabel({ ...plan, balance: -50 }).replace(/\s/g, ' ')).toContain(
      '50,00 COP a favor',
    );
  });
});
