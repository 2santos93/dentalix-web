import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// «Enlaces del paciente» (DX-424).
type Schemas = components['schemas'];

export type PatientLinkType = Schemas['PatientLinkType'];
/** Un tipo de enlace: cuentas, tasas en % con 1 decimal (`null` sin envíos o sin señal) y mediana en horas. */
export type PatientLinkMetrics = Schemas['PatientLinkMetricsDto'];
export type LocationPatientLinks = Schemas['LocationPatientLinksDto'];
export type PatientLinksReport = Schemas['PatientLinksReportDto'];

export interface PatientLinksFilters {
  /** Días civiles de envío en la sede, AAAA-MM-DD. */
  from: string;
  to: string;
  locationId?: string;
}

/** `GET /reports/patient-links`: la sede va en `locationId` (la cabecera X-Location-Id no acota). */
export function getPatientLinks(token: string, filters: PatientLinksFilters): Promise<PatientLinksReport> {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.locationId) params.set('locationId', filters.locationId);
  return apiFetch<PatientLinksReport>(`/reports/patient-links?${params.toString()}`, { token });
}

/** Nombre de cada enlace en la pantalla. */
export const PATIENT_LINK_LABELS: Record<PatientLinkType, string> = {
  ANAMNESIS: 'Anamnesis',
  CONSENT_SIGNATURE: 'Firma de consentimiento',
  BUDGET_SIGNATURE: 'Aceptación de presupuesto',
  APPOINTMENT_CONFIRMATION: 'Confirmación de cita',
  POST_OP_INSTRUCTIONS: 'Indicaciones postoperatorias',
};

/** ¿Hubo algún envío en el informe? */
export function hasSends(report: PatientLinksReport): boolean {
  return report.totals.some((row) => row.sent > 0);
}
