import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// DX-122: «Pendientes por agendar» y «Buscar hueco», del contrato generado.
export type WaitlistEntry = components['schemas']['WaitlistEntryDto'];
export type WaitlistPage = components['schemas']['WaitlistPageDto'];
export type CreateWaitlistEntryInput = components['schemas']['CreateWaitlistEntryDto'];
export type ScheduleFromWaitlistInput = components['schemas']['ScheduleFromWaitlistDto'];
export type Openings = components['schemas']['OpeningsDto'];
export type Opening = components['schemas']['OpeningDto'];
/** Cita creada o movida, con los avisos que no la impidieron. */
export type AppointmentWrite = components['schemas']['AppointmentWriteDto'];

/** `GET /waitlist` — OPEN por defecto; urgentes primero, luego la más antigua. */
export async function listWaitlist(
  token: string,
  params: { status?: WaitlistEntry['status']; locationId?: string; page?: number; pageSize?: number } = {},
): Promise<WaitlistPage> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.locationId) search.set('locationId', params.locationId);
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));
  const query = search.toString();
  return apiFetch<WaitlistPage>(`/waitlist${query ? `?${query}` : ''}`, { token });
}

export async function createWaitlistEntry(
  token: string,
  input: CreateWaitlistEntryInput,
): Promise<WaitlistEntry> {
  return apiFetch<WaitlistEntry>('/waitlist', { method: 'POST', body: input, token });
}

/** Descartar con motivo (obligatorio); 409 si ya no estaba abierta. */
export async function dismissWaitlistEntry(
  token: string,
  id: string,
  reason: string,
): Promise<WaitlistEntry> {
  return apiFetch<WaitlistEntry>(`/waitlist/${id}/dismiss`, {
    method: 'POST',
    body: { reason },
    token,
  });
}

/**
 * «Agendar aquí»: crea la cita del paciente en la sede de la entrada y la
 * entrada pasa a SCHEDULED en la misma transacción.
 */
export async function scheduleFromWaitlist(
  token: string,
  id: string,
  input: ScheduleFromWaitlistInput,
): Promise<AppointmentWrite> {
  return apiFetch<AppointmentWrite>(`/waitlist/${id}/schedule`, {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * `GET /appointments/openings`: huecos del profesional en la sede, en su
 * horario y su zona, fuera de bloqueos y sin solape. `from`/`to` son días
 * civiles (YYYY-MM-DD, hasta 31).
 */
export async function findOpenings(
  token: string,
  params: {
    providerId: string;
    locationId: string;
    from: string;
    to: string;
    durationMinutes: number;
    patientId?: string;
  },
): Promise<Openings> {
  const search = new URLSearchParams({
    providerId: params.providerId,
    locationId: params.locationId,
    from: params.from,
    to: params.to,
    durationMinutes: String(params.durationMinutes),
  });
  if (params.patientId) search.set('patientId', params.patientId);
  return apiFetch<Openings>(`/appointments/openings?${search.toString()}`, { token });
}
