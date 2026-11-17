import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// DX-205: «Actualizar precios» del catálogo en bloque y el historial de precios.
// La API documenta las respuestas enteras: los tipos salen de `schema.d.ts`.
export type CatalogPriceChangeInput = components['schemas']['CatalogPriceChangeDto'];
export type ApplyCatalogPriceChangeInput = components['schemas']['ApplyCatalogPriceChangeDto'];
export type CatalogPriceChangePreview = components['schemas']['CatalogPriceChangePreviewDto'];
export type CatalogPriceChangeLine = components['schemas']['CatalogPriceChangeLineDto'];
export type CatalogPriceChangeSkip = components['schemas']['CatalogPriceChangeSkipDto'];
export type AppliedCatalogPriceChange = components['schemas']['AppliedCatalogPriceChangeDto'];
export type CatalogPriceHistoryEntry = components['schemas']['CatalogPriceHistoryEntryDto'];
export type CatalogPriceChangeSkipReason = CatalogPriceChangeSkip['reason'];
export type CatalogPriceChangeMode = CatalogPriceChangeInput['mode'];

/** 409: el catálogo cambió desde la vista previa (nada cambió). */
export const PRICE_CHANGE_PREVIEW_STALE = 'PRICE_CHANGE_PREVIEW_STALE';
/** 409: con estos criterios ningún precio cambia. */
export const PRICE_CHANGE_NOTHING_TO_APPLY = 'PRICE_CHANGE_NOTHING_TO_APPLY';
/** 422: la misma Idempotency-Key con otra petición. */
export const IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED';

/** Unidades de redondeo que admite la API (en unidades de la moneda del catálogo). */
export const PRICE_CHANGE_ROUNDING_UNITS = [1, 10, 100, 1000] as const;
export type PriceChangeRoundingUnit = (typeof PRICE_CHANGE_ROUNDING_UNITS)[number];

/** Vista previa: qué precios cambiarían, sin escribir nada (solo ADMIN). */
export function previewCatalogPriceChange(
  token: string,
  input: CatalogPriceChangeInput,
): Promise<CatalogPriceChangePreview> {
  return apiFetch<CatalogPriceChangePreview>('/catalog/price-changes/preview', {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * Aplica el lote con la huella de la vista previa. `idempotencyKey` (UUID) la
 * genera QUIEN LLAMA, una por vista previa y estable entre reintentos: repetir
 * con la misma clave devuelve el lote ya aplicado (`replayed: true`).
 */
export function applyCatalogPriceChange(
  token: string,
  input: ApplyCatalogPriceChangeInput,
  idempotencyKey: string,
): Promise<AppliedCatalogPriceChange> {
  return apiFetch<AppliedCatalogPriceChange>('/catalog/price-changes/apply', {
    method: 'POST',
    body: input,
    token,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/** Historial del precio por defecto de un ítem, del más reciente al más antiguo. */
export function listCatalogPriceHistory(token: string, itemId: string): Promise<CatalogPriceHistoryEntry[]> {
  return apiFetch<CatalogPriceHistoryEntry[]>(`/catalog/items/${encodeURIComponent(itemId)}/price-history`, {
    token,
  });
}
