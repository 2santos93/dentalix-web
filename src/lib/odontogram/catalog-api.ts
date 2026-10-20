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
  /** DX-212: código CUPS (6 alfanuméricos) o null. */
  cupsCode?: string | null;
  /** DX-105: false = la prestación no admite descuentos (ni de convenio ni discrecionales). */
  allowDiscount?: boolean;
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

export interface ListCatalogDirectoryOptions extends ListCatalogItemsOptions {
  /** Texto libre: código, etiqueta o categoría. */
  query?: string;
  page?: number;
  pageSize?: number;
}

export interface CatalogDirectoryPage {
  items: DentalCatalogItem[];
  /** Total que casa con los filtros, no el del catálogo entero. */
  total: number;
  page: number;
  /** El que aplicó el servidor, que acota lo pedido — léelo de aquí, no lo asumas. */
  pageSize: number;
}

/**
 * `GET /catalog/items/directory` — UNA página del catálogo, con búsqueda.
 *
 * Es el endpoint de la pantalla de gestión. `listCatalogItems` (arriba) sigue
 * siendo el de los selectores del odontograma y del plan de tratamiento, que
 * necesitan el catálogo completo: si esos pasaran por aquí verían solo los 20
 * primeros procedimientos y nadie lo notaría hasta echar en falta uno.
 *
 * Los parámetros vacíos se omiten de la query en vez de enviarse como `""`,
 * misma convención que `listPatients`/`listInventoryItems`.
 */
export async function listCatalogDirectory(
  token: string,
  options: ListCatalogDirectoryOptions = {},
): Promise<CatalogDirectoryPage> {
  const params = new URLSearchParams();
  if (options.query) params.set('query', options.query);
  if (options.kind) params.set('kind', options.kind);
  if (options.activeOnly !== undefined) params.set('activeOnly', String(options.activeOnly));
  if (options.page !== undefined) params.set('page', String(options.page));
  if (options.pageSize !== undefined) params.set('pageSize', String(options.pageSize));
  const qs = params.toString();
  return apiFetch<CatalogDirectoryPage>(`/catalog/items/directory${qs ? `?${qs}` : ''}`, {
    token,
  });
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
  /** DX-212: código CUPS (6 alfanuméricos). Solo ADMIN. */
  cupsCode?: string;
  /** DX-105: por defecto true. */
  allowDiscount?: boolean;
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
  /** DX-212: código CUPS; `null` lo quita. Solo ADMIN (queda auditado). */
  cupsCode?: string | null;
  allowDiscount?: boolean;
  active?: boolean;
}

/** DX-212: el formato que valida la API (6 caracteres alfanuméricos). */
export const CUPS_PATTERN = /^[A-Z0-9]{6}$/;

/** `true` si la sesión puede editar el catálogo (CUPS incluido): solo ADMIN. */
export function canEditCatalog(role: string | null): boolean {
  return role === 'ADMIN';
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
