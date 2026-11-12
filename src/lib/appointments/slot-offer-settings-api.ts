import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/**
 * Ajustes de la oferta de hueco por enlace de la clínica (DX-448), ya
 * resueltos: si la clínica no eligió la caducidad, la de la instalación.
 */
export type SlotOfferSettings = components['schemas']['SlotOfferSettingsDto'];
/** Lo que se guarda: los dos valores, enteros. */
export type SlotOfferSettingsInput = components['schemas']['UpdateSlotOfferSettingsDto'];

/** Límites de la API (DTO y CHECK en la BD). */
export const SLOT_OFFER_EXPIRY_LEAD_MIN = 0;
export const SLOT_OFFER_EXPIRY_LEAD_MAX = 240;
export const SLOT_OFFER_MIN_LEAD_MIN = 5;
export const SLOT_OFFER_MIN_LEAD_MAX = 240;
/** Los mismos textos que los 400 de la API. */
export const SLOT_OFFER_EXPIRY_LEAD_INVALID_MESSAGE =
  'La caducidad anticipada de la oferta tiene que ser un número entero de minutos entre 0 y 240.';
export const SLOT_OFFER_MIN_LEAD_INVALID_MESSAGE =
  'La antelación mínima para ofrecer un hueco tiene que ser un número entero de minutos entre 5 y 240.';

/**
 * Los ajustes los leen los roles de la agenda y los cambia solo ADMIN (la API
 * también lo exige: 403). Solo decide qué se PINTA.
 */
export function canManageSlotOfferSettings(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

function parseMinutes(draft: string, min: number, max: number): number | null {
  const text = draft.trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const minutes = Number(text);
  return minutes >= min && minutes <= max ? minutes : null;
}

/** Minutos tecleados → caducidad válida (0..240) o `null`: vacío, `1,5`, `-3` o `1e2` no lo son. */
export function parseExpiryLeadMinutes(draft: string): number | null {
  return parseMinutes(draft, SLOT_OFFER_EXPIRY_LEAD_MIN, SLOT_OFFER_EXPIRY_LEAD_MAX);
}

/** Minutos tecleados → antelación mínima válida (5..240) o `null`. */
export function parseMinLeadMinutes(draft: string): number | null {
  return parseMinutes(draft, SLOT_OFFER_MIN_LEAD_MIN, SLOT_OFFER_MIN_LEAD_MAX);
}

export function getSlotOfferSettings(token: string): Promise<SlotOfferSettings> {
  return apiFetch<SlotOfferSettings>('/slot-offer-settings', { token });
}

export function saveSlotOfferSettings(token: string, input: SlotOfferSettingsInput): Promise<SlotOfferSettings> {
  return apiFetch<SlotOfferSettings>('/slot-offer-settings', { method: 'PUT', body: input, token });
}
