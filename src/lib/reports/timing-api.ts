import { apiFetch, apiFetchText } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { RegionalFormat } from '@/lib/format/regional-format';

// «Tiempos» (DX-275): espera en sala, retraso de inicio, duración real frente a
// la programada y ocupación por profesional, en la zona horaria de cada sede.
type Schemas = components['schemas'];

export type TimingReport = Schemas['TimingReportDto'];
export type TimingFigures = Schemas['TimingFiguresDto'];
export type TimingProfessionalRow = Schemas['TimingProfessionalRowDto'];
export type TimingTypeRow = Schemas['TimingTypeRowDto'];
export type TimingWeekRow = Schemas['TimingWeekRowDto'];
export type TimingOccupancyRow = Schemas['TimingOccupancyRowDto'];
export type TimingOccupancyWeek = Schemas['TimingOccupancyWeekDto'];
export type TimingOccupancyFigures = Schemas['TimingOccupancyFiguresDto'];
export type TimingDefinition = Schemas['TimingDefinitionDto'];
export type TimingDefinitionKey = TimingDefinition['key'];

/** Como `TIMING_MAX_MONTHS` en la API: 12 meses por calendario. */
export const TIMING_MAX_PERIOD_MONTHS = 12;

export interface TimingFilters {
  /** Días civiles AAAA-MM-DD (de la sede de cada cita). */
  from: string;
  to: string;
  locationId?: string;
  providerId?: string;
}

function params(filters: TimingFilters): string {
  const p = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.locationId) p.set('locationId', filters.locationId);
  if (filters.providerId) p.set('providerId', filters.providerId);
  return p.toString();
}

/** `GET /reports/timing`: ADMIN (toda la clínica) y DENTIST (lo suyo). */
export function getTimingReport(token: string, filters: TimingFilters): Promise<TimingReport> {
  return apiFetch<TimingReport>(`/reports/timing?${params(filters)}`, { token });
}

/** `GET /reports/timing.csv`: los mismos roles; la API registra la exportación. */
export function downloadTimingCsv(token: string, filters: TimingFilters): Promise<string> {
  return apiFetchText(`/reports/timing.csv?${params(filters)}`, { token });
}

/** Lo que se pinta sin dato (`null`: ninguna cita medida en esa fila). */
export const NO_VALUE = '—';

/** Minutos con 1 decimal de la API → «9,4 min»; `null` → «—». Puede ser negativo (retraso de inicio). */
export function formatMinutes(value: number | null, fmt: RegionalFormat): string {
  if (value === null) return NO_VALUE;
  return `${fmt.number(value, { min: 0, max: 1 })} min`;
}

/** Minutos enteros de la ocupación → horas con 1 decimal: 1410 → «23,5 h». */
export function formatHours(minutes: number, fmt: RegionalFormat): string {
  return `${fmt.number(minutes / 60, { min: 0, max: 1 })} h`;
}

/** Porcentaje con signo (real frente a programada): 39.8 → «+39,8 %», −5 → «−5 %», 0 → «0 %». */
export function formatSignedPercent(value: number | null, fmt: RegionalFormat): string {
  if (value === null) return NO_VALUE;
  const text = fmt.percent(Math.abs(value), 1);
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

/** Ocupación (puede pasar de 100 %); `null` = el profesional no tiene horario. */
export function formatOccupancy(value: number | null, fmt: RegionalFormat): string {
  return value === null ? NO_VALUE : fmt.percent(value, 1);
}

/** Las citas que el informe no mide (sin alguna hora + incoherentes). */
export function excludedCount(figures: Pick<TimingFigures, 'withoutTimes' | 'incoherent'>): number {
  return figures.withoutTimes + figures.incoherent;
}

/** «1 cita sin tiempos» / «3 citas sin tiempos». */
export function withoutTimesText(n: number, fmt: RegionalFormat): string {
  return n === 1 ? '1 cita sin tiempos' : `${fmt.number(n)} citas sin tiempos`;
}

/** «1 con tiempos incoherentes» / «2 con tiempos incoherentes». */
export function incoherentText(n: number, fmt: RegionalFormat): string {
  return `${fmt.number(n)} con tiempos incoherentes`;
}

/** La semana recortada al período: «02/03/2026 – 08/03/2026» (un solo día, una fecha). */
export function weekLabel(week: { from: string; to: string }, fmt: RegionalFormat): string {
  return week.from === week.to ? fmt.civilDate(week.from) : `${fmt.civilDate(week.from)} – ${fmt.civilDate(week.to)}`;
}

/** La definición de `key` (las 15 llegan siempre; `undefined` solo con una API más antigua). */
export function definitionOf(
  definitions: readonly TimingDefinition[],
  key: TimingDefinitionKey,
): TimingDefinition | undefined {
  return definitions.find((d) => d.key === key);
}
