import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// Reportes (DX-014). Las formas salen del Swagger de la API.
export type LocationsComparison = components['schemas']['LocationsComparisonDto'];
export type ComparisonRow = components['schemas']['ComparisonRowDto'];
export type ComparisonMetrics = components['schemas']['ComparisonMetricsDto'];
export type Metric = components['schemas']['MetricDto'];
export type CurrencyMetric = components['schemas']['CurrencyMetricDto'];
export type KpiDefinition = components['schemas']['KpiDefinitionDto'];
export type KpiKey = keyof ComparisonMetrics;
export type CompareMode = LocationsComparison['compare'];

/** Los reportes son de la administración: REPORT_ROLES en la API. */
export function canViewReports(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

export interface LocationsComparisonFilters {
  from: string;
  to: string;
  compare: CompareMode;
}

function searchOf(filters: LocationsComparisonFilters): string {
  return `?${new URLSearchParams({ from: filters.from, to: filters.to, compare: filters.compare }).toString()}`;
}

/**
 * `GET /reports/locations-comparison`. La sede activa viaja en `X-Location-Id`
 * como en todo el cliente, pero no acota: salen todas las sedes del usuario.
 */
export function getLocationsComparison(
  token: string,
  filters: LocationsComparisonFilters,
): Promise<LocationsComparison> {
  return apiFetch<LocationsComparison>(`/reports/locations-comparison${searchOf(filters)}`, { token });
}

/** `GET /reports/locations-comparison.csv`: los mismos filtros. */
export function downloadLocationsComparisonCsv(token: string, filters: LocationsComparisonFilters): Promise<string> {
  return apiFetchText(`/reports/locations-comparison.csv${searchOf(filters)}`, { token });
}
