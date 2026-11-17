import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/api-error';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

/**
 * DX-091: cierre contable. Con él, la API no deja registrar ni anular abonos
 * con fecha de un día cerrado, ni crear o cancelar planes de cuotas con cuotas
 * en días cerrados (409 `PERIOD_LOCKED`). Rige el más restrictivo de la fecha
 * fija y de los días abiertos, en el día civil de la sede. Con la exención, el
 * ADMIN lo hace indicando un motivo, que queda registrado.
 */
export type FinancialLockSettings = components['schemas']['FinancialLockSettingsDto'];
export type FinancialLockOverride = components['schemas']['FinancialLockOverrideDto'];
export type FinancialLockOperation = FinancialLockOverride['operation'];
export type PeriodLock = components['schemas']['PeriodLockDto'];
export type UpdateFinancialLockInput = components['schemas']['UpdateFinancialLockDto'];

/** Los mismos topes que la API. */
export const FINANCIAL_LOCK_DAYS_MAX = 365;
export const LOCK_OVERRIDE_REASON_MIN = 3;
export const LOCK_OVERRIDE_REASON_MAX = 300;

/** Solo administración configura el cierre (la API lo exige). */
export function canManageFinancialLock(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** `GET /clinic/settings/financial-lock` (solo ADMIN). */
export function getFinancialLock(token: string): Promise<FinancialLockSettings> {
  return apiFetch<FinancialLockSettings>('/clinic/settings/financial-lock', { token });
}

/** `PATCH /clinic/settings/financial-lock`: ausente no cambia, null quita ese cierre. Auditado. */
export function updateFinancialLock(
  token: string,
  input: UpdateFinancialLockInput,
): Promise<FinancialLockSettings> {
  return apiFetch<FinancialLockSettings>('/clinic/settings/financial-lock', {
    method: 'PATCH',
    body: input,
    token,
  });
}

/** `GET /payments/period-lock`: el cierre vigente en la sede donde se registra. */
export function getPeriodLock(token: string): Promise<PeriodLock> {
  return apiFetch<PeriodLock>('/payments/period-lock', { token });
}

/** ¿Es el 409 `PERIOD_LOCKED` de la API? */
export function isPeriodLockedError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.code === 'PERIOD_LOCKED';
}

/** ¿Está cerrado el día civil `day` (YYYY-MM-DD) con el cierre `lockedThrough`? */
export function isDayLocked(day: string, lockedThrough: string | null | undefined): boolean {
  return Boolean(lockedThrough) && day !== '' && day <= (lockedThrough as string);
}
