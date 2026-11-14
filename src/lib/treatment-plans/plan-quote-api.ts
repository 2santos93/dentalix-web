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
/** DX-417: la vista previa de una aceptación parcial (lo aceptado, lo pendiente y el total del original). */
export type PartialAcceptancePreview = components['schemas']['PartialAcceptancePreviewDto'];
export type PartialAcceptancePreviewInput = components['schemas']['PartialAcceptancePreviewRequestDto'];

/**
 * DX-379 (C): 409 de la firma (o del PATCH a «Aceptado», o del envío a
 * distancia) cuando el presupuesto está vencido y no se dijo cómo aceptarlo.
 */
export const QUOTE_EXPIRED = 'QUOTE_EXPIRED';
/** 409: algún propuesto sin precio vigente o sin tasa de hoy (la validez no se renovaría). */
export const REPRICE_INCOMPLETE = 'REPRICE_INCOMPLETE';
/** 409: ningún precio cambia ni hay validez que renovar. */
export const REPRICE_NOTHING_TO_APPLY = 'REPRICE_NOTHING_TO_APPLY';

/** DX-417: 409 de la vista previa o de la firma parcial: el plan ya está aceptado (otra firma ganó). */
export const PARTIAL_PLAN_ALREADY_ACCEPTED = 'PARTIAL_PLAN_ALREADY_ACCEPTED';
/** DX-417: 409: solo un presupuesto presentado se acepta en parte. */
export const PARTIAL_PLAN_NOT_PRESENTED = 'PARTIAL_PLAN_NOT_PRESENTED';

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
 * DX-417: la línea del documento aceptado en parte, fuera del contenido
 * firmado: cuántos procedimientos y por cuánto quedaron en el presupuesto
 * pendiente. `null` si se aceptó entero.
 */
export function partialAcceptanceLine(
  acceptance: Pick<PlanQuoteAcceptance, 'pendingPlanId' | 'pendingItemIds' | 'pendingTotal'>,
  currency: string,
  money: (amount: number, currency: string) => string,
): string | null {
  const ids = acceptance.pendingItemIds;
  if (!acceptance.pendingPlanId || !ids || ids.length === 0 || acceptance.pendingTotal === null) return null;
  const amount = money(acceptance.pendingTotal, currency);
  return ids.length === 1
    ? `Aceptación parcial: 1 procedimiento (${amount}) queda en un presupuesto pendiente.`
    : `Aceptación parcial: ${ids.length} procedimientos (${amount}) quedan en un presupuesto pendiente.`;
}

/**
 * DX-417: la línea del presupuesto pendiente (fuera del hash), con la fecha ya
 * pintada en la sede; sin fecha (no se pudo leer el original), sin ella.
 */
export function partialRestLine(date: string | null): string {
  return date ? `Resto de la aceptación parcial del ${date}` : 'Resto de una aceptación parcial';
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

/**
 * DX-417: ¿se le ofrece «Aceptar en parte»? Solo un presupuesto presentado,
 * sin aceptación y con al menos dos procedimientos propuestos (uno se acepta y
 * otro queda pendiente). Abonos, cuotas o saldo a favor los dice la API (409)
 * dentro del modal.
 */
export function isPlanPartiallyAcceptable(plan: {
  status: TreatmentPlanStatus;
  acceptance?: PlanAcceptanceSummary | null;
  items?: readonly { status?: string }[];
}): boolean {
  if (plan.acceptance || plan.status !== 'PRESENTED') return false;
  return (plan.items ?? []).filter((item) => item.status === 'PROPOSED').length >= 2;
}

/**
 * DX-417 (ronda 1, I-1): ¿es un presupuesto pendiente de una aceptación
 * parcial que aún espera respuesta? `splitFromPlanId` es la procedencia y no
 * cambia nunca; el chip «Pendiente de aceptación parcial» y el «· pendiente»
 * del selector solo valen mientras siga presentado y sin aceptar.
 */
export function isPendingRest(plan: {
  splitFromPlanId?: string | null;
  status: TreatmentPlanStatus;
  acceptance?: PlanAcceptanceSummary | null;
}): boolean {
  return Boolean(plan.splitFromPlanId) && plan.status === 'PRESENTED' && !plan.acceptance;
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

/**
 * `POST …/acceptance/partial-preview` (DX-417) — lo que se firmaría aceptando
 * solo `itemIds`: el presupuesto de lo aceptado (su `contentHash` va en la
 * firma), lo pendiente y el total del original. No escribe nada. Con un
 * presupuesto vencido que se aceptará actualizando los precios, `reprice: true`
 * recotiza TODO el plan (también lo no elegido) y su `repricing.previewHash`
 * va en `expired.repricePreviewHash`: llámala con espera, nunca en cada tecla.
 */
export async function previewPartialAcceptance(
  token: string,
  patientId: string,
  planId: string,
  input: PartialAcceptancePreviewInput,
): Promise<PartialAcceptancePreview> {
  return apiFetch<PartialAcceptancePreview>(
    `/patients/${encodeURIComponent(patientId)}/treatment-plans/${encodeURIComponent(planId)}/acceptance/partial-preview`,
    { method: 'POST', body: input, token },
  );
}
