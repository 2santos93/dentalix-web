import { formatCivilDate, formatDate } from '@/lib/format/date';
import { PAYMENT_METHOD_LABELS } from '@/lib/payments/payment-method';
import type { PaymentMethod } from '@/lib/payments/payments-api';
import type {
  AccountStatementInstallment,
  AccountStatementMovement,
  AccountStatementOpeningBalance,
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
  // DX-395: referencia del pago junto a su medio.
  referenceLabel: (reference: string) => `Ref. ${reference}`,
  voided: 'Anulado',
  voidedBy: (name: string) => `Anulado por ${name}`,
  voidedByUnknownMember: 'un usuario ajeno a la clínica',
  notCounted: 'No suma al saldo',
  inFavor: 'a favor',
  noOverdue: 'Sin cuotas vencidas',
  overdueCount: (n: number) => (n === 1 ? '1 cuota vencida' : `${n} cuotas vencidas`),
  // DX-262: saldo inicial importado del programa anterior.
  openingHeading: 'Saldo migrado',
  openingTable: 'Saldos migrados',
  // QA D5: lo que queda del saldo migrado tras sus abonos.
  openingIncluded: 'Incluye saldo migrado pendiente:',
  colConcept: 'Concepto',
  colAsOf: 'Fecha de corte',
  approx: 'aprox.',
  colOpeningPaid: 'Abonado',
  colOpeningPending: 'Pendiente',
  openingMovement: (concept: string) => `Saldo migrado · ${concept}`,
  /** M1: el «Saldo» de un resumen con saldo migrado no es solo presupuestado − abonado. */
  balanceIncludesOpening: 'El saldo incluye el saldo migrado del programa anterior.',
  openingNote: 'Deuda traída del programa anterior al importar los pacientes.',
  /** QA D3: solo si alguna fila es aproximada. */
  openingApproxNote: '«aprox.»: el archivo no traía la fecha y se tomó la de la importación.',
  emptyTitle: 'Sin movimientos financieros',
  emptyDescription: 'Este paciente no tiene planes con valor ni abonos registrados.',
  footnote:
    'Cifras en la moneda en que se presupuestaron o pagaron, sin conversión. Los abonos anulados se listan pero no suman.',
};

/** Nota bajo la tabla de saldos migrados: «aprox.» solo si alguna fila lo es (QA D3). */
export function openingNoteFor(openings: Pick<AccountStatementOpeningBalance, 'asOfDateApproximate'>[]): string {
  return openings.some((o) => o.asOfDateApproximate)
    ? `${statementCopy.openingNote} ${statementCopy.openingApproxNote}`
    : statementCopy.openingNote;
}

/** «15/03/2026» o «23/10/2026 (aprox.)» si la fecha es la de la importación. */
export function openingAsOfLabel(
  opening: Pick<AccountStatementOpeningBalance, 'asOfDate' | 'asOfDateApproximate'>,
): string {
  const day = formatCivilDate(opening.asOfDate);
  return opening.asOfDateApproximate ? `${day} (${statementCopy.approx})` : day;
}

/** Nombre de un plan por su id (el plan no tiene título: se nombra por su fecha). */
export function planNamer(plans: AccountStatementPlan[]): (id: string | null) => string {
  const byId = new Map(plans.map((p) => [p.id, statementCopy.planLabel(p.createdAt)]));
  return (id) => (id ? byId.get(id) : undefined) ?? statementCopy.unknownPlan;
}

/**
 * A qué se abonó un movimiento: su plan o, DX-262, el saldo migrado
 * («Saldo migrado · concepto»).
 */
export function movementDestination(
  movement: Pick<AccountStatementMovement, 'treatmentPlanId' | 'openingBalanceId'>,
  planName: (id: string | null) => string,
  openings: Pick<AccountStatementOpeningBalance, 'id' | 'concept'>[],
): string {
  if (movement.openingBalanceId) {
    const opening = openings.find((o) => o.id === movement.openingBalanceId);
    return statementCopy.openingMovement(opening?.concept ?? statementCopy.openingHeading);
  }
  return planName(movement.treatmentPlanId);
}

export function methodLabel(method: PaymentMethod | null): string {
  return method ? PAYMENT_METHOD_LABELS[method] : statementCopy.methodNone;
}

/** El nombre del medio de un abono: el de la clínica (DX-395) o su método. */
export function movementMediumName(
  movement: Pick<AccountStatementMovement, 'method' | 'paymentMethod'>,
): string {
  return movement.paymentMethod?.name ?? methodLabel(movement.method);
}

/** «Ref. ABC 123», o `null` sin referencia (DX-395). */
export function movementReferenceLabel(movement: Pick<AccountStatementMovement, 'reference'>): string | null {
  return movement.reference ? statementCopy.referenceLabel(movement.reference) : null;
}

/**
 * «Pago móvil · Ref. ABC 123» (DX-395): el medio con que la clínica cobró —no
 * el método antiguo, que dice «Transferencia» para un pago móvil— y la
 * referencia del pago, para el estado de cuenta que se entrega al paciente.
 */
export function movementMethodLabel(
  movement: Pick<AccountStatementMovement, 'method' | 'paymentMethod' | 'reference'> &
    Partial<Pick<AccountStatementMovement, 'externalInvoiceNumber'>>,
): string {
  return [movementMediumName(movement), movementReferenceLabel(movement), movementInvoiceLabel(movement)]
    .filter(Boolean)
    .join(' · ');
}

/** DX-515: «Fact. 00-0123», el nº de la factura fiscal emitida fuera, o `null`. */
export function movementInvoiceLabel(
  movement: Partial<Pick<AccountStatementMovement, 'externalInvoiceNumber'>>,
): string | null {
  return movement.externalInvoiceNumber ? `Fact. ${movement.externalInvoiceNumber}` : null;
}

/**
 * «Anulado por X: motivo» de un abono anulado (SEC-013), o `null` si el abono
 * está activo o es una anulación antigua sin autor guardado (esa solo lleva la
 * marca «Anulado»). Sin nombre (el autor no es miembro de la clínica, p. ej.
 * soporte de plataforma) se dice así en vez de inventar uno.
 */
export function voidedDetail(
  movement: Pick<AccountStatementMovement, 'voided' | 'voidedBy' | 'voidReason'>,
): string | null {
  if (!movement.voided || !movement.voidedBy) return null;
  const who = statementCopy.voidedBy(
    movement.voidedBy.fullName ?? statementCopy.voidedByUnknownMember,
  );
  return movement.voidReason ? `${who}: ${movement.voidReason}` : who;
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
