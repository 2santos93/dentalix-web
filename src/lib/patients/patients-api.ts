import { apiFetch } from '@/lib/api/client';
import type { components, paths } from '@/lib/api/schema';

export type CreatePatientInput = components['schemas']['CreatePatientDto'];

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
  tenant?: string | null,
): Promise<PatientsListResponse> {
  const search = new URLSearchParams();
  if (params?.query) search.set('query', params.query);
  if (params?.page !== undefined) search.set('page', String(params.page));
  if (params?.pageSize !== undefined) search.set('pageSize', String(params.pageSize));
  const qs = search.toString();

  return apiFetch<PatientsListResponse>(`/patients${qs ? `?${qs}` : ''}`, {
    token,
    tenant: tenant ?? null,
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
  tenant?: string | null,
): Promise<Patient> {
  return apiFetch<Patient>('/patients', {
    method: 'POST',
    body: input,
    token,
    tenant: tenant ?? null,
  });
}
