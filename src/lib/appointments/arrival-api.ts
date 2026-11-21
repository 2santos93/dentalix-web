import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * DX-265: «Ya llegué». El paciente marca su llegada desde el enlace de su
 * cita (DX-005) o con el QR de la sede (documento + fecha de nacimiento). La
 * API decide la ventana, el estado y si toca «Tome asiento» o «Pase por
 * recepción»; la página solo lo pinta.
 */
export type PublicArrival = components['schemas']['PublicArrivalViewDto'];
export type ArrivalState = PublicArrival['state'];
export type ArrivalResult = NonNullable<PublicArrival['result']>;
export type PublicArrivalAppointment = components['schemas']['PublicArrivalAppointmentDto'];
export type PublicCheckInQr = components['schemas']['PublicCheckInQrViewDto'];
export type CheckInSettings = components['schemas']['CheckInSettingsDto'];
export type UpdateCheckInSettingsInput = components['schemas']['UpdateCheckInSettingsDto'];
export type CreatedCheckInQr = components['schemas']['CreatedCheckInQrDto'];

/** Códigos de error del QR (el mensaje en español lo trae la API). */
export const CHECK_IN_NO_MATCH = 'CHECK_IN_NO_MATCH';
export const CHECK_IN_LOCKED = 'CHECK_IN_LOCKED';

/** Límites de los minutos de la ventana (los mismos que la API). */
export const CHECK_IN_MINUTES_MAX = 240;

const confirmationPath = (token: string) => `/public/appointment-confirmations/${encodeURIComponent(token)}/arrival`;
const qrPath = (token: string) => `/public/check-in/${encodeURIComponent(token)}`;

/** `GET …/:token/arrival` — ¿puede marcar «Ya llegué»? Solo lee. */
export function getLinkArrival(confirmationToken: string): Promise<PublicArrival> {
  return apiFetch<PublicArrival>(confirmationPath(confirmationToken));
}

/** `POST …/:token/arrival` — marca la llegada (idempotente; 409 fuera de ventana). */
export function postLinkArrival(confirmationToken: string): Promise<PublicArrival> {
  return apiFetch<PublicArrival>(confirmationPath(confirmationToken), { method: 'POST' });
}

/** `GET /public/check-in/:token` — la sede del QR (404 si el QR ya no vale). */
export function getCheckInQr(qrToken: string): Promise<PublicCheckInQr> {
  return apiFetch<PublicCheckInQr>(qrPath(qrToken));
}

/** `POST /public/check-in/:token` — identificarse y marcar la llegada de la cita de hoy. */
export function identifyCheckIn(
  qrToken: string,
  input: { documentNumber: string; birthDate: string },
): Promise<PublicArrival> {
  return apiFetch<PublicArrival>(qrPath(qrToken), { method: 'POST', body: input });
}

// ── Ajustes de la sede (ADMIN) ───────────────────────────────────────────────

const settingsPath = (locationId: string) => `/locations/${encodeURIComponent(locationId)}/check-in-settings`;

export function getCheckInSettings(token: string, locationId: string): Promise<CheckInSettings> {
  return apiFetch<CheckInSettings>(settingsPath(locationId), { token });
}

export function updateCheckInSettings(
  token: string,
  locationId: string,
  input: UpdateCheckInSettingsInput,
): Promise<CheckInSettings> {
  return apiFetch<CheckInSettings>(settingsPath(locationId), { method: 'PATCH', token, body: input });
}

/** Genera el QR (el token sale UNA vez); el anterior deja de valer. */
export function createCheckInQr(token: string, locationId: string): Promise<CreatedCheckInQr> {
  return apiFetch<CreatedCheckInQr>(`${settingsPath(locationId)}/qr`, { method: 'POST', token });
}

export function revokeCheckInQr(token: string, locationId: string): Promise<CheckInSettings> {
  return apiFetch<CheckInSettings>(`${settingsPath(locationId)}/qr/revoke`, { method: 'POST', token });
}

/** La dirección del cartel: `<origen>/llegada/<token>`. */
export function checkInQrUrl(origin: string, qrToken: string): string {
  return `${origin.replace(/\/+$/, '')}/llegada/${encodeURIComponent(qrToken)}`;
}
