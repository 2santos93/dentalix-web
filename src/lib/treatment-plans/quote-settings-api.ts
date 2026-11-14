import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/** `{ validityDays }`: cuántos días vale un presupuesto en la clínica (DX-379). */
export type QuoteSettings = components['schemas']['QuoteSettingsDto'];

/** Límites de la API (DTO y CHECK en la BD). */
export const QUOTE_VALIDITY_MIN_DAYS = 1;
export const QUOTE_VALIDITY_MAX_DAYS = 365;
/** Lo que trae una clínica nueva (la API). */
export const DEFAULT_QUOTE_VALIDITY_DAYS = 30;
/** El mismo texto que el 400 de la API. */
export const QUOTE_VALIDITY_INVALID_MESSAGE =
  'La validez del presupuesto tiene que ser un número entero de días entre 1 y 365.';

/**
 * La validez la leen los cuatro roles y la cambia solo ADMIN (la API también
 * lo exige: 403). Solo decide qué se PINTA.
 */
export function canManageQuoteSettings(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/**
 * Días tecleados → número válido o `null`. Solo un entero de 1 a 365: vacío,
 * `15,5`, `1e2`, `-3` o `0` no son una validez.
 */
export function parseQuoteValidityDays(draft: string): number | null {
  const text = draft.trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const days = Number(text);
  return days >= QUOTE_VALIDITY_MIN_DAYS && days <= QUOTE_VALIDITY_MAX_DAYS ? days : null;
}

export function getQuoteSettings(token: string): Promise<QuoteSettings> {
  return apiFetch<QuoteSettings>('/treatment-plan-settings', { token });
}

export function saveQuoteSettings(token: string, input: QuoteSettings): Promise<QuoteSettings> {
  return apiFetch<QuoteSettings>('/treatment-plan-settings', { method: 'PUT', body: input, token });
}
