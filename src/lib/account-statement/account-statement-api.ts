import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// El backend documenta la respuesta entera con @ApiProperty (AccountStatementDto),
// así que el tipo sale tal cual del contrato generado.
export type AccountStatement = components['schemas']['AccountStatementDto'];
export type AccountStatementSummary = components['schemas']['AccountStatementCurrencySummaryDto'];
export type AccountStatementPlan = components['schemas']['AccountStatementPlanDto'];
export type AccountStatementMovement = components['schemas']['AccountStatementMovementDto'];
export type AccountStatementInstallment = components['schemas']['AccountStatementInstallmentDto'];

/**
 * Quién ve el estado de cuenta: los mismos roles que la API deja leer pagos
 * (PAYMENT_ROLES). Solo decide qué se PINTA (la pestaña y la vista imprimible);
 * el endpoint vuelve a comprobarlo.
 */
export const ACCOUNT_STATEMENT_ROLES: readonly ClinicRole[] = ['ADMIN', 'RECEPTION'];

/** `null` (sin sesión de clínica legible) cuenta como "sin permiso". */
export function canReadAccountStatement(role: ClinicRole | null): boolean {
  return role !== null && ACCOUNT_STATEMENT_ROLES.includes(role);
}

export interface AccountStatementRange {
  /** Primer día de los movimientos (YYYY-MM-DD), inclusive. */
  from?: string;
  /** Último día de los movimientos (YYYY-MM-DD), inclusive. */
  to?: string;
}

/**
 * `GET /patients/:patientId/account-statement` — el estado de cuenta del
 * paciente (ADMIN y recepción; 403 para el resto, 404 si no es de la clínica).
 * El rango solo acota los movimientos: los totales son siempre los de toda la
 * historia.
 */
export async function getAccountStatement(
  token: string,
  patientId: string,
  range: AccountStatementRange = {},
): Promise<AccountStatement> {
  const search = new URLSearchParams();
  if (range.from) search.set('from', range.from);
  if (range.to) search.set('to', range.to);
  const query = search.toString();
  return apiFetch<AccountStatement>(
    `/patients/${encodeURIComponent(patientId)}/account-statement${query ? `?${query}` : ''}`,
    { token },
  );
}

/** Ruta de la vista imprimible (fuera del shell: sin menús ni botones de la app). */
export function accountStatementPrintHref(patientId: string): string {
  return `/print/patients/${encodeURIComponent(patientId)}/account-statement`;
}
