import { apiFetch, apiFetchOrNull } from '@/lib/api/client';

/**
 * `InventoryMovement.type` isn't exposed as its own named schema component
 * (it only shows up inline wherever a DTO references it) — re-declare the
 * literal union here mirroring `dentalix-api`'s Prisma `MovementType` enum,
 * same convention as `ClinicRole` in `src/lib/staff/staff-api.ts`. Keep in
 * sync if it changes.
 */
export type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT';

/**
 * These endpoints return plain TS interfaces on the backend
 * (`src/modules/inventory/domain/entities/*.entity.ts`), not classes
 * decorated with `@ApiProperty()` — same situation as `StaffMember` in
 * `src/lib/staff/staff-api.ts` — so the generated `schema.d.ts` has no body
 * shape for these routes. Hand-written to mirror those entities — keep in
 * sync if they change.
 */
export interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  minStock: number;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItemWithStock extends InventoryItem {
  stock: number;
  lowStock: boolean;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  occurredAt: string;
  createdById: string | null;
  createdAt: string;
}

export interface InventoryItemDetail extends InventoryItemWithStock {
  movements: InventoryMovement[];
}

export interface CreateItemInput {
  name: string;
  unit: string;
  sku?: string;
  minStock?: number;
  notes?: string;
}

export interface UpdateItemInput {
  name?: string;
  unit?: string;
  sku?: string | null;
  minStock?: number;
  notes?: string | null;
}

export interface RecordMovementInput {
  type: MovementType;
  quantity: number;
  reason?: string;
}

export async function listItems(token: string): Promise<InventoryItemWithStock[]> {
  return apiFetch<InventoryItemWithStock[]>('/inventory/items', {
    token,
  });
}

export async function getItem(token: string, id: string): Promise<InventoryItemDetail> {
  return apiFetch<InventoryItemDetail>(`/inventory/items/${id}`, {
    token,
  });
}

export async function createItem(
  token: string,
  input: CreateItemInput,
): Promise<InventoryItem> {
  return apiFetch<InventoryItem>('/inventory/items', {
    method: 'POST',
    body: input,
    token,
  });
}

export async function updateItem(
  token: string,
  id: string,
  patch: UpdateItemInput,
): Promise<InventoryItem> {
  return apiFetch<InventoryItem>(`/inventory/items/${id}`, {
    method: 'PATCH',
    body: patch,
    token,
  });
}

/**
 * `DELETE /inventory/items/:id` — the backend returns `204` with an EMPTY
 * body on success, which `apiFetch`'s `res.json()` would throw on (same
 * situation as `DELETE /staff/:userId`, see `deactivateStaff` in
 * `src/lib/staff/staff-api.ts`) — use `apiFetchOrNull` and discard the
 * (always-null) result.
 */
export async function deleteItem(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/inventory/items/${id}`, {
    method: 'DELETE',
    token,
  });
}

export async function recordMovement(
  token: string,
  id: string,
  input: RecordMovementInput,
): Promise<InventoryMovement> {
  return apiFetch<InventoryMovement>(`/inventory/items/${id}/movements`, {
    method: 'POST',
    body: input,
    token,
  });
}
