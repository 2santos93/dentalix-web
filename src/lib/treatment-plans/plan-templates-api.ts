import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-559: plantillas de plan de tratamiento. Los tipos salen del contrato
// generado (la API documenta las respuestas con @ApiProperty).
export type PlanTemplate = components['schemas']['TreatmentPlanTemplateDto'];
export type PlanTemplateLine = components['schemas']['TreatmentPlanTemplateLineDto'];
export type PlanTemplateLineInput = components['schemas']['PlanTemplateLineInputDto'];
export type CreatePlanTemplateInput = components['schemas']['CreateTreatmentPlanTemplateDto'];
export type UpdatePlanTemplateInput = components['schemas']['UpdateTreatmentPlanTemplateDto'];
export type TemplatePreview = components['schemas']['TemplatePreviewDto'];
export type TemplatePreviewLine = components['schemas']['TemplatePreviewLineDto'];
export type ApplyPlanTemplateInput = components['schemas']['ApplyPlanTemplateDto'];
export type TemplateLineChoice = components['schemas']['TemplateLineChoiceDto'];
export type TemplateApplication = components['schemas']['TemplateApplicationDto'];

/** Códigos de error con los que la pantalla hace algo propio. */
export const PLAN_TEMPLATE_STALE = 'PLAN_TEMPLATE_STALE';
export const PLAN_TEMPLATE_DUPLICATE_NAME = 'PLAN_TEMPLATE_DUPLICATE_NAME';
export const PLAN_TEMPLATE_CATALOG_ITEM_NOT_FOUND = 'PLAN_TEMPLATE_CATALOG_ITEM_NOT_FOUND';
export const PLAN_TEMPLATE_NOT_A_PROCEDURE = 'PLAN_TEMPLATE_NOT_A_PROCEDURE';
export const PLAN_TEMPLATE_PLAN_NOT_EDITABLE = 'PLAN_TEMPLATE_PLAN_NOT_EDITABLE';

/** Topes del contrato (los mismos que valida la API). */
export const PLAN_TEMPLATE_LIMITS = {
  nameMax: 80,
  linesMax: 50,
  quantityMax: 20,
  visitMax: 50,
  visitLabelMax: 60,
  intervalDaysMax: 3650,
} as const;

/** Crear, editar y desactivar: solo ADMIN (como la API). */
export function canManagePlanTemplates(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/**
 * `GET /treatment-plan-templates`: por defecto solo las activas (el selector
 * del plan); `includeInactive` para Ajustes.
 */
export async function listPlanTemplates(
  token: string,
  params: { includeInactive?: boolean } = {},
): Promise<PlanTemplate[]> {
  const query = params.includeInactive ? '?includeInactive=true' : '';
  return apiFetch<PlanTemplate[]>(`/treatment-plan-templates${query}`, { token });
}

export async function getPlanTemplate(token: string, id: string): Promise<PlanTemplate> {
  return apiFetch<PlanTemplate>(`/treatment-plan-templates/${id}`, { token });
}

export async function createPlanTemplate(
  token: string,
  input: CreatePlanTemplateInput,
): Promise<PlanTemplate> {
  return apiFetch<PlanTemplate>('/treatment-plan-templates', { method: 'POST', body: input, token });
}

/** PATCH con `version` optimista; si trae `lines`, sustituyen a todas. */
export async function updatePlanTemplate(
  token: string,
  id: string,
  input: UpdatePlanTemplateInput,
): Promise<PlanTemplate> {
  return apiFetch<PlanTemplate>(`/treatment-plan-templates/${id}`, { method: 'PATCH', body: input, token });
}

/** Vista previa de aplicar la plantilla al plan: no escribe nada. */
export async function previewApplyTemplate(
  token: string,
  planId: string,
  templateId: string,
): Promise<TemplatePreview> {
  return apiFetch<TemplatePreview>(`/treatment-plans/${planId}/apply-template/preview`, {
    method: 'POST',
    body: { templateId },
    token,
  });
}

/** Aplica la plantilla: todas las líneas aplicables entran o ninguna. */
export async function applyTemplate(
  token: string,
  planId: string,
  input: ApplyPlanTemplateInput,
): Promise<TemplateApplication> {
  return apiFetch<TemplateApplication>(`/treatment-plans/${planId}/apply-template`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** Nº de visitas distintas de una plantilla. */
export function templateVisitCount(template: Pick<PlanTemplate, 'lines'>): number {
  return new Set(template.lines.map((l) => l.visit)).size;
}
