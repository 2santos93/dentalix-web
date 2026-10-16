import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import type { TreatmentPlanStatus } from './treatment-plans-api';

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

/** Aceptar con firma sigue las reglas del plan: odontólogo, asistente y ADMIN. */
const ACCEPT_ROLES: readonly ClinicRole[] = ['DENTIST', 'ASSISTANT', 'ADMIN'];

export function canAcceptPlan(role: ClinicRole | null): boolean {
  return role !== null && ACCEPT_ROLES.includes(role);
}

/** Un plan cancelado o completado ya no se presenta para firmar (la API: 409). */
export const SIGNABLE_PLAN_STATUSES: readonly TreatmentPlanStatus[] = ['DRAFT', 'ACCEPTED'];

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
