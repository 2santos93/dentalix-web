import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * `InventoryController` is fully `@ApiProperty()`-decorated on the backend
 * (`@ApiOkResponse`/`@ApiCreatedResponse` on every route), so the generated
 * `schema.d.ts` already carries the exact wire shape — no hand-typing needed
 * here, unlike `DentalCatalogItem` in `catalog-api.ts`.
 */
export type InventoryItem = components['schemas']['InventoryItemDto'];
export type CreateInventoryItemInput = components['schemas']['CreateInventoryItemDto'];
export type UpdateInventoryItemInput = components['schemas']['UpdateInventoryItemDto'];
export type InventoryMovement = components['schemas']['InventoryMovementDto'];
export type RecordMovementInput = components['schemas']['RecordInventoryMovementDto'];
export type InventoryMovementType = InventoryMovement['type'];

/**
 * `GET /inventory/items` — every inventory item for the tenant, with
 * `stock`/`lowStock` computed server-side from the movement ledger (never
 * cache/derive these client-side). Tenant is resolved from the JWT, same
 * convention as `listCatalogItems`.
 */
export async function listInventoryItems(token: string): Promise<InventoryItem[]> {
  return apiFetch<InventoryItem[]>('/inventory/items', { token });
}

/** `GET /inventory/items/:id` — item detail, including its `movements`. */
export async function getInventoryItem(token: string, id: string): Promise<InventoryItem> {
  return apiFetch<InventoryItem>(`/inventory/items/${id}`, { token });
}

/**
 * `POST /inventory/items` — creates an insumo. `minStock` always travels
 * (backend default is `0`); `sku`/`notes` are optional.
 */
export async function createInventoryItem(
  token: string,
  input: CreateInventoryItemInput,
): Promise<InventoryItem> {
  return apiFetch<InventoryItem>('/inventory/items', {
    method: 'POST',
    body: input,
    token,
  });
}

/** `PATCH /inventory/items/:id` — partial update (name/sku/unit/minStock/notes). */
export async function updateInventoryItem(
  token: string,
  id: string,
  patch: UpdateInventoryItemInput,
): Promise<InventoryItem> {
  return apiFetch<InventoryItem>(`/inventory/items/${id}`, {
    method: 'PATCH',
    body: patch,
    token,
  });
}

/**
 * `DELETE /inventory/items/:id` — soft-deletes the item (`deletedAt` set on
 * the backend). The route responds `200` with an EMPTY body (`content?:
 * never` in the generated schema), so this uses `apiFetchOrNull` — same
 * rationale as `removeItem` in `treatment-plans-api.ts` — instead of
 * `apiFetch`, which would throw trying to `res.json()` an empty response.
 */
export async function deleteInventoryItem(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/inventory/items/${id}`, { method: 'DELETE', token });
}

/**
 * `POST /inventory/items/:id/movements` — records a stock movement (IN/OUT/
 * ADJUSTMENT); `stock`/`lowStock` on the item are recomputed from the ledger,
 * never sent here.
 */
export async function recordInventoryMovement(
  token: string,
  itemId: string,
  input: RecordMovementInput,
): Promise<InventoryMovement> {
  return apiFetch<InventoryMovement>(`/inventory/items/${itemId}/movements`, {
    method: 'POST',
    body: input,
    token,
  });
}

/** `GET /inventory/items/:id/movements` — the item's full movement ledger. */
export async function listInventoryMovements(
  token: string,
  itemId: string,
): Promise<InventoryMovement[]> {
  return apiFetch<InventoryMovement[]>(`/inventory/items/${itemId}/movements`, { token });
}
