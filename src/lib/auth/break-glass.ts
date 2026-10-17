/**
 * Acceso de soporte (break-glass) de un superadmin a una clínica en la que no
 * es miembro (SEC-008). Los mismos topes que la API (`LoginDto`).
 */
export const BREAK_GLASS_REASON_MIN = 10;
export const BREAK_GLASS_REASON_MAX = 500;

/** Códigos con los que la API pide el paso siguiente del login. */
export const BREAK_GLASS_REQUIRED = 'BREAK_GLASS_REQUIRED';
export const MFA_NOT_ENROLLED = 'MFA_NOT_ENROLLED';

/**
 * Código TOTP tal como lo teclea la persona («123 456», «123-456») → los 6
 * dígitos, o `null` si no son exactamente 6.
 */
export function normalizeTotpCode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}
