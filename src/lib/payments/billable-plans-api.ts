import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import { formatCurrency } from '@/lib/format/currency';
import { statementCopy } from '@/lib/account-statement/presentation';
import { PLAN_STATUS_LABELS } from '@/lib/treatment-plans/plan-status';

/**
 * Un plan contra el que se puede cobrar (DX-067): total, abonado y saldo, sin
 * nada clínico. Sale tal cual del contrato generado (`BillablePlanDto`).
 */
export type BillablePlan = components['schemas']['BillablePlanDto'];

/**
 * Quién registra abonos y planes de cuotas: los roles que la API deja escribir
 * pagos (`PAYMENT_ROLES`: ADMIN y recepción). Solo decide qué se PINTA; cada
 * endpoint vuelve a comprobar el rol.
 */
export const PAYMENT_ROLES: readonly ClinicRole[] = ['ADMIN', 'RECEPTION'];

/** `null` (sin sesión de clínica legible) cuenta como "sin permiso". */
export function canRecordPayments(role: ClinicRole | null): boolean {
  return role !== null && PAYMENT_ROLES.includes(role);
}

/**
 * `GET /patients/:patientId/billable-plans` — los planes no cancelados con algo
 * facturable, del más reciente al más antiguo; `[]` si no hay nada que cobrar.
 * 403 para roles sin pagos, 404 si el paciente no es de la clínica.
 */
export async function listBillablePlans(
  token: string,
  patientId: string,
): Promise<BillablePlan[]> {
  return apiFetch<BillablePlan[]>(
    `/patients/${encodeURIComponent(patientId)}/billable-plans`,
    { token },
  );
}

/** Pinta un importe con su moneda. */
export type MoneyFormatter = (amount: number, currency: string) => string;

/**
 * Cómo se nombra un plan en el selector de cobro: el mismo «Plan del …» que el
 * estado de cuenta y la caja (el plan no tiene título), su estado y lo que
 * falta por pagar — lo que decide contra cuál se cobra. `money` pinta el
 * importe (DX-386: con el formato de la sede donde la pantalla lo tiene).
 */
export function billablePlanLabel(plan: BillablePlan, money: MoneyFormatter = formatCurrency): string {
  const balance =
    plan.balance < 0 ? `${money(-plan.balance, plan.currency)} ${statementCopy.inFavor}` : money(plan.balance, plan.currency);
  return [
    statementCopy.planLabel(plan.createdAt),
    PLAN_STATUS_LABELS[plan.status],
    `Saldo ${balance}`,
  ].join(' · ');
}
