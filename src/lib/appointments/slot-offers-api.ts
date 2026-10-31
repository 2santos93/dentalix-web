import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// DX-435: la oferta de hueco por enlace, vista por el paciente (página pública).
export type PublicSlotOffer = components['schemas']['PublicSlotOfferDto'];
export type PublicSlotOfferState = PublicSlotOffer['state'];
export type PublicSlotOfferDetails = components['schemas']['PublicSlotOfferDetailsDto'];

const path = (token: string) => `/public/slot-offers/${encodeURIComponent(token)}`;

/** `GET /public/slot-offers/:token`: solo lee (los previsualizadores lo abren solos). */
export async function getPublicSlotOffer(token: string): Promise<PublicSlotOffer> {
  return apiFetch<PublicSlotOffer>(path(token));
}

/**
 * `POST …/accept`: el primero que acepta se queda el hueco. Quien llega tarde
 * recibe 200 con `state` `TAKEN`, `UNAVAILABLE` o `EXPIRED` (no un error).
 */
export async function acceptPublicSlotOffer(token: string): Promise<PublicSlotOffer> {
  return apiFetch<PublicSlotOffer>(`${path(token)}/accept`, { method: 'POST' });
}

/** `POST …/decline`: «No me viene bien». */
export async function declinePublicSlotOffer(token: string): Promise<PublicSlotOffer> {
  return apiFetch<PublicSlotOffer>(`${path(token)}/decline`, { method: 'POST' });
}
