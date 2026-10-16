import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

export type PerioExamSummary = components['schemas']['PerioExamSummaryDto'];
export type PerioExamDetail = components['schemas']['PerioExamDetailDto'];
export type PerioIndices = components['schemas']['PerioIndicesDto'];
export type PerioSiteMeasure = components['schemas']['PerioSiteMeasureDto'];
export type PerioToothMeasure = components['schemas']['PerioToothMeasureDto'];
export type PerioSite = components['schemas']['PerioSite'];
export type PerioExamStatus = components['schemas']['PerioExamStatus'];
export type CreatePerioExamInput = components['schemas']['CreatePerioExamDto'];
export type SavePerioMeasuresInput = components['schemas']['SavePerioMeasuresDto'];

/**
 * Quién usa el periodontograma: los mismos roles que la API (CLINICAL_ROLES).
 * Recepción no. Solo decide qué se PINTA; el servidor vuelve a comprobarlo.
 */
export const PERIO_ROLES: readonly ClinicRole[] = ['DENTIST', 'ASSISTANT', 'ADMIN'];

/** `null` (sin sesión de clínica legible) cuenta como "sin permiso". */
export function canUsePerio(role: ClinicRole | null): boolean {
  return role !== null && PERIO_ROLES.includes(role);
}

function examsPath(patientId: string): string {
  return `/patients/${encodeURIComponent(patientId)}/perio-exams`;
}

function examPath(patientId: string, examId: string): string {
  return `${examsPath(patientId)}/${encodeURIComponent(examId)}`;
}

/** `GET /patients/:id/perio-exams` — histórico, fecha desc, con índices. */
export async function listPerioExams(
  token: string,
  patientId: string,
): Promise<PerioExamSummary[]> {
  return apiFetch<PerioExamSummary[]>(examsPath(patientId), { token });
}

/** `POST /patients/:id/perio-exams` — crea un borrador. */
export async function createPerioExam(
  token: string,
  patientId: string,
  input: CreatePerioExamInput,
): Promise<PerioExamDetail> {
  return apiFetch<PerioExamDetail>(examsPath(patientId), {
    method: 'POST',
    body: input,
    token,
  });
}

/** `GET /patients/:id/perio-exams/:examId` — medidas con NIC calculado. */
export async function getPerioExam(
  token: string,
  patientId: string,
  examId: string,
): Promise<PerioExamDetail> {
  return apiFetch<PerioExamDetail>(examPath(patientId, examId), { token });
}

/**
 * `PUT .../measures` — upsert de los sitios/dientes que vienen (un sitio
 * vacío limpia la celda). 400 con el detalle si algo está fuera de rango; 409
 * si el examen ya está finalizado.
 */
export async function savePerioMeasures(
  token: string,
  patientId: string,
  examId: string,
  input: SavePerioMeasuresInput,
): Promise<PerioExamDetail> {
  return apiFetch<PerioExamDetail>(`${examPath(patientId, examId)}/measures`, {
    method: 'PUT',
    body: input,
    token,
  });
}

/** `POST .../finalize` — el examen queda inmutable. */
export async function finalizePerioExam(
  token: string,
  patientId: string,
  examId: string,
): Promise<PerioExamDetail> {
  return apiFetch<PerioExamDetail>(`${examPath(patientId, examId)}/finalize`, {
    method: 'POST',
    token,
  });
}

/** `DELETE .../:examId` — solo borradores. */
export async function deletePerioExam(
  token: string,
  patientId: string,
  examId: string,
): Promise<void> {
  // 204 sin cuerpo.
  await apiFetchOrNull<void>(examPath(patientId, examId), {
    method: 'DELETE',
    token,
  });
}

export const PERIO_STATUS_LABELS: Record<PerioExamStatus, string> = {
  DRAFT: 'Borrador',
  FINAL: 'Finalizado',
};
