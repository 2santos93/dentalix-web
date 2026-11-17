import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/**
 * DX-568: Ajustes › Resumen semanal. El resumen por email con las cifras de la
 * semana de cada sede frente a la anterior, para los ADMIN que se elijan.
 */
export type WeeklyDigestSettings = components['schemas']['WeeklyDigestSettingsDto'];
export type WeeklyDigestCandidate = components['schemas']['WeeklyDigestCandidateDto'];
export type WeeklyDigestSettingsInput = components['schemas']['UpdateWeeklyDigestSettingsDto'];
export type WeeklyDigestTestResult = components['schemas']['WeeklyDigestTestResultDto'];

/** Aviso de la API: activado sin ningún destinatario (no sale nada). */
export const WEEKLY_DIGEST_NO_RECIPIENTS = 'NO_RECIPIENTS';
/** 409 de la prueba: quien la pide no confirmó su correo. */
export const WEEKLY_DIGEST_EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

/** Solo ADMIN ve y cambia el resumen (la API también lo exige: 403). Solo decide qué se PINTA. */
export function canManageWeeklyDigest(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /clinic/weekly-digest-settings`: ajustes y los ADMIN candidatos (correo enmascarado). */
export function getWeeklyDigestSettings(token: string): Promise<WeeklyDigestSettings> {
  return apiFetch<WeeklyDigestSettings>('/clinic/weekly-digest-settings', { token });
}

/** `PUT /clinic/weekly-digest-settings`: sustituye todo (sin versión: gana el último). Auditado. */
export function updateWeeklyDigestSettings(
  token: string,
  input: WeeklyDigestSettingsInput,
): Promise<WeeklyDigestSettings> {
  return apiFetch<WeeklyDigestSettings>('/clinic/weekly-digest-settings', { method: 'PUT', body: input, token });
}

/**
 * `POST /clinic/weekly-digest/send-test`: la semana anterior completa, ahora y
 * solo a quien la pide. 409 `EMAIL_NOT_VERIFIED`; 429 con una cada 5 minutos.
 */
export function sendWeeklyDigestTest(token: string): Promise<WeeklyDigestTestResult> {
  return apiFetch<WeeklyDigestTestResult>('/clinic/weekly-digest/send-test', { method: 'POST', token });
}
