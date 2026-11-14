import type { components } from '@/lib/api/schema';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT, sedeCivilDate } from '@/lib/format/sede-number';
import { canManageExchangeRates } from '@/lib/exchange/exchange-settings-api';
import type { ClinicRole } from '@/lib/me/me-api';

/** DX-513-bis: la tasa congelada con que se convirtió la referencia de un ítem. */
export type ReferenceRate = components['schemas']['ReferenceRateDto'];

const SOURCE_LABELS: Record<ReferenceRate['source'], string> = {
  AUTOMATIC: 'automática',
  MANUAL: 'manual',
};

/**
 * «tasa 1 USD = 880 VES del 07/11/2026, manual»: la tasa del par (moneda de la
 * referencia y del plan), sacada de las dos congeladas por unidad de la base,
 * con la moneda más fuerte a la izquierda para que la cifra sea ≥ 1. Así no
 * hace falta saber cuál es la base (la de la API).
 */
export function referenceRateText(
  rate: ReferenceRate,
  referenceCurrency: string,
  planCurrency: string,
  fmt: RegionalFormat | null,
): string {
  // Unidades de la moneda del plan por 1 de la referencia.
  const planPerReference = rate.toPerBase / rate.fromPerBase;
  const [strong, weak, value] =
    planPerReference >= 1
      ? [referenceCurrency, planCurrency, planPerReference]
      : [planCurrency, referenceCurrency, 1 / planPerReference];
  const amount = fmt ? fmt.number(value, { min: 0, max: 4 }) : NO_SEDE_FORMAT;
  return `tasa 1 ${strong} = ${amount} ${weak} del ${sedeCivilDate(rate.rateDate, fmt)}, ${SOURCE_LABELS[rate.source]}`;
}

/**
 * Sin tasa de hoy: qué falta y qué hacer según quién lo lee (L7). Solo quien
 * gestiona las tasas (`canManageExchangeRates`, ADMIN) puede registrarla; al
 * resto se le pide que avise a un administrador. Sin fecha ISO: «hoy».
 */
export function referenceRateMissingText(currency: string, planCurrency: string, role: ClinicRole | null): string {
  const action = canManageExchangeRates(role)
    ? `regístrala en Ajustes › Tasa de cambio o usa una lista de precios en ${planCurrency}.`
    : `pide a un administrador que registre la tasa del día o una lista de precios en ${planCurrency}.`;
  return `No hay tasa de ${currency} para hoy: ${action}`;
}
