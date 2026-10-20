import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/schema';
import type { ClinicalHistoryValue } from '@/lib/clinical/clinical-types';
import type { OverdueBalance } from '@/lib/collections/collections-api';

/**
 * The generated `CreatePatientDto.medicalHistory` collapses its nested
 * array/object fields to `Record<string, never>` — the backend's nested DTO
 * classes carry class-validator decorators but no `@ApiProperty()`, so
 * NestJS Swagger can't introspect them (see clinical-types.ts's file-level
 * comment). Override that one field with the hand-typed
 * `ClinicalHistoryValue`, exactly as `clinical-api.ts` does for
 * `SaveMedicalHistoryInput`, so callers pass a real structured value with no
 * cast. Drop the override once those backend DTOs are annotated.
 */
export type CreatePatientInput = Omit<
  components['schemas']['CreatePatientDto'],
  'medicalHistory'
> & {
  medicalHistory?: ClinicalHistoryValue;
};

// The `docType`/`sex` unions are re-used from the generated OpenAPI schema
// (backend DTOs carry `@ApiProperty({ enum: ... })`) so they stay in sync
// with the API without duplicating the literal list by hand.
export type DocType = components['schemas']['CreatePatientDto']['docType'];
export type Sex = components['schemas']['CreatePatientDto']['sex'];

export type UpdatePatientInput = components['schemas']['UpdatePatientDto'];

/**
 * DX-153: resumen de la cobertura vigente del paciente (`GET /patients`,
 * `GET /patients/:id` y `GET /appointments`). Nunca trae el n.º de afiliado.
 */
export type CoverageSummary = components['schemas']['CoverageSummaryDto'];

/**
 * `GET /patients` (and `GET /patients/:id`) return a plain TS interface on
 * the backend (`Patient`, `ListPatientsOutput`), not a class decorated with
 * `@ApiProperty()` — NestJS Swagger can't introspect that, so the generated
 * `schema.d.ts` has no body shape for these responses (`content?: never`).
 * These are hand-written to mirror `dentalix-api`'s
 * `src/modules/patients/domain/entities/patient.entity.ts` and
 * `list-patients.use-case.ts#ListPatientsOutput` — keep them in sync if
 * those change.
 */
export interface Patient {
  /**
   * DX-150: solo en `GET /patients/:id` — marca «Saldo vencido» de la cabecera.
   * `amounts` solo llega a ADMIN y RECEPTION.
   */
  balance?: OverdueBalance;
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  docType: DocType;
  docNumber: string | null;
  birthDate: string | null;
  sex: Sex;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  // Optional: `PatientDto` (the generated read shape) wasn't updated to
  // carry these when `CreatePatientDto`/`SaveMedicalHistoryDto` gained them
  // (see Task 1 report) — declared optional here so the ficha can read them
  // defensively from `GET /patients/:id` once the backend response shape
  // catches up, without a hard compile-time guarantee they're present.
  dataConsentAccepted?: boolean;
  dataConsentAt?: string | null;
  dataConsentPolicyVersion?: string | null;
  maritalStatus?: string | null;
  occupation?: string | null;
  insurerEps?: string | null;
  /** DX-153: resumen de cobertura; solo en las lecturas (GET), no en PATCH. */
  coverage?: CoverageSummary;
  physicianName?: string | null;
  physicianPhone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  /** DEPRECADO (DX-203), solo lectura: el acudiente es un responsable. */
  guardianName?: string | null;
  /** DEPRECADO (DX-203), solo lectura. */
  guardianDocNumber?: string | null;
  createdById: string | null;
  // DX-039 · retención legal de la HC (Res. 839/2017). Opcionales: los
  // fixtures anteriores no los traen; la API siempre los manda.
  lastAttentionAt?: string | null;
  retentionExtended?: RetentionExtension;
  /** Último día (incluido, `YYYY-MM-DD`); null sin atenciones o PERMANENT. */
  retentionUntil?: string | null;
  underRetention?: boolean;
  partiallySuppressedAt?: string | null;
  // DX-128 · canal de los recordatorios, opt-in de WhatsApp y baja. El bloque
  // «Comunicaciones» los lee de `GET /patients/:id/communication`; aquí van
  // por ser parte de la ficha. Opcionales: los fixtures anteriores no los traen.
  contactChannel?: ContactChannel;
  whatsappOptInAt?: string | null;
  whatsappOptInSource?: components['schemas']['WhatsappOptInSource'] | null;
  whatsappOptInById?: string | null;
  reminderOptOutAt?: string | null;
  reminderOptOutSource?: components['schemas']['ReminderOptOutSource'] | null;
  createdAt: string;
  updatedAt: string;
}

