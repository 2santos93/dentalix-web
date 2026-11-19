import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// «Profesionales», «Inasistencias» y «Cartera» de Reportes (DX-304). Las
// formas salen del Swagger de la API.
export type ProfessionalProductivity = components['schemas']['ProfessionalProductivityDto'];
export type ProductivityRow = components['schemas']['ProductivityRowDto'];
export type ProductivityFigures = components['schemas']['ProductivityFiguresDto'];
export type NoShowsReport = components['schemas']['NoShowsReportDto'];
export type MissedAppointment = components['schemas']['MissedAppointmentDto'];
export type ReceivablesSummary = components['schemas']['ReceivablesAgingSummaryDto'];

/** Filtros comunes de «Profesionales» e «Inasistencias». */
export interface ProfessionalReportFilters {
  from: string;
  to: string;
  locationId?: string;
  professionalId?: string;
}

function searchOf(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** `GET /reports/professional-productivity`. La sede va en `locationId` (X-Location-Id no acota). */
export function getProfessionalProductivity(
  token: string,
  filters: ProfessionalReportFilters,
): Promise<ProfessionalProductivity> {
  return apiFetch<ProfessionalProductivity>(`/reports/professional-productivity${searchOf({ ...filters })}`, { token });
}

/** `GET /reports/professional-productivity.csv`: los mismos filtros. */
export function downloadProfessionalProductivityCsv(token: string, filters: ProfessionalReportFilters): Promise<string> {
  return apiFetchText(`/reports/professional-productivity.csv${searchOf({ ...filters })}`, { token });
}

/** `GET /reports/no-shows`: el % y una página de citas (con pacientes; la API lo audita). */
export function getNoShows(
  token: string,
  filters: ProfessionalReportFilters,
  page: number,
  pageSize: number,
): Promise<NoShowsReport> {
  return apiFetch<NoShowsReport>(`/reports/no-shows${searchOf({ ...filters, page, pageSize })}`, { token });
}

/** `GET /reports/no-shows.csv`: el resumen y todas las citas. Solo ADMIN (auditado). */
export function downloadNoShowsCsv(token: string, filters: ProfessionalReportFilters): Promise<string> {
  return apiFetchText(`/reports/no-shows.csv${searchOf({ ...filters })}`, { token });
}

/**
 * `GET /receivables/aging/summary` (DX-145): los totales por moneda y tramo,
 * sin pacientes. Como la pantalla de la cartera, acota la sede activa
 * (`X-Location-Id`); sin ninguna, toda la clínica.
 */
export function getReceivablesAgingSummary(token: string): Promise<ReceivablesSummary> {
  return apiFetch<ReceivablesSummary>('/receivables/aging/summary', { token });
}

/** `GET /receivables/aging/summary.csv`: los mismos totales en CSV. Solo ADMIN (auditado). */
export function downloadReceivablesAgingSummaryCsv(token: string): Promise<string> {
  return apiFetchText('/receivables/aging/summary.csv', { token });
}

/** La pantalla de la cartera con los pacientes. */
export const RECEIVABLES_HREF = '/caja/cartera';
