import { apiFetch } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/schema';

export type CreateAppointmentInput = components['schemas']['CreateAppointmentDto'];
export type UpdateAppointmentInput = components['schemas']['UpdateAppointmentDto'];

// The status union is re-used from the generated OpenAPI schema
// (`UpdateAppointmentDto.status` carries `@ApiProperty({ enum: AppointmentStatus })`)
// so it stays in sync with the backend `AppointmentStatus` enum without
// duplicating the literal list by hand — same convention as
// `DocType`/`Sex` in `patients-api.ts`.
export type AppointmentStatus = NonNullable<UpdateAppointmentInput['status']>;

export type ListAppointmentsParams = paths['/api/v1/appointments']['get']['parameters']['query'];

/**
 * `POST /appointments`, `GET /appointments`, `GET /appointments/:id` and
 * `PATCH /appointments/:id` return the plain TS `Appointment` interface on
 * the backend (`src/modules/appointments/domain/entities/appointment.entity.ts`),
 * not a class decorated with `@ApiProperty()` — same situation as
 * `Patient`/`ToothRecord` — so the generated `schema.d.ts` has no body shape
 * for these routes (`content?: never`). Hand-written to mirror that entity —
 * keep in sync if it changes.
 */
export interface Appointment {
  id: string;
  tenantId: string;
  patientId: string;
  /**
   * Patient's name, joined server-side so a row can be labeled without
   * fetching the patient list. Replaces the old `GET /patients?pageSize=100`
   * name map, which showed a raw UUID for everyone past the first 100
   * patients (the endpoint's hard cap). Null if the API couldn't join it.
   */
  patientFirstName: string | null;
  patientLastName: string | null;
  providerId: string;
  /** ISO datetime (UTC on the wire; the frontend renders it in local time). */
  start: string;
  /** ISO datetime (UTC on the wire; the frontend renders it in local time). */
  end: string;
  status: AppointmentStatus;
  reason: string | null;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createAppointment(
  token: string,
  input: CreateAppointmentInput,
): Promise<Appointment> {
  return apiFetch<Appointment>('/appointments', {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * `GET /appointments?from&to&providerId`. Returned ASC by `start` within the
 * requested range (backend contract, see `PrismaAppointmentRepository.listByRange`)
 * — callers may still want to re-sort defensively (e.g. `DayAgenda` does).
 */
export async function listAppointments(
  token: string,
  params: ListAppointmentsParams,
): Promise<Appointment[]> {
  const search = new URLSearchParams();
  search.set('from', params.from);
  search.set('to', params.to);
  if (params.providerId) search.set('providerId', params.providerId);

  return apiFetch<Appointment[]>(`/appointments?${search.toString()}`, {
    token,
  });
}

export async function getAppointment(
  token: string,
  id: string,
): Promise<Appointment> {
  return apiFetch<Appointment>(`/appointments/${id}`, {
    token,
  });
}

/** `PATCH /appointments/:id` — reschedule (`start`/`end`) and/or change `status`. */
export async function updateAppointment(
  token: string,
  id: string,
  patch: UpdateAppointmentInput,
): Promise<Appointment> {
  return apiFetch<Appointment>(`/appointments/${id}`, {
    method: 'PATCH',
    body: patch,
    token,
  });
}
