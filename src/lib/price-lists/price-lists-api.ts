import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-105: listas de precios por sede o convenio. Las formas salen del contrato
// generado.
export type PriceList = components['schemas']['PriceListDto'];
export type CreatePriceListInput = components['schemas']['CreatePriceListDto'];
export type UpdatePriceListInput = components['schemas']['UpdatePriceListDto'];
export type PriceListItemRow = components['schemas']['PriceListItemRowDto'];
export type PriceListItemsPage = components['schemas']['PriceListItemsPageDto'];
export type PriceListItemInput = components['schemas']['PriceListItemInputDto'];
export type ReplacePriceListItemsResult = components['schemas']['ReplacePriceListItemsResultDto'];

/** Crear, editar, retirar listas y fijar precios: solo ADMIN (como la API). */
export function canManagePriceLists(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

const base = (id: string) => `/price-lists/${encodeURIComponent(id)}`;

/**
 * `GET /price-lists`: por defecto solo las activas (selectores);
 * `includeInactive` para la pantalla de gestión.
 */
export async function listPriceLists(
  token: string,
  params: { includeInactive?: boolean } = {},
): Promise<PriceList[]> {
  const query = params.includeInactive ? '?includeInactive=true' : '';
  return apiFetch<PriceList[]>(`/price-lists${query}`, { token });
}

export async function createPriceList(
  token: string,
  input: CreatePriceListInput,
): Promise<PriceList> {
  return apiFetch<PriceList>('/price-lists', { method: 'POST', body: input, token });
}

/** `PATCH`: cambiar la moneda de una lista con precios da 409 en español. */
export async function updatePriceList(
  token: string,
  id: string,
  patch: UpdatePriceListInput,
): Promise<PriceList> {
  return apiFetch<PriceList>(base(id), { method: 'PATCH', body: patch, token });
}

/** Retira la lista (204 sin cuerpo). 409 si algún convenio la usa. */
export async function deletePriceList(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(base(id), { method: 'DELETE', token });
}

/**
 * `GET /price-lists/:id/items`: una página de procedimientos del catálogo con
 * su precio en la lista (`price: null` = sin precio).
 */
export async function listPriceListItems(
  token: string,
  id: string,
  params: { query?: string; page?: number; pageSize?: number } = {},
): Promise<PriceListItemsPage> {
  const search = new URLSearchParams();
  if (params.query) search.set('query', params.query);
  if (params.page !== undefined) search.set('page', String(params.page));
  if (params.pageSize !== undefined) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();
  return apiFetch<PriceListItemsPage>(`${base(id)}/items${qs ? `?${qs}` : ''}`, { token });
}

/**
 * `PUT /price-lists/:id/items`: fija (`price`) o quita (`price: null`) el
 * precio de cada fila enviada.
 */
export async function replacePriceListItems(
  token: string,
  id: string,
  items: PriceListItemInput[],
): Promise<ReplacePriceListItemsResult> {
  return apiFetch<ReplacePriceListItemsResult>(`${base(id)}/items`, {
    method: 'PUT',
    body: { items },
    token,
  });
}
