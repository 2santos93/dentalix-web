import { formatCurrency } from '@/lib/format/currency';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeMoney } from '@/lib/format/sede-number';

/** Cómo se pinta un importe con el código de su moneda. */
export type ListPriceFormat = (amount: number, currency: string) => string;

/** El del presupuesto impreso y su PDF (el mismo `formatCurrency` del resto del documento). */
export const PRINTED_LIST_PRICE_FORMAT: ListPriceFormat = formatCurrency;

/** El de las pantallas del plan: el formato de la sede (DX-386), o «—» mientras no lo hay. */
export function sedeListPriceFormat(fmt: RegionalFormat | null): ListPriceFormat {
  return (amount, currency) => sedeMoney(amount, currency, fmt);
}

/**
 * DX-489: el precio de lista es el `defaultPrice` del catálogo, que es de toda
 * la clínica: su moneda es la común de las sedes activas. DX-502: la API la
 * congela en cada ítem al darlo de alta (`catalogCurrency` del ítem,
 * `listPriceCurrency` del presupuesto) y es la que llega aquí. Se pinta con
 * ESA moneda, nunca con la del plan. Si no se sabe (sedes en monedas
 * distintas o sin moneda), no hay cifra (`null`): quien la pinta la oculta y
 * pone la nota (`listPriceHiddenNote`).
 */
export function formatListPrice(
  value: number,
  catalogCurrency: string | null,
  format: ListPriceFormat,
): string | null {
  return catalogCurrency ? format(value, catalogCurrency) : null;
}

/**
 * ¿El precio de lista está en la moneda del plan? Solo entonces se puede
 * restar de los importes del plan (el «Ahorro por convenio»); en otra moneda,
 * o sin saberla, esa resta mezclaría monedas.
 */
export function listPriceInPlanCurrency(catalogCurrency: string | null, planCurrency: string): boolean {
  return catalogCurrency !== null && catalogCurrency === planCurrency;
}

/**
 * DX-502: la moneda común de varios precios de lista (cada ítem congela la
 * del catálogo al darlo de alta), o `null` si no comparten una o alguna no se
 * sabe. Es la que nombra la nota de referencia.
 */
export function listPricesCurrency(currencies: readonly (string | null)[]): string | null {
  const distinct = new Set(currencies);
  if (distinct.size !== 1) return null;
  const [only] = distinct;
  return only ?? null;
}

/**
 * DX-502: ¿están TODOS los precios de lista en la moneda del plan? Solo
 * entonces no hace falta la nota y el «Ahorro por convenio» se puede mostrar.
 */
export function listPricesInPlanCurrency(currencies: readonly (string | null)[], planCurrency: string): boolean {
  return currencies.every((currency) => listPriceInPlanCurrency(currency, planCurrency));
}

/**
 * DX-489: la nota de los precios de lista que se ven en otra moneda que la del
 * plan; `catalogCurrency` es la común de ellos (`null` si hay varias).
 */
export function listPriceNote(catalogCurrency: string | null, planCurrency: string): string {
  return `El precio de lista es el del catálogo de la clínica, en ${catalogCurrency ?? 'su moneda'}: es de referencia y no se convierte a ${planCurrency}.`;
}

/** DX-502: por qué no se ve el precio de lista cuando no se sabe su moneda. */
export function listPriceHiddenNote(planCurrency: string): string {
  return `El precio de lista del catálogo de la clínica no se muestra: no se sabe en qué moneda está y no se convierte a ${planCurrency}.`;
}
