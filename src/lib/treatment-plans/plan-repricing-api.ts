import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import type { PlanAcceptanceSummary } from './plan-quote-api';
import type { TreatmentPlanItemStatus, TreatmentPlanStatus } from './treatment-plans-api';

// «Actualizar precios» (DX-379 B): la API documenta las dos respuestas enteras.
export type RepricingPreview = components['schemas']['RepricingPreviewDto'];
export type AppliedRepricing = components['schemas']['AppliedRepricingDto'];
export type RepricingLine = components['schemas']['RepricingLineDto'];
export type RepricingSkip = components['schemas']['RepricingSkipDto'];
export type RepricingSkipReason = components['schemas']['RepricingSkipReason'];
export type ApplyRepricingInput = components['schemas']['ApplyRepricingDto'];

/** 409: los precios vigentes cambiaron desde la vista previa (nada cambió). */
export const REPRICE_PREVIEW_STALE = 'REPRICE_PREVIEW_STALE';
/** 422: la misma Idempotency-Key con otra petición. */
export const IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED';

/**
 * Quién recotiza: los roles clínicos (ADMIN, odontólogo, asistente), como quien
 * arma el plan (la API: CLINICAL_ROLES). Recepción no. Solo decide qué se
 * PINTA; el endpoint vuelve a comprobarlo.
 */
export function canRepricePlan(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST' || role === 'ASSISTANT';
}

const REPRICEABLE_PLAN_STATUSES: readonly TreatmentPlanStatus[] = ['DRAFT', 'PRESENTED'];

/**
 * ¿Se le ofrece «Actualizar precios»? Borrador o presentado, sin firma y con
 * algún ítem propuesto. Lo demás (abonos, plan de cuotas, saldo a favor) lo
 * dice la vista previa con el mensaje del servidor.
 */
export function isPlanRepriceable(plan: {
  status: TreatmentPlanStatus;
  acceptance?: PlanAcceptanceSummary | null;
  items?: readonly { status: TreatmentPlanItemStatus }[];
}): boolean {
  return (
    !plan.acceptance &&
    REPRICEABLE_PLAN_STATUSES.includes(plan.status) &&
    (plan.items ?? []).some((item) => item.status === 'PROPOSED')
  );
}

/**
 * Qué hace aplicar esta vista previa (DX-379 B, I-3):
 *  - `reprice`: algún precio cambia.
 *  - `renew`: ningún precio cambia, pero el plan está VENCIDO y la vista previa
 *    renueva la validez (todos los propuestos elegidos): aplicar renueva la
 *    validez con los precios vigentes.
 *  - `nothing`: no hay líneas, o ningún precio cambia en un plan vigente (no se
 *    alarga en silencio la garantía de un presupuesto), o en uno vencido con una
 *    selección parcial (que no renueva).
 */
export type RepricingOutcome = 'reprice' | 'renew' | 'nothing';

export function repricingOutcome(preview: RepricingPreview, { expired }: { expired: boolean }): RepricingOutcome {
  if (preview.lines.length === 0) return 'nothing';
  if (preview.lines.some((line) => line.changed)) return 'reprice';
  return expired && preview.validityRenewed && preview.validity ? 'renew' : 'nothing';
}

function repricePath(patientId: string, planId: string, action: 'preview' | 'apply'): string {
  return `/patients/${encodeURIComponent(patientId)}/treatment-plans/${encodeURIComponent(planId)}/reprice/${action}`;
}

/**
 * `POST …/reprice/preview` — cómo quedaría cada ítem propuesto con el precio
 * vigente. Sin `itemIds`, todos. No escribe nada.
 */
export async function previewRepricing(
  token: string,
  patientId: string,
  planId: string,
  itemIds?: readonly string[],
): Promise<RepricingPreview> {
  return apiFetch<RepricingPreview>(repricePath(patientId, planId, 'preview'), {
    method: 'POST',
    body: itemIds ? { itemIds: [...itemIds] } : {},
    token,
  });
}

/**
 * `POST …/reprice/apply` — aplica la vista previa (`previewHash`, mismos
 * `itemIds`). La misma clave y la misma petición devuelven lo ya aplicado
 * (`replayed: true`); 409 `REPRICE_PREVIEW_STALE` si cambió algo.
 */
export async function applyRepricing(
  token: string,
  patientId: string,
  planId: string,
  input: ApplyRepricingInput,
  idempotencyKey: string,
): Promise<AppliedRepricing> {
  return apiFetch<AppliedRepricing>(repricePath(patientId, planId, 'apply'), {
    method: 'POST',
    body: input,
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}
