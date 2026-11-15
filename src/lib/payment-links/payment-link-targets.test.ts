import { accountStatementFixture } from '@/lib/test/account-statement';
import { paymentLinkTargets } from './payment-link-targets';

const name = (id: string) => `Plan ${id}`;
const opening = (concept: string) => `Saldo migrado · ${concept}`;

describe('paymentLinkTargets (DX-569)', () => {
  it('el plan cobrable con su próxima cuota pendiente; el cancelado no entra', () => {
    const targets = paymentLinkTargets(accountStatementFixture(), name, opening);
    expect(targets).toEqual([
      {
        key: 'plan:plan-1',
        target: { treatmentPlanId: 'plan-1' },
        label: 'Plan plan-1',
        currency: 'VES',
        suggestedAmount: 250000,
        suggestedFrom: 'installment',
      },
    ]);
  });

  it('sin cuotas pendientes, el saldo del plan; y el saldo migrado pendiente, en su moneda', () => {
    const base = accountStatementFixture();
    const targets = paymentLinkTargets(
      {
        ...base,
        installments: [],
        openingBalances: [
          { id: 'ob-1', currency: 'USD', amount: 100, asOfDate: '2026-01-01', asOfDateApproximate: false, concept: 'Ortodoncia', importBatchId: 'b-1', paid: 60, pending: 40 },
          { id: 'ob-2', currency: 'USD', amount: 50, asOfDate: '2026-01-01', asOfDateApproximate: false, concept: 'Saldado', importBatchId: 'b-1', paid: 50, pending: 0 },
        ],
      },
      name,
      opening,
    );
    expect(targets.map((t) => [t.key, t.suggestedAmount, t.suggestedFrom, t.currency])).toEqual([
      ['plan:plan-1', 1800000, 'balance', 'VES'],
      ['opening:ob-1', 40, 'balance', 'USD'],
    ]);
    expect(targets[1].label).toBe('Saldo migrado · Ortodoncia');
  });

  it('un borrador con saldo se cobra, como en la API (DX-109); el rechazado no', () => {
    const base = accountStatementFixture();
    const plan = base.plans.find((p) => p.id === 'plan-1')!;
    const statement = {
      ...base,
      installments: [],
      plans: [
        { ...plan, id: 'draft', status: 'DRAFT' as const },
        { ...plan, id: 'rejected', status: 'REJECTED' as const },
      ],
    };
    expect(paymentLinkTargets(statement, name, opening).map((t) => t.key)).toEqual(['plan:draft']);
  });
});
