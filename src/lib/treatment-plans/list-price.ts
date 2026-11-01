import { formatAmount, formatCurrency } from '@/lib/format/currency';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { NO_SEDE_FORMAT, sedeMoney } from '@/lib/format/sede-number';

/**
 * Cómo se pinta un importe: con el código de su moneda, o sin moneda cuando no
 * se sabe cuál es.
 */
export interface ListPriceFormat {
  withCode: (amount: number, currency: string) => string;
  withoutCode: (amount: number) => string;
}

/** El del presupuesto impreso y su PDF (el mismo `formatCurrency` del resto del documento). */
export const PRINTED_LIST_PRICE_FORMAT: ListPriceFormat = {
  withCode: formatCurrency,
  withoutCode: formatAmount,
};

/** El de las pantallas del plan: el formato de la sede (DX-386), o «—» mientras no lo hay. */
export function sedeListPriceFormat(fmt: RegionalFormat | null): ListPriceFormat {
  return {
    withCode: (amount, currency) => sedeMoney(amount, currency, fmt),
    withoutCode: (amount) => (fmt ? fmt.number(amount, { min: 2, max: 2 }) : NO_SEDE_FORMAT),
  };
}

/**
 * DX-489: el precio de lista es el `defaultPrice` del catálogo, que es de toda
 * la clínica y no lleva moneda: su moneda es la común de las sedes activas
 * (`clinicBaseCurrency`, la misma con que lo pinta Ajustes › Catálogo). Se
 * pinta con ESA moneda, nunca con la del plan; si no se sabe (sedes en monedas
 * distintas o sin moneda), la cifra va sin moneda.
 */
export function formatListPrice(
  value: number,
  catalogCurrency: string | null,
  format: ListPriceFormat,
): string {
  return catalogCurrency ? format.withCode(value, catalogCurrency) : format.withoutCode(value);
}

/**
 * ¿El precio de lista está en la moneda del plan? Solo entonces se puede
 * restar de los importes del plan (el «Ahorro por convenio»); en otra moneda,
 * o sin saberla, esa resta mezclaría monedas.
 */
export function listPriceInPlanCurrency(catalogCurrency: string | null, planCurrency: string): boolean {
  return catalogCurrency !== null && catalogCurrency === planCurrency;
}
