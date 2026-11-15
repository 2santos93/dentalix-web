import type { AccountStatement } from '@/lib/account-statement/account-statement-api';
import type { PaymentLinkTarget } from './payment-links-api';

/** Un destino que se puede cobrar por enlace: un plan con saldo o un saldo migrado pendiente. */
export interface PaymentLinkTargetOption {
  /** `plan:<id>` u `opening:<id>`. */
  key: string;
  target: PaymentLinkTarget;
  label: string;
  currency: string;
  /** La próxima cuota pendiente del plan o, si no hay, su saldo. */
  suggestedAmount: number;
  suggestedFrom: 'installment' | 'balance';
}

export const planTargetKey = (planId: string) => `plan:${planId}`;

// Un plan rechazado o cancelado no se cobra (la API da 409).
const NOT_CHARGEABLE = new Set(['DRAFT', 'REJECTED', 'CANCELLED']);

/**
 * DX-569 (D2): los destinos del enlace de pago, sacados del estado de cuenta.
 * El importe sugerido es la próxima cuota con algo pendiente del plan (la de
 * fecha más temprana) o, sin plan de cuotas, su saldo; el de un saldo migrado,
 * lo que queda de él. La moneda es siempre la del destino.
 */
export function paymentLinkTargets(
  statement: Pick<AccountStatement, 'plans' | 'installments' | 'openingBalances'>,
  planName: (id: string) => string,
  openingName: (concept: string) => string,
): PaymentLinkTargetOption[] {
  const plans = statement.plans
    .filter((p) => !NOT_CHARGEABLE.has(p.status) && p.countsTowardsBalance && p.balance > 0)
    .map((plan): PaymentLinkTargetOption => {
      const next = statement.installments
        .filter((i) => i.treatmentPlanId === plan.id && i.outstanding > 0)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      return {
        key: planTargetKey(plan.id),
        target: { treatmentPlanId: plan.id },
        label: planName(plan.id),
        currency: plan.currency,
        suggestedAmount: next ? Math.min(next.outstanding, plan.balance) : plan.balance,
        suggestedFrom: next ? 'installment' : 'balance',
      };
    });
  const openings = statement.openingBalances
    .filter((o) => o.pending > 0)
    .map(
      (o): PaymentLinkTargetOption => ({
        key: `opening:${o.id}`,
        target: { openingBalanceId: o.id },
        label: openingName(o.concept),
        currency: o.currency,
        suggestedAmount: o.pending,
        suggestedFrom: 'balance',
      }),
    );
  return [...plans, ...openings];
}
