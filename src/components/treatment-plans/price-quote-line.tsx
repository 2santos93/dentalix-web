import { PRICE_SOURCE_LABELS } from '@/components/agreements/agreement-labels';
import type { PriceSource } from '@/lib/patients/patient-agreement-api';

const copy = {
  listPrice: (amount: string | null) =>
    amount === null ? 'precio de lista oculto: moneda del catálogo desconocida' : `precio de lista ${amount}`,
  agreementItem: (name: string) => `Convenio ${name}`,
  priceListItem: 'Lista de precios de la sede',
};

function isAgreementSource(source: string | null | undefined): boolean {
  return Boolean(source && source.startsWith('AGREEMENT_'));
}

/**
 * Pinta el precio de lista (el del catálogo) con SU moneda, que puede no ser la
 * del plan (DX-489, `formatListPrice`); `null` si no se sabe (DX-502): la cifra
 * se oculta y la línea lo dice.
 */
export type ListPriceText = (value: number) => string | null;

/**
 * Origen del precio resuelto en el formulario: «Convenio · Seguros Sol ·
 * precio de lista COP 100.000,00». El precio de lista (catálogo) solo sale si
 * difiere del resuelto.
 */
export function priceSourceText(
  quote: {
    source: PriceSource;
    agreementName: string | null;
    basePrice: number | null;
    price: number | null;
  },
  listPrice: ListPriceText,
): string {
  const parts: string[] = [PRICE_SOURCE_LABELS[quote.source]];
  if (isAgreementSource(quote.source) && quote.agreementName) parts.push(quote.agreementName);
  if (quote.basePrice !== null && quote.basePrice !== quote.price) {
    parts.push(copy.listPrice(listPrice(quote.basePrice)));
  }
  return parts.join(' · ');
}

/**
 * Origen del precio de un ítem ya agregado: «Convenio X · precio de lista $Z»
 * con convenio; «Lista de precios de la sede · precio de lista $Z» (solo si
 * difiere); nada para el catálogo o un ítem anterior a DX-105.
 */
export function itemPriceOriginText(
  item: {
    priceSource: string | null;
    agreementName: string | null;
    basePrice: number | null;
    catalogPrice: number | null;
  },
  listPrice: ListPriceText,
): string | null {
  const list = item.basePrice !== null ? copy.listPrice(listPrice(item.basePrice)) : null;
  if (isAgreementSource(item.priceSource)) {
    const head = copy.agreementItem(item.agreementName ?? '').trim();
    return list ? `${head} · ${list}` : head;
  }
  if (item.priceSource === 'PRICE_LIST' && list && item.basePrice !== item.catalogPrice) {
    return `${copy.priceListItem} · ${list}`;
  }
  return null;
}

/** Línea de origen bajo el campo de precio del formulario. */
export function PriceQuoteLine({
  quote,
  listPrice,
  id,
}: {
  quote: Parameters<typeof priceSourceText>[0];
  listPrice: ListPriceText;
  id?: string;
}) {
  return (
    <p id={id} className="t-caption text-muted tabular-nums">
      {priceSourceText(quote, listPrice)}
    </p>
  );
}
