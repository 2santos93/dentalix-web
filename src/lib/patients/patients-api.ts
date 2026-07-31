import { apiFetch } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/schema';
import type { ClinicalHistoryValue } from '@/lib/clinical/clinical-types';

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
  physicianName?: string | null;
  physicianPhone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  guardianName?: string | null;
  guardianDocNumber?: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

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
