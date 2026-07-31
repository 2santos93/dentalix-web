import { apiFetch } from '@/lib/api/client';

/**
 * `GET /catalog/items` returns a plain TS interface on the backend
 * (`DentalCatalogItem`), not a class decorated with `@ApiProperty()` — same
 * situation as `ToothRecord`/`ToothGroup` in `odontogram-api.ts` — so the
 * generated `schema.d.ts` has no body shape for this route. Hand-written to
 * mirror `dentalix-api`'s
 * `src/modules/dental-catalog/domain/entities/dental-catalog-item.entity.ts` —
 * keep in sync if that changes.
 *
 * Like `odontogram-api.ts`, this deliberately does NOT take a `tenant`
 * param: `DentalCatalogController` uses the same `TenantContextInterceptor`
 * as the odontogram/medical-history/clinical-entries controllers, which
 * derives the tenant from the authenticated JWT, not from a client-supplied
 * header — there is no client tenantId to pass here.
 */
export interface DentalCatalogItem {
  id: string;
  tenantId: string;
  code: string;
  category: string | null;
  kind: 'DIAGNOSIS' | 'PROCEDURE';
  labelEs: string;
  labelEn: string | null;
  labelPt: string | null;
  color: string;
  defaultPrice: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListCatalogItemsOptions {
  kind?: 'DIAGNOSIS' | 'PROCEDURE';
  activeOnly?: boolean;
}

export async function listCatalogItems(
  token: string,
  options: ListCatalogItemsOptions = {},
): Promise<DentalCatalogItem[]> {
  const params = new URLSearchParams();
  if (options.kind) params.set('kind', options.kind);
  if (options.activeOnly !== undefined) params.set('activeOnly', String(options.activeOnly));
  const qs = params.toString();
  return apiFetch<DentalCatalogItem[]>(`/catalog/items${qs ? `?${qs}` : ''}`, { token });
}

/**
 * `POST /catalog/items` — mirrors the backend `CreateCatalogItemDto`
 * (`dentalix-api/src/modules/dental-catalog/presentation/dto/create-catalog-item.dto.ts`):
 * `code`/`kind`/`labelEs`/`color` are required, the rest optional. `tenantId`
 * is NOT sent — the backend derives it from the JWT (same convention as
 * `listCatalogItems` above / `createPatient`). Guarded by `CATALOG_WRITE_ROLES`
 * (ADMIN) on the backend.
 */
export interface CreateCatalogItemInput {
  code: string;
  kind: 'DIAGNOSIS' | 'PROCEDURE';
  labelEs: string;
  color: string;
  category?: string;
  labelEn?: string;
  labelPt?: string;
  defaultPrice?: number;
  active?: boolean;
}

export async function createCatalogItem(
  token: string,
  input: CreateCatalogItemInput,
): Promise<DentalCatalogItem> {
  return apiFetch<DentalCatalogItem>('/catalog/items', {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * `PATCH /catalog/items/:id` — mirrors the backend `UpdateCatalogItemDto`
 * (partial: every field optional). Used to edit an item and to activate /
 * deactivate it (`{ active }`). Deactivating is the "soft delete" (there is no
 * DELETE endpoint): it hides the item from the pickers but keeps the history in
 * `ToothRecord` / treatment-plan items that reference it. Guarded by
 * `CATALOG_WRITE_ROLES` (ADMIN) on the backend.
 */
export interface UpdateCatalogItemInput {
  code?: string;
  kind?: 'DIAGNOSIS' | 'PROCEDURE';
  labelEs?: string;
  color?: string;
  category?: string;
  labelEn?: string;
  labelPt?: string;
  defaultPrice?: number;
  active?: boolean;
}

export async function updateCatalogItem(
  token: string,
  id: string,
  patch: UpdateCatalogItemInput,
): Promise<DentalCatalogItem> {
  return apiFetch<DentalCatalogItem>(`/catalog/items/${id}`, {
    method: 'PATCH',
    body: patch,
    token,
  });
}
