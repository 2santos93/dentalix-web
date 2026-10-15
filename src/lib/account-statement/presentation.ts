import { formatDate } from '@/lib/format/date';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import type { PaymentMethod } from '@/lib/payments/payments-api';
import type {
  AccountStatementInstallment,
  AccountStatementPlan,
} from './account-statement-api';

/**
 * Textos compartidos por la pestaña y el documento impreso del estado de
 * cuenta, para que lo que se ve en pantalla y lo que se entrega en papel digan
 * exactamente lo mismo.
 */
export const statementCopy = {
  planLabel: (createdAt: string) => `Plan del ${formatDate(createdAt)}`,
  unknownPlan: 'Plan',
  downPayment: 'Inicial',
  installment: (sequence: number | null) => `Cuota ${sequence ?? ''}`.trim(),
  methodNone: 'Sin método',
  voided: 'Anulado',
  notCounted: 'No suma al saldo',
  inFavor: 'a favor',
  noOverdue: 'Sin cuotas vencidas',
  overdueCount: (n: number) => (n === 1 ? '1 cuota vencida' : `${n} cuotas vencidas`),
  emptyTitle: 'Sin movimientos financieros',
  emptyDescription: 'Este paciente no tiene planes con valor ni abonos registrados.',
  footnote:
    'Cifras en la moneda en que se presupuestaron o pagaron, sin conversión. Los abonos anulados se listan pero no suman.',
};

/** Nombre de un plan por su id (el plan no tiene título: se nombra por su fecha). */
export function planNamer(plans: AccountStatementPlan[]): (id: string) => string {
  const byId = new Map(plans.map((p) => [p.id, statementCopy.planLabel(p.createdAt)]));
  return (id) => byId.get(id) ?? statementCopy.unknownPlan;
}

export function methodLabel(method: PaymentMethod | null): string {
  return method ? PAYMENT_METHOD_LABELS[method] : statementCopy.methodNone;
}

export function installmentLabel(installment: AccountStatementInstallment): string {
  return installment.kind === 'DOWN_PAYMENT'
    ? statementCopy.downPayment
    : statementCopy.installment(installment.sequence);
}

/** Un paciente sin nada que mostrar: ni saldo, ni planes, ni abonos. */
export function isEmptyStatement(statement: {
  summary: unknown[];
  plans: unknown[];
  movements: unknown[];
  installments: unknown[];
}): boolean {
  return (
    statement.summary.length === 0 &&
    statement.plans.length === 0 &&
    statement.movements.length === 0 &&
    statement.installments.length === 0
  );
}
