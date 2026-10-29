import { normalizePayerType } from '@/lib/payers/legacy-payer-type';
import type { PayerType } from '@/lib/payers/payers-api';

export const PAYER_TYPE_LABELS: Record<PayerType, string> = {
  INSURER: 'Aseguradora',
  PREPAID_PLAN: 'Plan prepago',
  PUBLIC_SYSTEM: 'Sistema público de salud',
  EMPLOYER: 'Empresa',
  OTHER: 'Otro / interno (cortesía, empleados)',
};

/** Etiqueta del tipo; un código que no se reconoce se pinta tal cual. */
export function payerTypeLabel(type: string): string {
  const normalized = normalizePayerType(type);
  return normalized === null ? type : PAYER_TYPE_LABELS[normalized];
}
