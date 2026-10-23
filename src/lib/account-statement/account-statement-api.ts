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
/** DX-262: línea «Saldo migrado» (deuda traída del programa anterior). */
export type AccountStatementOpeningBalance = components['schemas']['AccountStatementOpeningBalanceDto'];
export type FamilyAccountStatement = components['schemas']['FamilyAccountStatementDto'];
export type FamilyStatementMember = components['schemas']['FamilyStatementMemberDto'];
export type FamilyCurrencyAmounts = components['schemas']['FamilyCurrencyAmountsDto'];

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

/**
 * `GET /patients/:id/family-account-statement` (DX-203): el del pagador y el
 * de cada paciente del que es pagador principal, con el total. Solo importes
 * y nombres. Mismos roles que el individual.
 */
export async function getFamilyAccountStatement(
  token: string,
  patientId: string,
): Promise<FamilyAccountStatement> {
  return apiFetch<FamilyAccountStatement>(
    `/patients/${encodeURIComponent(patientId)}/family-account-statement`,
    { token },
  );
}

/** Vista imprimible del estado de cuenta familiar. */
export function familyAccountStatementPrintHref(patientId: string): string {
  return `/print/patients/${encodeURIComponent(patientId)}/family-account-statement`;
}
