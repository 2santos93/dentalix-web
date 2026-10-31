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

/**
 * ¿Ve alguna pestaña de «Reportes»? «Comparar sedes» es de la administración
 * (REPORT_ROLES); «Producción por procedimiento» también la ve el odontólogo,
 * solo la suya (PRODUCTION_REPORT_ROLES, DX-423).
 */
export function canViewReports(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'DENTIST';
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

// «Producción por procedimiento» (DX-423).
export type ProductionByProcedure = components['schemas']['ProductionByProcedureDto'];
export type ProcedureRow = components['schemas']['ProcedureRowDto'];
export type CategoryTotals = components['schemas']['CategoryTotalsDto'];
export type ProductionTotals = components['schemas']['ProductionTotalsDto'];
export type ProductionAmounts = components['schemas']['ProductionAmountsDto'];
export type ProductionItems = components['schemas']['ProductionItemsDto'];
export type ProductionItem = components['schemas']['ProductionItemDto'];

export interface ProductionFilters {
  from: string;
  to: string;
  locationId?: string;
  professionalId?: string;
  category?: string;
}

function productionSearch(filters: ProductionFilters & Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return `?${params.toString()}`;
}

/**
 * `GET /reports/production-by-procedure`: lo realizado en el período en la
 * sede donde se hizo, por categoría y código, por moneda. La cabecera
 * X-Location-Id no acota; la sede va en `locationId`.
 */
export function getProductionByProcedure(token: string, filters: ProductionFilters): Promise<ProductionByProcedure> {
  return apiFetch<ProductionByProcedure>(`/reports/production-by-procedure${productionSearch({ ...filters })}`, { token });
}

/** `GET /reports/production-by-procedure.csv`: los mismos filtros. */
export function downloadProductionByProcedureCsv(token: string, filters: ProductionFilters): Promise<string> {
  return apiFetchText(`/reports/production-by-procedure.csv${productionSearch({ ...filters })}`, { token });
}

/** `GET /reports/production-by-procedure/items`: el detalle de una fila (con pacientes; auditado). */
export function getProductionItems(
  token: string,
  filters: ProductionFilters & { catalogItemId: string; currency: string; page?: number; pageSize?: number },
): Promise<ProductionItems> {
  return apiFetch<ProductionItems>(`/reports/production-by-procedure/items${productionSearch({ ...filters })}`, { token });
}
