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
import { FORMAT_ES } from '@/lib/test/document-regional';
import { moneyWithCode } from '@/lib/format/sede-number';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';
import { stampPainters } from '@/lib/locations/sede-stamp';
import { testAgendaClock } from '@/lib/test/sede-clock';

const plan: BillablePlan = {
  id: 'plan-1',
  status: 'ACCEPTED',
  currency: 'USD',
  createdAt: '2026-08-01T15:00:00.000Z',
  total: 3000000,
  paid: 1200000,
  paidOtherCurrencies: [],
  balance: 1800000,
  hasActivePaymentPlan: false,
  paymentsWithoutRate: [],
  rateProviderTimedOut: false,
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

const caracas = stampPainters(testAgendaClock([STAMP_SEDES.caracas, STAMP_SEDES.berlin]));
const berlin = stampPainters(testAgendaClock([STAMP_SEDES.berlin, STAMP_SEDES.caracas]));

describe('billablePlanLabel', () => {
  it('el saldo sale con el formato de la sede que lo pinta (DX-354b): es-VE y de-DE, no el del navegador', () => {
    const balance = { ...plan, currency: 'VES', balance: 1234.5 };
    const caracasLabel = billablePlanLabel(balance, FORMAT_ES, caracas.money).replace(/\s/g, ' ');
    const berlinLabel = billablePlanLabel(balance, FORMAT_ES, berlin.money).replace(/\s/g, ' ');
    expect(caracasLabel).toContain(`Saldo ${moneyWithCode(1234.5, 'VES', STAMP_FORMATS.caracas)}`.replace(/\s/g, ' '));
    expect(berlinLabel).toContain(`Saldo ${moneyWithCode(1234.5, 'VES', STAMP_FORMATS.berlin)}`.replace(/\s/g, ' '));
    expect(caracasLabel).toContain('VES 1.234,50');
    expect(berlinLabel).toContain('1.234,50 VES');
    expect(caracasLabel).not.toBe(berlinLabel);
  });

  it('nombra el plan por su fecha, su estado y lo que falta', () => {
    expect(billablePlanLabel(plan, FORMAT_ES, caracas.money).replace(/\s/g, ' ')).toBe(
      'Plan del 01/08/2026 · Aceptado · Saldo USD 1.800.000,00',
    );
  });

  it('un saldo negativo se lee «a favor»', () => {
    expect(billablePlanLabel({ ...plan, balance: -50 }, FORMAT_ES, caracas.money).replace(/\s/g, ' ')).toContain(
      'USD 50,00 a favor',
    );
  });

  it('pinta el saldo con el formateador que recibe (DX-386: el de la sede, con el código ISO)', () => {
    const money = (amount: number, currency: string) => `${currency} ${amount}`;
    expect(billablePlanLabel(plan, FORMAT_ES, money)).toBe('Plan del 01/08/2026 · Aceptado · Saldo USD 1800000');
    expect(billablePlanLabel({ ...plan, balance: -50 }, FORMAT_ES, money)).toContain('USD 50 a favor');
  });
});
