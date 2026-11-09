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
export type ExpiredAcceptanceInput = components['schemas']['ExpiredAcceptanceDto'];
export type ExpiredQuoteAcceptanceReason = components['schemas']['ExpiredQuoteAcceptanceReason'];
export type AcceptanceRepricePreview = components['schemas']['AcceptanceRepricePreviewDto'];

/**
 * DX-379 (C): 409 de la firma (o del PATCH a «Aceptado», o del envío a
 * distancia) cuando el presupuesto está vencido y no se dijo cómo aceptarlo.
 */
export const QUOTE_EXPIRED = 'QUOTE_EXPIRED';
/** 409: algún propuesto sin precio vigente o sin tasa de hoy (la validez no se renovaría). */
export const REPRICE_INCOMPLETE = 'REPRICE_INCOMPLETE';
/** 409: ningún precio cambia ni hay validez que renovar. */
export const REPRICE_NOTHING_TO_APPLY = 'REPRICE_NOTHING_TO_APPLY';

/** Los motivos de aceptar un presupuesto vencido con sus precios, en el orden del selector. */
export const EXPIRED_ACCEPTANCE_REASONS: readonly ExpiredQuoteAcceptanceReason[] = [
  'CLINIC_DELAY',
  'PRICE_COMMITMENT',
  'LOYALTY',
  'FINANCIAL_HARDSHIP',
  'OTHER',
];

/** Las etiquetas del contrato (las mismas que la API). */
export const EXPIRED_ACCEPTANCE_REASON_LABELS: Record<ExpiredQuoteAcceptanceReason, string> = {
  CLINIC_DELAY: 'La clínica tardó en cerrarlo',
  PRICE_COMMITMENT: 'Se mantuvo el precio pactado',
  LOYALTY: 'Paciente habitual',
  FINANCIAL_HARDSHIP: 'Situación económica',
  OTHER: 'Otro',
};

/** Mismo tope que `ExpiredAcceptanceDto.note` en la API. */
export const EXPIRED_ACCEPTANCE_NOTE_MAX = 200;

/**
 * La línea del documento aceptado con el presupuesto vencido (DX-379 C), con
 * las fechas ya pintadas en la sede: `civilDate` para el último día válido y
 * `date` para el día de la firma. `null` si no estaba vencido.
 */
export function expiredAcceptanceLine(
  acceptance: Pick<PlanQuoteAcceptance, 'expiredMode' | 'expiredReason' | 'expiredNote' | 'quoteValidUntil' | 'acceptedAt'>,
  paint: { civilDate: (day: string | null) => string; date: (iso: string) => string },
): string | null {
  if (acceptance.expiredMode === 'REPRICE') {
    return `Precios actualizados el ${paint.date(acceptance.acceptedAt)} antes de aceptar`;
  }
  if (acceptance.expiredMode === 'ORIGINAL_PRICES') {
    const reason = acceptance.expiredReason ? EXPIRED_ACCEPTANCE_REASON_LABELS[acceptance.expiredReason] : null;
    const note = acceptance.expiredNote?.trim();
    const motive = reason ? ` Motivo: ${reason}${note ? `: ${note}` : ''}` : '';
    return `Aceptado con los precios del presupuesto vencido el ${paint.civilDate(acceptance.quoteValidUntil)}.${motive}`;
  }
  return null;
}

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
 * `POST …/quote/issue` (DX-379) — imprimir el presupuesto. Devuelve lo mismo
 * que el GET, pero la primera impresión de un borrador o presentado sin firmar
 * fija su validez (emitido hoy en la sede + los días del ajuste); reimprimir
 * devuelve las mismas fechas. Solo la vista de impresión lo usa (a la que se
 * llega desde «Imprimir presupuesto», «Ver el presupuesto completo» del modal
 * de aceptar y «Presupuesto» del estado de cuenta: las tres imprimen al
 * cargar). Ver el presupuesto dentro del modal de aceptar sigue con el GET,
 * que no fija nada.
 */
export async function issuePlanQuote(
  token: string,
  patientId: string,
  planId: string,
): Promise<PlanQuote> {
  return apiFetch<PlanQuote>(
    `/patients/${encodeURIComponent(patientId)}/treatment-plans/${encodeURIComponent(planId)}/quote/issue`,
    { method: 'POST', token },
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

/**
 * `POST …/acceptance/reprice-preview` (DX-379 C) — el presupuesto vencido con
 * los precios vigentes de TODOS sus propuestos, como se firmaría. No escribe
 * nada. Para firmarlo: `contentHash = quote.contentHash` y
 * `expired = { mode: 'REPRICE', repricePreviewHash: repricing.previewHash }`.
 */
export async function previewAcceptanceRepricing(
  token: string,
  patientId: string,
  planId: string,
): Promise<AcceptanceRepricePreview> {
  return apiFetch<AcceptanceRepricePreview>(
    `/patients/${encodeURIComponent(patientId)}/treatment-plans/${encodeURIComponent(planId)}/acceptance/reprice-preview`,
    { method: 'POST', token },
  );
}
