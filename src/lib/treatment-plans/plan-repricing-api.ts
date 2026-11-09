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
 * ¿Aplicar cambia algo? Un precio que cambia o una validez que se renueva a
 * otra fecha (un plan vencido con los mismos precios se renueva aplicando).
 * Sin líneas, o con todo igual y la misma validez, no hay nada que actualizar.
 */
export function hasSomethingToApply(preview: RepricingPreview): boolean {
  if (preview.lines.length === 0) return false;
  if (preview.lines.some((line) => line.changed)) return true;
  if (!preview.validityRenewed || !preview.validity) return false;
  const before = preview.previousValidity;
  return (
    !before ||
    before.issuedOn !== preview.validity.issuedOn ||
    before.validUntil !== preview.validity.validUntil
  );
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
