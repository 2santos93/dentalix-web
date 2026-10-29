// Excepción G5.3 (DX-334): tipos de pagador anteriores a DX-326.
import type { PayerType } from './payers-api';

// DX-326 (R3): código antiguo → tipo genérico. Solo sirve para que la web no
// pinte «undefined» si una réplica anterior de la API responde con un código
// antiguo durante el despliegue, o si algo pinta un evento de auditoría viejo.
const LEGACY_PAYER_TYPES: Readonly<
  Record<'MUTUA_ES' | 'PREPAGADA_CO' | 'EPS_CO' | 'EMPRESA' | 'OTRO', PayerType>
> = {
  MUTUA_ES: 'INSURER',
  PREPAGADA_CO: 'PREPAID_PLAN',
  EPS_CO: 'PUBLIC_SYSTEM',
  EMPRESA: 'EMPLOYER',
  OTRO: 'OTHER',
};

const GENERIC_PAYER_TYPES: Readonly<Record<PayerType, PayerType>> = {
  INSURER: 'INSURER',
  PREPAID_PLAN: 'PREPAID_PLAN',
  PUBLIC_SYSTEM: 'PUBLIC_SYSTEM',
  EMPLOYER: 'EMPLOYER',
  OTHER: 'OTHER',
};

/**
 * Código (antiguo o genérico) → tipo genérico; `null` si no se reconoce. Solo
 * lee claves propias: `'constructor'` o `'__proto__'` dan `null`.
 */
export function normalizePayerType(code: string): PayerType | null {
  for (const table of [GENERIC_PAYER_TYPES, LEGACY_PAYER_TYPES] as const) {
    if (!Object.hasOwn(table, code)) continue;
    const type: unknown = table[code as keyof typeof table];
    if (typeof type === 'string') return type as PayerType;
  }
  return null;
}
