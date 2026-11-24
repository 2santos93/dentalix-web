import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// «Retención» (DX-260): activos, nuevos, perdidos y retención por sede y profesional.
type Schemas = components['schemas'];

export type RetentionReport = Schemas['RetentionReportDto'];
export type RetentionRow = Schemas['RetentionRowDto'];
export type RetentionLocationTotal = Schemas['RetentionLocationTotalDto'];
export type RetentionFigures = Schemas['RetentionFiguresDto'];
export type RetentionDefinition = Schemas['RetentionDefinitionDto'];
export type RetentionFigureKey = RetentionDefinition['key'];
export type RetentionSegment = Schemas['RetentionSegment'];
export type RetentionPatient = Schemas['RetentionPatientDto'];
export type RetentionPatients = Schemas['RetentionPatientsReportDto'];
export type RetentionActiveMonths = RetentionReport['filters']['activeMonths'];

/** Como `RETENTION_MAX_MONTHS` en la API: 12 meses por calendario. */
export const RETENTION_MAX_PERIOD_MONTHS = 12;
/** Ventanas de «activo» que admite la API; 18 por defecto. */
export const RETENTION_ACTIVE_MONTHS: readonly RetentionActiveMonths[] = [12, 18, 24];
export const RETENTION_DEFAULT_ACTIVE_MONTHS: RetentionActiveMonths = 18;

export interface RetentionFilters {
  /** Días civiles AAAA-MM-DD (de la sede de cada cita). */
  from: string;
  to: string;
  locationId?: string;
  providerId?: string;
  activeMonths?: RetentionActiveMonths;
}

/** La cifra de cada definición con lista (`retentionRate` no abre ninguna). */
export const SEGMENT_OF: Record<Exclude<RetentionFigureKey, 'retentionRate'>, RetentionSegment> = {
  activeAtStart: 'active_start',
  newPatients: 'new',
  lost: 'lost',
  activeAtEnd: 'active_end',
  reactivated: 'reactivated',
  newNoReturn: 'new_no_return',
};

export function isActiveMonths(value: unknown): value is RetentionActiveMonths {
  return RETENTION_ACTIVE_MONTHS.includes(Number(value) as RetentionActiveMonths);
}

function params(filters: RetentionFilters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.locationId) p.set('locationId', filters.locationId);
  if (filters.providerId) p.set('providerId', filters.providerId);
  if (filters.activeMonths) p.set('activeMonths', String(filters.activeMonths));
  for (const [key, value] of Object.entries(extra)) p.set(key, value);
  return p.toString();
}

/** `GET /reports/retention`: ADMIN o FINANCIAL_REPORTS_VIEW. */
export function getRetentionReport(token: string, filters: RetentionFilters): Promise<RetentionReport> {
  return apiFetch<RetentionReport>(`/reports/retention?${params(filters)}`, { token });
}

/** `GET /reports/retention.csv`: los mismos roles; la API registra la exportación. */
export function downloadRetentionCsv(token: string, filters: RetentionFilters): Promise<string> {
  return apiFetchText(`/reports/retention.csv?${params(filters)}`, { token });
}

/** `GET /reports/retention/patients`: los pacientes que forman una cifra, por páginas. */
export function getRetentionPatients(
  token: string,
  filters: RetentionFilters,
  segment: RetentionSegment,
  page = 1,
  pageSize = 25,
): Promise<RetentionPatients> {
  return apiFetch<RetentionPatients>(
    `/reports/retention/patients?${params(filters, { segment, page: String(page), pageSize: String(pageSize) })}`,
    { token },
  );
}

/** `GET /reports/retention/patients.csv` (solo ADMIN: lleva nombres y teléfonos). */
export function downloadRetentionPatientsCsv(
  token: string,
  filters: RetentionFilters,
  segment: RetentionSegment,
): Promise<string> {
  return apiFetchText(`/reports/retention/patients.csv?${params(filters, { segment })}`, { token });
}
