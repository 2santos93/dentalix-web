import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// «Captación» (DX-172): pacientes nuevos y lo cobrado por «¿Cómo nos conoció?».
type Schemas = components['schemas'];

export type AcquisitionReport = Schemas['AcquisitionReportDto'];
export type AcquisitionRow = Schemas['AcquisitionRowDto'];
export type AcquisitionAmount = Schemas['AcquisitionAmountDto'];
export type AcquisitionTopReferrer = Schemas['AcquisitionReferrerDto'];

export interface AcquisitionFilters {
  /** Días civiles AAAA-MM-DD (de la sede de captación del paciente o de la del abono). */
  from: string;
  to: string;
  locationId?: string;
}

function params(filters: AcquisitionFilters): string {
  const p = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.locationId) p.set('locationId', filters.locationId);
  return p.toString();
}

/** `GET /reports/acquisition`: ADMIN o FINANCIAL_REPORTS_VIEW; la sede va en `locationId`. */
export function getAcquisitionReport(token: string, filters: AcquisitionFilters): Promise<AcquisitionReport> {
  return apiFetch<AcquisitionReport>(`/reports/acquisition?${params(filters)}`, { token });
}

/** `GET /reports/acquisition.csv` (solo ADMIN): los mismos filtros, sin datos de pacientes. */
export function downloadAcquisitionCsv(token: string, filters: AcquisitionFilters): Promise<string> {
  return apiFetchText(`/reports/acquisition.csv?${params(filters)}`, { token });
}

/** Lo cobrado de una fila en la moneda `currency` (0 si no cobró nada en ella). */
export function collectedIn(amounts: readonly AcquisitionAmount[], currency: string): number {
  return amounts.find((a) => a.currency === currency)?.amount ?? 0;
}
