import { normalizePayerType } from './legacy-payer-type';
import type { PayerType } from './payers-api';

// DX-326: tipos de pagador genéricos, sin país. Cualquier clínica usa
// cualquiera, con cualquier sede.
export const PAYER_TYPES: readonly PayerType[] = [
  'INSURER',
  'PREPAID_PLAN',
  'PUBLIC_SYSTEM',
  'EMPLOYER',
  'OTHER',
];

/** SEC-047/SEC-049: externo = lo respalda alguien de fuera; OTHER es interno. */
const EXTERNAL: Readonly<Record<PayerType, boolean>> = {
  INSURER: true,
  PREPAID_PLAN: true,
  PUBLIC_SYSTEM: true,
  EMPLOYER: true,
  OTHER: false,
};

/**
 * ¿Lo respalda alguien de fuera (pide nº de afiliado y cobertura vigente para
 * sus convenios)? `OTHER` (cortesía, empleados) no. Un código desconocido
 * cuenta como externo: en la web solo endurece el formulario, y la API decide.
 */
export function isExternalPayer(type: string): boolean {
  const normalized = normalizePayerType(type);
  if (normalized === null || !Object.hasOwn(EXTERNAL, normalized)) return true;
  const external: unknown = EXTERNAL[normalized];
  return typeof external === 'boolean' ? external : true;
}
