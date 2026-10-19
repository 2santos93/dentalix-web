import { apiFetch } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import type { AppointmentTypeSummary } from './appointment-types-api';
import type { OverdueBalance } from '@/lib/collections/collections-api';

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
  /** Sede donde ocurre la cita. */
  locationId: string;
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
  /** DX-121: tipo de la cita (null en las citas sin tipo). */
  appointmentTypeId: string | null;
  /**
   * DX-121: el tipo embebido — nombre, duración y color `#RRGGBB` validado por
   * la API. Se mantiene aunque el tipo se desactive o retire después.
   */
  appointmentType: AppointmentTypeSummary | null;
  /**
   * DX-005: cuándo se generó el enlace de confirmación vigente (ISO). `null` si
   * nunca se envió o si la cita se reagendó / cambió de estado después.
   */
  confirmationSentAt: string | null;
  /** DX-005: el paciente pidió que lo llamen desde el enlace (ISO); la cita sigue SCHEDULED. */
  callbackRequestedAt: string | null;
  /**
   * DX-210: «Adelantar si hay hueco» — sale como candidata en «Ocupar este
   * hueco» y se apaga al adelantarla.
   */
  wantsEarlier: boolean;
  /**
   * DX-200: horas del flujo en la clínica (ISO, reloj del servidor): llegó, en
   * sillón, listo para cobrar. `null` en las citas antiguas o sin ese paso.
   * Opcionales aquí solo para no obligar a los dobles de los tests a llevarlas.
   */
  arrivedAt?: string | null;
  seatedAt?: string | null;
  readyForCheckoutAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * DX-150: solo en `GET /appointments` (la agenda) — marca «Saldo vencido» del
   * paciente. `amounts` solo llega a ADMIN y RECEPTION.
   */
  balance?: OverdueBalance;
  /**
   * DX-122: solo en la respuesta de crear o mover — avisos que no impidieron la
   * operación (p. ej. «La cita cae en un bloqueo que permite agendar…»).
   */
  warnings?: string[];
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
  // DX-121: columnas de la vista Día; se repite el parámetro (hasta 12).
  for (const id of params.providerIds ?? []) search.append('providerIds', id);
  if (params.locationId) search.set('locationId', params.locationId);

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

/**
 * Quién puede crear y mover citas: los mismos roles que la API
 * (`APPOINTMENT_ROLES`, hoy los cuatro). Solo decide qué se PINTA (p. ej. el
 * arrastre de la vista Día); el servidor responde 403 a cualquier otro.
 */
export const APPOINTMENT_ROLES: readonly ClinicRole[] = [
  'DENTIST',
  'ASSISTANT',
  'RECEPTION',
  'ADMIN',
];

/** `null` (sin sesión de clínica legible) cuenta como "sin permiso". */
export function canMoveAppointments(role: ClinicRole | null): boolean {
  return role !== null && APPOINTMENT_ROLES.includes(role);
}

/**
 * `PATCH /appointments/:id` — reschedule (`start`/`end`), move to another
 * provider (`providerId`, DX-121: 409 si choca, 422 fuera de horario) and/or
 * change `status`.
 */
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
