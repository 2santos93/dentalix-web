import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// «Rentabilidad por sede» (DX-410).
type Schemas = components['schemas'];

export type ProfitabilityReport = Schemas['ProfitabilityReportDto'];
export type ProfitabilityDefinition = Schemas['ProfitabilityDefinitionDto'];
/** Una sede o el total del grupo (`locationId: null`): una entrada por moneda, nunca sumadas. */
export type ProfitabilityRow = Schemas['ProfitabilityRowDto'];
export type ProfitabilityCurrency = Schemas['ProfitabilityCurrencyDto'];
export type ProfitabilityLines = Schemas['ProfitabilityLinesDto'];
export type ProfitabilityLine = Schemas['ProfitabilityLineDto'];
export type ProfitabilityBasis = ProfitabilityReport['basis'];
export type ProfitabilitySide = ProfitabilityLines['side'];

export interface ProfitabilityFilters {
  /** Días civiles de la sede, AAAA-MM-DD. */
  from: string;
  to: string;
  basis: ProfitabilityBasis;
  locationId?: string;
}

/** Una cifra del informe: qué filas la forman. Sin `locationId`, el total del grupo (las sedes del informe). */
export interface ProfitabilityFigure {
  side: ProfitabilitySide;
  currency: string;
  locationId?: string;
  /** Solo gastos: una categoría. */
  category?: string;
}

function params(filters: ProfitabilityFilters): URLSearchParams {
  const p = new URLSearchParams({ from: filters.from, to: filters.to, basis: filters.basis });
  if (filters.locationId) p.set('locationId', filters.locationId);
  return p;
}

/** `GET /reports/profitability`: la sede va en `locationId` (la cabecera X-Location-Id no acota). */
export function getProfitability(token: string, filters: ProfitabilityFilters): Promise<ProfitabilityReport> {
  return apiFetch<ProfitabilityReport>(`/reports/profitability?${params(filters).toString()}`, { token });
}

/** `GET /reports/profitability.csv`: los mismos filtros y la misma definición. */
export function downloadProfitabilityCsv(token: string, filters: ProfitabilityFilters): Promise<string> {
  return apiFetchText(`/reports/profitability.csv?${params(filters).toString()}`, { token });
}

/** `GET /reports/profitability/lines`: las filas de una cifra, paginadas. */
export function getProfitabilityLines(
  token: string,
  filters: ProfitabilityFilters,
  figure: ProfitabilityFigure,
  page: number,
  pageSize: number,
): Promise<ProfitabilityLines> {
  // El total del grupo (sin sede en la cifra) es el de las sedes del informe: la filtrada, si la hay.
  const p = params({ ...filters, locationId: figure.locationId ?? filters.locationId });
  p.set('side', figure.side);
  p.set('currency', figure.currency);
  if (figure.category !== undefined) p.set('category', figure.category);
  p.set('page', String(page));
  p.set('pageSize', String(pageSize));
  return apiFetch<ProfitabilityLines>(`/reports/profitability/lines?${p.toString()}`, { token });
}

/** `?base=` de la URL ↔ base del informe. */
export const BASIS_PARAM: Record<ProfitabilityBasis, string> = { CASH: 'caja', ACCRUAL: 'devengo' };

export function basisFromParam(value: string | null | undefined): ProfitabilityBasis {
  return value === BASIS_PARAM.ACCRUAL ? 'ACCRUAL' : 'CASH';
}

/** Las monedas del total del grupo (las de todas las sedes), en el orden de la API. */
export function profitabilityCurrencies(report: ProfitabilityReport): string[] {
  return report.total.currencies.map((c) => c.currency);
}

/** La moneda `currency` de una fila, o `null` si no tuvo movimientos en ella. */
export function currencyOf(row: ProfitabilityRow, currency: string): ProfitabilityCurrency | null {
  return row.currencies.find((c) => c.currency === currency) ?? null;
}

/** Las categorías de gasto de una moneda en el grupo, mayor primero (como las da la API). */
export function expenseCategories(report: ProfitabilityReport, currency: string): string[] {
  return currencyOf(report.total, currency)?.categories.map((c) => c.category) ?? [];
}
