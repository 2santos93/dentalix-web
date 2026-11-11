import { apiFetch, apiFetchText } from '@/lib/api/client';
import { addMonths, monthLabel } from '@/lib/appointments/calendar-grid';
import type { components } from '@/lib/api/schema';

// «Huecos recuperados» (DX-436).
type Schemas = components['schemas'];

export type RecoveredSlotsOffers = Schemas['RecoveredSlotsOffersDto'];
/**
 * Fracciones 0–1 (`null` sin base); `recoveredValue`, una línea por moneda:
 * nunca se suman entre monedas.
 */
export type RecoveredSlotsMetrics = Schemas['RecoveredSlotsMetricsDto'];
export type RecoveredSlotsProviderRow = Schemas['ProviderRecoveredSlotsDto'];
export type RecoveredSlotsWeekRow = Schemas['WeekRecoveredSlotsDto'];
export type RecoveredSlotsReport = Schemas['RecoveredSlotsReportDto'];

export interface RecoveredSlotsFilters {
  /** Días civiles de la sede, AAAA-MM-DD. */
  from: string;
  to: string;
  locationId?: string;
  providerId?: string;
}

function search(filters: RecoveredSlotsFilters): string {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.locationId) params.set('locationId', filters.locationId);
  if (filters.providerId) params.set('providerId', filters.providerId);
  return `?${params.toString()}`;
}

/** `GET /reports/recovered-slots`: la sede va en `locationId` (la cabecera X-Location-Id no acota). */
export function getRecoveredSlots(token: string, filters: RecoveredSlotsFilters): Promise<RecoveredSlotsReport> {
  return apiFetch<RecoveredSlotsReport>(`/reports/recovered-slots${search(filters)}`, { token });
}

/** `GET /reports/recovered-slots.csv` (solo ADMIN): los mismos filtros. */
export function downloadRecoveredSlotsCsv(token: string, filters: RecoveredSlotsFilters): Promise<string> {
  return apiFetchText(`/reports/recovered-slots.csv${search(filters)}`, { token });
}

/** Cuántos meses hacia atrás ofrece el selector de mes (el actual incluido). */
export const RECOVERED_SLOTS_MONTHS = 24;

/** `AAAA-MM` del día civil `today`. */
export function monthOf(today: string): string {
  return today.slice(0, 7);
}

/** ¿`value` es un `AAAA-MM` válido? */
export function isMonth(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/**
 * El mes `AAAA-MM` como período civil: del día 1 al último del mes, también en
 * el mes en curso (un hueco liberado puede ser de una cita de la semana que viene).
 */
export function monthPeriod(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** Los meses del selector, del actual hacia atrás: `{ value: 'AAAA-MM', label: 'noviembre de 2026' }`. */
export function monthOptions(today: string, count = RECOVERED_SLOTS_MONTHS): { value: string; label: string }[] {
  const first = `${monthOf(today)}-01`;
  return Array.from({ length: count }, (_, i) => {
    const day = addMonths(first, -i);
    return { value: monthOf(day), label: monthLabel(day) };
  });
}

/** Minutos como duración: «45 min», «1 h 05 min», «2 h». */
export function formatDurationMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}
