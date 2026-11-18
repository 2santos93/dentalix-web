import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

type Schemas = components['schemas'];

// ── Página pública /reservar (DX-016) ─────────────────────────────────────────

/**
 * La sede tal como la ve el paciente. `locale` y `hourCycle` son opcionales
 * hasta que la API los mande (como las demás páginas públicas): sin ellos la
 * hora se pinta con la lengua del producto, nunca con la del navegador.
 */
export type PublicBookingLocation = Schemas['PublicBookingConfigDto']['locations'][number] & {
  locale?: string | null;
  hourCycle?: Schemas['HourCycle'] | null;
};
export type PublicBookingConfig = Omit<Schemas['PublicBookingConfigDto'], 'locations'> & {
  locations: PublicBookingLocation[];
};
export type PublicBookingType = Schemas['PublicBookingConfigDto']['types'][number];
export type PublicBookingProvider = Schemas['PublicBookingConfigDto']['providers'][number];
export type PublicSlots = Schemas['PublicSlotsDto'];
export type PublicSlot = PublicSlots['slots'][number];
export type PublicBookingResult = Schemas['PublicBookingResultDto'] & {
  locale?: string | null;
  hourCycle?: Schemas['HourCycle'] | null;
};
export type BookingCodeSent = Schemas['BookingCodeSentDto'];
export type BookingSession = Schemas['BookingSessionDto'];
export type OnlinePatientKind = Schemas['OnlineBookingPatientKind'];
export type OnlineBookingMode = Schemas['OnlineBookingMode'];
export type NewPatientInput = Schemas['NewPatientDto'];

/** Los campos anti-bots de cada envío público. */
export interface AntiBotFields {
  /** El `formToken` de `GET /public/booking` (mide el tiempo de rellenado). */
  formToken: string;
  /** Campo trampa: lo que haya escrito un bot (una persona no lo ve). */
  website: string;
  /**
   * PUNTO DE ENGANCHE DEL CAPTCHA (DX-016): el token del desafío anti-bots de
   * un proveedor. Hoy siempre `null`: el proveedor está pendiente de decisión
   * del dueño y la API (`BotChallengeVerifier`) no exige ninguno. Cuando se
   * elija, el widget lo rellena aquí antes de cada POST.
   */
  challengeToken: string | null;
}

const SESSION_HEADER = 'X-Booking-Session';

function sessionHeaders(sessionToken: string | null | undefined): Record<string, string> | undefined {
  return sessionToken ? { [SESSION_HEADER]: sessionToken } : undefined;
}

/** `GET /public/booking`: lo que ofrece la clínica del host. 404 = reserva no disponible. */
export function getPublicBookingConfig(): Promise<PublicBookingConfig> {
  return apiFetch<PublicBookingConfig>('/public/booking');
}

export interface PublicSlotsQuery {
  locationId: string;
  appointmentTypeId: string;
  providerId: string | null;
  patientKind: OnlinePatientKind;
  /** Primer día (YYYY-MM-DD) en la zona de la sede. */
  from: string;
  days: number;
}

/** `GET /public/booking/slots`: solo instantes libres (nada de nombres ni citas). */
export function listPublicSlots(query: PublicSlotsQuery, sessionToken: string | null): Promise<PublicSlots> {
  const params = new URLSearchParams({
    locationId: query.locationId,
    appointmentTypeId: query.appointmentTypeId,
    patientKind: query.patientKind,
    from: query.from,
    days: String(query.days),
  });
  if (query.providerId) params.set('providerId', query.providerId);
  return apiFetch<PublicSlots>(`/public/booking/slots?${params.toString()}`, {
    headers: sessionHeaders(sessionToken),
  });
}

export interface RequestCodeInput {
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
}

/** `POST /public/booking/verification`: siempre la misma respuesta (no dice si la ficha existe). */
export function requestBookingCode(input: RequestCodeInput, anti: AntiBotFields): Promise<BookingCodeSent> {
  return apiFetch<BookingCodeSent>('/public/booking/verification', {
    method: 'POST',
    body: { ...input, ...anti },
  });
}

/** `POST /public/booking/verification/:id/verify`: abre la sesión de 30 min (400 uniforme si no). */
export function verifyBookingCode(verificationId: string, code: string): Promise<BookingSession> {
  return apiFetch<BookingSession>(`/public/booking/verification/${encodeURIComponent(verificationId)}/verify`, {
    method: 'POST',
    body: { code },
  });
}

export interface CreateBookingInput {
  locationId: string;
  appointmentTypeId: string;
  providerId: string | null;
  start: string;
  /** Paciente nuevo; sin él, la sesión (existente o reintento) en la cabecera. */
  newPatient: NewPatientInput | null;
}

