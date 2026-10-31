import type {
  AccountStatement,
  AccountStatementMovement,
  AccountStatementPlan,
} from '@/lib/account-statement/account-statement-api';

/** Un plan con saldo a favor en su moneda (DX-253). */
export interface CreditSource {
  planId: string;
  currency: string;
  /** Saldo a favor (positivo): −saldo del plan. */
  credit: number;
}

export const creditPreviewCopy = {
  source: (plan: string, credit: string) => `${plan} · ${credit} a favor`,
  balance: (amount: string) => `saldo ${amount}`,
  creditLeft: 'Saldo a favor que queda',
  targetBalance: (plan: string) => `Saldo de ${plan} después`,
  previewTitle: 'Vista previa',
};

/**
 * Los planes con saldo a favor en su moneda: el mismo saldo negativo que el
 * estado de cuenta (abonos + traspasos − devoluciones − facturable).
 */
export function creditSources(statement: AccountStatement): CreditSource[] {
  return statement.plans
    .filter((p) => p.balance < 0)
    .map((p) => ({ planId: p.id, currency: p.currency, credit: -p.balance }));
}

/** Planes vivos (que se cobran) de la misma moneda, distintos del origen. */
export function transferTargets(
  statement: AccountStatement,
  source: CreditSource,
): AccountStatementPlan[] {
  return statement.plans.filter(
    (p) => p.countsTowardsBalance && p.id !== source.planId && p.currency === source.currency,
  );
}

/** Abonos vivos del plan: los que se pueden citar como referencia. */
export function referencePayments(
  statement: AccountStatement,
  planId: string,
): AccountStatementMovement[] {
  return statement.movements.filter((m) => m.treatmentPlanId === planId && !m.voided);
}
