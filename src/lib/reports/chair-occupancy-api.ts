import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

// «Ocupación por sillón» (DX-481).
type Schemas = components['schemas'];

/** Minutos y conteos de un sillón, de «Sin sillón» o del total; tasas 0–1 (`null` sin base). */
export type ChairOccupancyMetrics = Schemas['ChairOccupancyMetricsDto'];
export type ChairOccupancyRow = Schemas['ChairOccupancyRowDto'];
export type LocationChairOccupancy = Schemas['LocationChairOccupancyDto'];
export type ChairOccupancyReport = Schemas['ChairOccupancyReportDto'];

export interface ChairOccupancyFilters {
  /** Días civiles de la sede, AAAA-MM-DD. */
  from: string;
  to: string;
  locationId?: string;
}

function search(filters: ChairOccupancyFilters): string {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.locationId) params.set('locationId', filters.locationId);
  return `?${params.toString()}`;
}

/** `GET /reports/chair-occupancy`: la sede va en `locationId` (la cabecera X-Location-Id no acota). */
export function getChairOccupancy(token: string, filters: ChairOccupancyFilters): Promise<ChairOccupancyReport> {
  return apiFetch<ChairOccupancyReport>(`/reports/chair-occupancy${search(filters)}`, { token });
}

/** `GET /reports/chair-occupancy.csv` (solo ADMIN): los mismos filtros. */
export function downloadChairOccupancyCsv(token: string, filters: ChairOccupancyFilters): Promise<string> {
  return apiFetchText(`/reports/chair-occupancy.csv${search(filters)}`, { token });
}

/** Períodos del informe: día, semana y mes ENTEROS (las citas futuras ya reservan). */
export type OccupancyPresetKey = 'dia' | 'semana' | 'mes' | 'mes-anterior' | 'personalizado';

export const OCCUPANCY_PRESETS: readonly { key: OccupancyPresetKey; label: string }[] = [
  { key: 'dia', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: 'mes-anterior', label: 'Mes anterior' },
  { key: 'personalizado', label: 'Personalizado' },
];

export function isOccupancyPreset(value: string | null | undefined): value is OccupancyPresetKey {
  return OCCUPANCY_PRESETS.some((p) => p.key === value);
}

function iso(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

/**
 * Las fechas de un atajo a partir de «hoy» (`AAAA-MM-DD` en la zona de la
 * sede): hoy; la semana de lunes a domingo; el mes del 1 al último día; el
 * mes anterior entero. «Personalizado» no tiene.
 */
export function occupancyPeriodFor(key: OccupancyPresetKey, today: string): { from: string; to: string } | null {
  const [y, m, d] = today.split('-').map(Number);
  switch (key) {
    case 'dia':
      return { from: today, to: today };
    case 'semana': {
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const monday = d - ((weekday + 6) % 7);
      return { from: iso(y, m - 1, monday), to: iso(y, m - 1, monday + 6) };
    }
    case 'mes':
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case 'mes-anterior':
      return { from: iso(y, m - 2, 1), to: iso(y, m - 1, 0) };
    case 'personalizado':
      return null;
  }
}

/** ¿`value` es un `AAAA-MM-DD` que existe? */
export function isCivilDate(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return iso(y, m - 1, d) === value;
}

/** ¿La sede tiene algo que enseñar: sillones o citas sin sillón? */
export function locationHasRows(location: LocationChairOccupancy): boolean {
  return location.chairs.length > 0 || location.noChair !== null;
}
