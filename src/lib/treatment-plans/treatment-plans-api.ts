import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type CreateTreatmentPlanInput = components['schemas']['CreateTreatmentPlanDto'];
export type UpdateTreatmentPlanInput = components['schemas']['UpdateTreatmentPlanDto'];
export type AddTreatmentPlanItemInput = components['schemas']['AddTreatmentPlanItemDto'];
export type UpdateTreatmentPlanItemInput = components['schemas']['UpdateTreatmentPlanItemDto'];

// The status unions are re-used from the generated OpenAPI schema
// (`UpdateTreatmentPlanDto.status` / `UpdateTreatmentPlanItemDto.status` carry
// `@ApiPropertyOptional({ enum: ... })` mirroring the backend
// `TreatmentPlanStatus`/`TreatmentPlanItemStatus` Prisma enums), so they stay
// in sync with the backend without duplicating the literal list by hand —
// same convention as `AppointmentStatus` in `appointments-api.ts`.
export type TreatmentPlanStatus = NonNullable<UpdateTreatmentPlanInput['status']>;
export type TreatmentPlanItemStatus = NonNullable<UpdateTreatmentPlanItemInput['status']>;

/**
 * `TreatmentPlanItemDto`/`TreatmentPlanDto` are fully `@ApiProperty()`-decorated
 * response DTOs on the backend (`TreatmentPlansController` uses
 * `@ApiOkResponse`/`@ApiCreatedResponse` with them on every route), so the
 * generated `schema.d.ts` already carries the exact wire shape — unlike
 * `Appointment`/`DentalCatalogItem`, there is no need to hand-type these.
 */
export type TreatmentPlanItem = components['schemas']['TreatmentPlanItemDto'];

/**
 * `items`/`total` are only populated by `getPlan` (`GET /treatment-plans/:id`)
 * — `createPlan`/`listPlans`/`updatePlan` return the bare plan, so both
 * fields are optional here (see `TreatmentPlanDto` on the backend).
 */
export type TreatmentPlan = components['schemas']['TreatmentPlanDto'];

/** `POST /patients/:patientId/treatment-plans` — starts a new plan in DRAFT. */
export async function createPlan(
  token: string,
  patientId: string,
  input: CreateTreatmentPlanInput = {},
): Promise<TreatmentPlan> {
  return apiFetch<TreatmentPlan>(`/patients/${patientId}/treatment-plans`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** `GET /patients/:patientId/treatment-plans` — plans for a patient, no items. */
export async function listPlans(token: string, patientId: string): Promise<TreatmentPlan[]> {
  return apiFetch<TreatmentPlan[]>(`/patients/${patientId}/treatment-plans`, {
    token,
  });
}

/** `GET /treatment-plans/:id` — plan detail, with active `items` + computed `total`. */
export async function getPlan(token: string, id: string): Promise<TreatmentPlan> {
  return apiFetch<TreatmentPlan>(`/treatment-plans/${id}`, {
    token,
  });
}

/** `PATCH /treatment-plans/:id` — change `status` and/or `notes`. */
export async function updatePlan(
  token: string,
  id: string,
  patch: UpdateTreatmentPlanInput,
): Promise<TreatmentPlan> {
  return apiFetch<TreatmentPlan>(`/treatment-plans/${id}`, {
    method: 'PATCH',
    body: patch,
    token,
  });
}

/**
 * `POST /treatment-plans/:planId/items` — adds an item (tooth + catalog
 * procedure). `price` is optional: when omitted, the backend resolves it
 * from the catalog item's `defaultPrice` (400 if neither is available).
 */
export async function addItem(
  token: string,
  planId: string,
  input: AddTreatmentPlanItemInput,
): Promise<TreatmentPlanItem> {
  return apiFetch<TreatmentPlanItem>(`/treatment-plans/${planId}/items`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** `PATCH /treatment-plans/:planId/items/:itemId` — change price/status/surfaces/notes. */
export async function updateItem(
  token: string,
  planId: string,
  itemId: string,
  patch: UpdateTreatmentPlanItemInput,
): Promise<TreatmentPlanItem> {
  return apiFetch<TreatmentPlanItem>(`/treatment-plans/${planId}/items/${itemId}`, {
    method: 'PATCH',
    body: patch,
    token,
  });
}

/**
 * `DELETE /treatment-plans/:planId/items/:itemId` — soft-deletes the item
 * (`deletedAt` set on the backend, see `TreatmentPlansController.removeItem`).
 * The route responds `200` with an EMPTY body (`content?: never` in the
 * generated schema), so this uses `apiFetchOrNull` — same rationale as
 * `apiFetchOrNull`'s own doc comment in `client.ts` — instead of `apiFetch`,
 * which would throw trying to `res.json()` an empty response.
 */
export async function removeItem(token: string, planId: string, itemId: string): Promise<void> {
  await apiFetchOrNull<null>(`/treatment-plans/${planId}/items/${itemId}`, {
    method: 'DELETE',
    token,
  });
}