export type RetentionExtension = components['schemas']['RetentionExtension'];
export type ContactChannel = components['schemas']['ContactChannel'];
export type SetRetentionExtensionInput =
  components['schemas']['SetRetentionExtensionDto'];
export type PartialSuppressionInput =
  components['schemas']['PartialSuppressionDto'];

/** Mismos topes que el DTO de la API (`retention.dto.ts`). */
export const RETENTION_REASON_MIN = 10;
export const RETENTION_REASON_MAX = 500;

export interface PatientsListResponse {
  items: Patient[];
  total: number;
  page: number;
  pageSize: number;
}

export type ListPatientsParams =
  paths['/api/v1/patients']['get']['parameters']['query'];

export async function listPatients(
  token: string,
  params: ListPatientsParams = {},
): Promise<PatientsListResponse> {
  const search = new URLSearchParams();
  if (params?.query) search.set('query', params.query);
  if (params?.page !== undefined) search.set('page', String(params.page));
  if (params?.pageSize !== undefined) search.set('pageSize', String(params.pageSize));
  if (params?.payerId) search.set('payerId', params.payerId);
  const qs = search.toString();

  return apiFetch<PatientsListResponse>(`/patients${qs ? `?${qs}` : ''}`, {
    token,
  });
}

/**
 * `POST /patients`. Like `GET /patients`, the generated `schema.d.ts` has no
 * response body shape for this route (the controller returns the domain
 * `Patient` entity, not a `@ApiProperty()`-decorated class) — the response
 * is cast to the hand-written `Patient` type above.
 */
export async function createPatient(
  token: string,
  input: CreatePatientInput,
): Promise<Patient> {
  return apiFetch<Patient>('/patients', {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * `GET /patients/:id`. Like `GET /patients` above, the generated
 * `schema.d.ts` has no response body shape for this route — cast to the
 * hand-written `Patient` type.
 */
export async function getPatient(
  token: string,
  id: string,
): Promise<Patient> {
  return apiFetch<Patient>(`/patients/${id}`, {
    token,
  });
}

/**
 * `PATCH /patients/:id` — actualización parcial. Sólo viajan los campos
 * presentes en `input`; los ausentes quedan como estaban.
 */
export async function updatePatient(
  token: string,
  id: string,
  input: UpdatePatientInput,
): Promise<Patient> {
  return apiFetch<Patient>(`/patients/${id}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

/**
 * `DELETE /patients/:id` — archivar (borrado blando, solo ADMIN). Con la HC en
 * retención legal responde 409 `CLINICAL_RECORD_RETENTION` con el mensaje en
 * español y la fecha (DX-039).
 */
export async function archivePatient(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/patients/${id}`, { method: 'DELETE', token });
}

/** `PATCH /patients/:id/retention` — retención extendida (solo ADMIN). */
export async function setRetentionExtension(
  token: string,
  id: string,
  input: SetRetentionExtensionInput,
): Promise<Patient> {
  return apiFetch<Patient>(`/patients/${id}/retention`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

/** `POST /patients/:id/partial-suppression` — supresión parcial (solo ADMIN). */
export async function partiallySuppressPatient(
  token: string,
  id: string,
  input: PartialSuppressionInput,
): Promise<Patient> {
  return apiFetch<Patient>(`/patients/${id}/partial-suppression`, {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * Sustituye el paciente por la respuesta de una mutación (retención, supresión
 * parcial) sin perder `balance` ni `coverage`: la API solo los calcula en los
 * GET de lista y detalle, así que esas respuestas vienen sin ellos.
 */
export function replacePatientKeepingDerived(prev: Patient | null, next: Patient): Patient {
  return { ...next, balance: next.balance ?? prev?.balance, coverage: next.coverage ?? prev?.coverage };
}
