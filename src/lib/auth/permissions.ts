'use client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import { useMe } from '@/lib/session/session-store';

/**
 * DX-090: permisos extra que un ADMIN concede a un miembro sobre su rol
 * (catálogo cerrado de la API). En una clínica sin recepcionista, la asistente
 * cobra con `PAYMENT_REGISTER`.
 *
 * - `PAYMENT_REGISTER`: registrar abonos y operar su turno de caja, sin anular.
 * - `FINANCIAL_REPORTS_VIEW`: ver los reportes financieros y la caja en lectura.
 */
export type ExtraPermission = components['schemas']['ExtraPermission'];

export const EXTRA_PERMISSIONS: readonly ExtraPermission[] = ['PAYMENT_REGISTER', 'FINANCIAL_REPORTS_VIEW'];

const NONE: readonly ExtraPermission[] = Object.freeze([]);

/**
 * Lo que la sesión puede hacer en términos del catálogo: `effectivePermissions`
 * de `GET /me` (los de serie del rol más los extra). Mientras `/me` carga o si
 * falla, ninguno: el menú y los botones caen al rol, nunca a «todo». Como el
 * rol del token, solo decide qué se PINTA; la API comprueba cada ruta.
 */
export function useEffectivePermissions(): readonly ExtraPermission[] {
  const me = useMe();
  return me.status === 'ready' ? (me.data.effectivePermissions ?? NONE) : NONE;
}

/** ¿Tiene `permission` (por su rol o concedido)? */
export function hasPermission(
  permissions: readonly ExtraPermission[] | undefined,
  permission: ExtraPermission,
): boolean {
  return permissions?.includes(permission) ?? false;
}

/**
 * Registra abonos y opera su caja: los roles de cobro (ADMIN y recepción) o
 * quien tenga `PAYMENT_REGISTER`. `null` (sin sesión legible) = no.
 */
export function canRegisterPayments(
  role: ClinicRole | null,
  permissions: readonly ExtraPermission[] | undefined,
): boolean {
  return role === 'ADMIN' || role === 'RECEPTION' || hasPermission(permissions, 'PAYMENT_REGISTER');
}

/**
 * Anula abonos, cambia su imputación, su factura y los planes de cuotas: SOLO
 * los roles de cobro. `PAYMENT_REGISTER` registra pero no anula (DX-090).
 */
export function canManagePayments(role: ClinicRole | null): boolean {
  return role === 'ADMIN' || role === 'RECEPTION';
}

/** Ve los reportes financieros de la clínica: ADMIN o `FINANCIAL_REPORTS_VIEW`. */
export function canViewFinancialReports(
  role: ClinicRole | null,
  permissions: readonly ExtraPermission[] | undefined,
): boolean {
  return role === 'ADMIN' || hasPermission(permissions, 'FINANCIAL_REPORTS_VIEW');
}
