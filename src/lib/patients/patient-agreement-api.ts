import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// DX-105: convenio asignado al paciente y precio resuelto de una prestación.
export type PatientAgreement = components['schemas']['PatientAgreementDto'];
export type PatientAgreementResponse = components['schemas']['PatientAgreementResponseDto'];
export type AssignPatientAgreementInput = components['schemas']['AssignPatientAgreementDto'];
export type PriceQuote = components['schemas']['PriceQuoteDto'];
export type PriceSource = PriceQuote['source'];

const base = (patientId: string) => `/patients/${encodeURIComponent(patientId)}`;

/**
 * `GET /patients/:id/agreement`: el convenio vigente y, con `includeHistory`,
 * los retirados.
 */
export function getPatientAgreement(
  token: string,
  patientId: string,
  params: { includeHistory?: boolean } = {},
): Promise<PatientAgreementResponse> {
  const query = params.includeHistory ? '?includeHistory=true' : '';
  return apiFetch<PatientAgreementResponse>(`${base(patientId)}/agreement${query}`, { token });
}

/** `PUT`: asigna un convenio y sustituye el anterior (queda en el historial). */
export function assignPatientAgreement(
  token: string,
  patientId: string,
  input: AssignPatientAgreementInput,
): Promise<PatientAgreement> {
  return apiFetch<PatientAgreement>(`${base(patientId)}/agreement`, {
    method: 'PUT',
    body: input,
    token,
  });
}

/** Quita el convenio del paciente (204 sin cuerpo). */
export async function removePatientAgreement(token: string, patientId: string): Promise<void> {
  await apiFetchOrNull<null>(`${base(patientId)}/agreement`, { method: 'DELETE', token });
}

/**
 * `GET /patients/:id/price-quote`: el precio de referencia de una prestación
 * para este paciente, con su origen.
 */
export function getPriceQuote(
  token: string,
  patientId: string,
  params: { catalogItemId: string; currency: string },
): Promise<PriceQuote> {
  const search = new URLSearchParams({
    catalogItemId: params.catalogItemId,
    currency: params.currency,
  });
  return apiFetch<PriceQuote>(`${base(patientId)}/price-quote?${search.toString()}`, { token });
}
