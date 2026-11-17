import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import { hasPermission, type ExtraPermission } from '@/lib/auth/permissions';

// «Producción agendada y previsión del mes» (DX-567).
type Schemas = components['schemas'];

/**
 * Lo agendado del período y la previsión del mes en curso. Importes en la
 * moneda del catálogo (`currency`; null sin ella, y entonces todos los importes
 * son null aunque los recuentos sigan).
 */
export type ScheduledProductionReport = Schemas['ScheduledProductionReportDto'];
export type ScheduledProductionDay = Schemas['ScheduledProductionDayDto'];
export type ScheduledProductionProfessional = Schemas['ScheduledProductionProfessionalDto'];
export type ScheduledProductionDayProfessional = Schemas['ScheduledProductionDayProfessionalDto'];
export type ScheduledProductionForecast = Schemas['ScheduledProductionForecastDto'];
export type ScheduledProductionDefinition = Schemas['ScheduledProductionDefinitionDto'];
export type ScheduledProductionWarning = ScheduledProductionReport['warnings'][number];
export type ScheduledProductionUnlinked = Schemas['ScheduledProductionUnlinkedDto'];
export type UnlinkedAppointment = Schemas['UnlinkedAppointmentDto'];

export interface ScheduledProductionFilters {
  /** Días civiles del inicio de cada cita en la zona de su sede, AAAA-MM-DD. */
  from: string;
  to: string;
  locationId?: string;
  /** El profesional de la cita (`providerId`). */
  providerId?: string;
}

/** Como `SCHEDULED_PRODUCTION_MAX_DAYS` en la API. */
export const SCHEDULED_PRODUCTION_MAX_DAYS = 62;

function params(filters: ScheduledProductionFilters): URLSearchParams {
  const p = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.locationId) p.set('locationId', filters.locationId);
  if (filters.providerId) p.set('providerId', filters.providerId);
  return p;
}

/** `GET /reports/scheduled-production`: la sede va en `locationId` (la cabecera X-Location-Id no acota). */
export function getScheduledProduction(
  token: string,
  filters: ScheduledProductionFilters,
): Promise<ScheduledProductionReport> {
  return apiFetch<ScheduledProductionReport>(`/reports/scheduled-production?${params(filters).toString()}`, { token });
}

/**
 * `GET /reports/scheduled-production/unlinked`: las citas que cuentan sin
 * tratamiento ligado, por inicio. Lleva nombres de paciente: la API lo audita.
 */
export function getScheduledProductionUnlinked(
  token: string,
  filters: ScheduledProductionFilters,
  page: number,
  pageSize: number,
): Promise<ScheduledProductionUnlinked> {
  const p = params(filters);
  p.set('page', String(page));
  p.set('pageSize', String(pageSize));
  return apiFetch<ScheduledProductionUnlinked>(`/reports/scheduled-production/unlinked?${p.toString()}`, { token });
}

/**
 * ¿Ve lo agendado? ADMIN, DENTIST (solo lo suyo) o quien tenga
 * `FINANCIAL_REPORTS_VIEW` (`SCHEDULED_PRODUCTION_REPORT_ROLES` de la API).
 * RECEPTION y ASSISTANT sin el permiso, no (ni se pide el endpoint).
 */
export function canSeeScheduledProduction(
  role: ClinicRole | null,
  permissions: readonly ExtraPermission[] | undefined,
): boolean {
  return role === 'ADMIN' || role === 'DENTIST' || hasPermission(permissions, 'FINANCIAL_REPORTS_VIEW');
}

/** El DENTIST sin el permiso solo ve lo suyo (scope OWN): no manda otro `providerId`. */
export function scheduledProductionOwnByRole(
  role: ClinicRole | null,
  permissions: readonly ExtraPermission[] | undefined,
): boolean {
  return role === 'DENTIST' && !hasPermission(permissions, 'FINANCIAL_REPORTS_VIEW');
}

/** Períodos rápidos de la pestaña: lo agendado mira hacia delante. */
export type ScheduledPresetKey = 'this_month' | 'next_7_days' | 'next_30_days' | 'next_month' | 'custom';

export const SCHEDULED_PRESETS: readonly { key: ScheduledPresetKey; label: string }[] = [
  { key: 'this_month', label: 'Este mes' },
  { key: 'next_7_days', label: 'Próximos 7 días' },
  { key: 'next_30_days', label: 'Próximos 30 días' },
  { key: 'next_month', label: 'Mes siguiente' },
  { key: 'custom', label: 'Personalizado' },
];

export function isScheduledPreset(value: string | null | undefined): value is ScheduledPresetKey {
  return SCHEDULED_PRESETS.some((p) => p.key === value);
}

function iso(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

/**
 * Las fechas de un atajo a partir de «hoy» (AAAA-MM-DD de la sede). «Este
 * mes» es el mes entero (lo agendado sigue hasta fin de mes); «Próximos N
 * días» empieza hoy. «Personalizado» no tiene: las elige quien consulta.
 */
export function scheduledPeriodFor(key: ScheduledPresetKey, today: string): { from: string; to: string } | null {
  const [y, m, d] = today.split('-').map(Number);
  switch (key) {
    case 'this_month':
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case 'next_7_days':
      return { from: today, to: iso(y, m - 1, d + 6) };
    case 'next_30_days':
      return { from: today, to: iso(y, m - 1, d + 29) };
    case 'next_month':
      return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
    case 'custom':
      return null;
  }
}

/** ¿«Desde» ≤ «Hasta» y caben como mucho 62 días (ambos incluidos)? */
export function isValidScheduledPeriod({ from, to }: { from: string; to: string }): boolean {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  return days >= 1 && days <= SCHEDULED_PRODUCTION_MAX_DAYS;
}

/** El enlace que abre una cita en la agenda (DX-567: `?cita=`). */
export const APPOINTMENT_PARAM = 'cita';
export function appointmentHref(appointmentId: string): string {
  return `/agenda?${APPOINTMENT_PARAM}=${encodeURIComponent(appointmentId)}`;
}

/** La pestaña «Previsión» de Reportes con un rango (desde la tira de la agenda). */
export function forecastReportHref(range: { from: string; to: string }, providerId?: string): string {
  const p = new URLSearchParams({ tab: 'prevision', periodo: 'custom', desde: range.from, hasta: range.to });
  if (providerId) p.set('profesional', providerId);
  return `/reportes?${p.toString()}`;
}
