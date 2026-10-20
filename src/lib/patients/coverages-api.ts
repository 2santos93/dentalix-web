import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// DX-153: coberturas del paciente. Las formas salen del contrato generado.
export type PatientCoverage = components['schemas']['PatientCoverageDto'];
export type CreateCoverageInput = components['schemas']['CreatePatientCoverageDto'];
export type UpdateCoverageInput = components['schemas']['UpdatePatientCoverageDto'];

const base = (patientId: string) => `/patients/${encodeURIComponent(patientId)}/coverages`;

/** `GET /patients/:id/coverages` — las coberturas vivas del paciente. */
export function listCoverages(token: string, patientId: string): Promise<PatientCoverage[]> {
  return apiFetch<PatientCoverage[]>(base(patientId), { token });
}

export function createCoverage(
  token: string,
  patientId: string,
  input: CreateCoverageInput,
): Promise<PatientCoverage> {
  return apiFetch<PatientCoverage>(base(patientId), { method: 'POST', body: input, token });
}

export function updateCoverage(
  token: string,
  patientId: string,
  id: string,
  patch: UpdateCoverageInput,
): Promise<PatientCoverage> {
  return apiFetch<PatientCoverage>(`${base(patientId)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
    token,
  });
}

/** Quita la cobertura (204 sin cuerpo). */
export async function deleteCoverage(
  token: string,
  patientId: string,
  id: string,
): Promise<void> {
  await apiFetchOrNull<null>(`${base(patientId)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
}