/** `POST /public/booking`: BOOKED (directa) o REQUESTED (solicitud). */
export function createPublicBooking(
  input: CreateBookingInput,
  anti: AntiBotFields,
  sessionToken: string | null,
): Promise<PublicBookingResult> {
  return apiFetch<PublicBookingResult>('/public/booking', {
    method: 'POST',
    body: {
      locationId: input.locationId,
      appointmentTypeId: input.appointmentTypeId,
      providerId: input.providerId,
      start: input.start,
      ...(input.newPatient && !sessionToken ? { newPatient: input.newPatient } : {}),
      ...anti,
    },
    headers: sessionHeaders(sessionToken),
  });
}

// ── Personal: ajustes, tipos y bandeja ───────────────────────────────────────

export type OnlineBookingSettings = Schemas['OnlineBookingSettingsDto'];
export type OnlineBookingSettingsInput = Schemas['UpdateOnlineBookingSettingsDto'];
export type OnlineType = Schemas['OnlineTypeDto'];
export type OnlineTypeInput = Schemas['UpdateOnlineTypeDto'];
export type OnlineRequest = Schemas['OnlineRequestDto'];
export type OnlineRequestPage = Schemas['OnlineRequestPageDto'];
export type OnlineRequestStatus = Schemas['OnlineBookingStatus'];

/** Ruta de la bandeja «Solicitudes online» (sin entrada en la barra: Pendientes y ⌘K). */
export const ONLINE_REQUESTS_HREF = '/solicitudes-online';
/** Ajustes › Reserva online. */
export const ONLINE_BOOKING_SETTINGS_HREF = '/settings/reserva-online';
/** La página pública, en el subdominio de la clínica. */
export const PUBLIC_BOOKING_PATH = '/reservar';

/** Límites de la API (DTO y CHECK en la BD). */
export const ONLINE_LEAD_MAX_MINUTES = 7 * 24 * 60;
export const ONLINE_ADVANCE_MAX_DAYS = 365;
export const ONLINE_STEP_MIN = 5;
export const ONLINE_STEP_MAX = 60;
export const ONLINE_DURATION_MIN = 5;
export const ONLINE_DURATION_MAX = 480;
/** Tiempo mínimo entre cargar el formulario y enviarlo (anti-bots de la API). */
export const FORM_MIN_FILL_SECONDS = 4;

/** Ajustes y tipos los cambia solo ADMIN (la API también lo exige: 403). */
export function canManageOnlineBooking(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/**
 * La bandeja la atiende el mostrador (ADMIN y recepción), como la lista de
 * espera. La API la deja leer a los roles de la agenda; esto solo decide qué
 * se ofrece en Pendientes y en ⌘K.
 */
export function canReviewOnlineRequests(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

export function getOnlineBookingSettings(token: string): Promise<OnlineBookingSettings> {
  return apiFetch<OnlineBookingSettings>('/online-booking/settings', { token });
}

export function saveOnlineBookingSettings(
  token: string,
  input: OnlineBookingSettingsInput,
): Promise<OnlineBookingSettings> {
  return apiFetch<OnlineBookingSettings>('/online-booking/settings', { method: 'PUT', body: input, token });
}

export function listOnlineTypes(token: string): Promise<OnlineType[]> {
  return apiFetch<OnlineType[]>('/online-booking/types', { token });
}

export function saveOnlineType(token: string, appointmentTypeId: string, input: OnlineTypeInput): Promise<OnlineType> {
  return apiFetch<OnlineType>(`/online-booking/types/${encodeURIComponent(appointmentTypeId)}`, {
    method: 'PUT',
    body: input,
    token,
  });
}

export function listOnlineRequests(
  token: string,
  query: { status: OnlineRequestStatus | null; page: number; pageSize: number },
): Promise<OnlineRequestPage> {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.status) params.set('status', query.status);
  return apiFetch<OnlineRequestPage>(`/online-booking/requests?${params.toString()}`, { token });
}

export async function getOnlinePendingCount(token: string): Promise<number> {
  const res = await apiFetch<Schemas['OnlinePendingCountDto']>('/online-booking/requests/pending-count', { token });
  return res.pending;
}

export function acceptOnlineRequest(token: string, id: string): Promise<OnlineRequest> {
  return apiFetch<OnlineRequest>(`/online-booking/requests/${encodeURIComponent(id)}/accept`, {
    method: 'POST',
    token,
  });
}

export function declineOnlineRequest(token: string, id: string): Promise<OnlineRequest> {
  return apiFetch<OnlineRequest>(`/online-booking/requests/${encodeURIComponent(id)}/decline`, {
    method: 'POST',
    token,
  });
}
