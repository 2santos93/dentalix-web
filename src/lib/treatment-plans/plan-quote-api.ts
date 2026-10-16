import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import type { TreatmentPlanStatus } from './treatment-plans-api';
import { canDecidePlan } from './plan-options';

// La API documenta la respuesta entera con @ApiProperty (PlanQuoteDocumentDto),
// así que los tipos salen tal cual del contrato generado.
export type PlanQuote = components['schemas']['PlanQuoteDocumentDto'];
export type PlanQuoteItem = components['schemas']['PlanQuoteItemDto'];
export type PlanQuoteAcceptance = components['schemas']['PlanQuoteAcceptanceDto'];
export type AcceptPlanInput = components['schemas']['AcceptTreatmentPlanDto'];
export type PlanAcceptanceSummary = components['schemas']['TreatmentPlanAcceptanceSummaryDto'];

/**
 * Quién imprime el presupuesto: los cuatro roles (DX-012). Recepción lo
 * imprime y lo archiva aunque no vea el resto del plan clínico. Solo decide
 * qué se PINTA; el endpoint vuelve a comprobarlo.
 */
export function canPrintPlanQuote(role: ClinicRole | null): boolean {
  return role !== null;
}

/**
 * Aceptar con firma lo decide quien decide el plan: odontólogo y ADMIN
 * (DX-040). La asistente lo ve y lo imprime, pero no lo acepta en nombre del
 * doctor.
 */
export function canAcceptPlan(role: ClinicRole | null): boolean {
  return canDecidePlan(role);
}

/**
 * Se firma un borrador, un plan presentado o uno aceptado sin firma; uno
 * rechazado, cancelado o completado, no (la API: 409).
 */
export const SIGNABLE_PLAN_STATUSES: readonly TreatmentPlanStatus[] = [
  'DRAFT',
  'PRESENTED',
  'ACCEPTED',
];

/** ¿Se le puede ofrecer «Aceptar con firma»? Sin firmar, abierto y con ítems. */
export function isPlanAcceptable(plan: {
  status: TreatmentPlanStatus;
  acceptance?: PlanAcceptanceSummary | null;
  items?: readonly unknown[];
}): boolean {
  return (
    !plan.acceptance &&
    SIGNABLE_PLAN_STATUSES.includes(plan.status) &&
    (plan.items?.length ?? 0) > 0
  );
}

/** Ruta de la vista imprimible A4 (fuera del shell). */
export function planQuotePrintHref(patientId: string, planId: string): string {
  return `/print/patients/${encodeURIComponent(patientId)}/treatment-plans/${encodeURIComponent(planId)}`;
}

/**
 * `GET /patients/:patientId/treatment-plans/:planId/quote` — el presupuesto
 * (404 si no es de la clínica o de ese paciente). Aceptado, es la foto firmada.
 */
export async function getPlanQuote(
  token: string,
  patientId: string,
  planId: string,
): Promise<PlanQuote> {
  return apiFetch<PlanQuote>(
    `/patients/${encodeURIComponent(patientId)}/treatment-plans/${encodeURIComponent(planId)}/quote`,
    { token },
  );
}

/**
 * `POST …/acceptance` — acepta el presupuesto que se mostró (`contentHash`)
 * con la firma. 400 sin firma; 409 si ya estaba firmado o si el presupuesto
 * cambió desde que se mostró.
 */
export async function acceptPlan(
  token: string,
  patientId: string,
  planId: string,
  input: AcceptPlanInput,
): Promise<PlanQuote> {
  return apiFetch<PlanQuote>(
    `/patients/${encodeURIComponent(patientId)}/treatment-plans/${encodeURIComponent(planId)}/acceptance`,
    { method: 'POST', body: input, token },
  );
}
