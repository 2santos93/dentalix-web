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
