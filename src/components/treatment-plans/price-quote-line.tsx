import { PRICE_SOURCE_LABELS } from '@/components/agreements/agreement-labels';
import { formatCurrency } from '@/lib/format/currency';
import type { PriceSource } from '@/lib/patients/patient-agreement-api';

const copy = {
  listPrice: (amount: string) => `precio de lista ${amount}`,
  agreementItem: (name: string) => `Convenio ${name}`,
  priceListItem: 'Lista de precios de la sede',
};

function isAgreementSource(source: string | null | undefined): boolean {
  return Boolean(source && source.startsWith('AGREEMENT_'));
}

/**
 * Origen del precio resuelto en el formulario: «Convenio · Seguros Sol ·
 * precio de lista $100.000». El precio de lista (catálogo) solo sale si
 * difiere del resuelto.
 */
export function priceSourceText(
  quote: {
    source: PriceSource;
    agreementName: string | null;
    basePrice: number | null;
    price: number | null;
  },
  currency: string,
): string {
  const parts: string[] = [PRICE_SOURCE_LABELS[quote.source]];
  if (isAgreementSource(quote.source) && quote.agreementName) parts.push(quote.agreementName);
  if (quote.basePrice !== null && quote.basePrice !== quote.price) {
    parts.push(copy.listPrice(formatCurrency(quote.basePrice, currency)));
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
  currency: string,
): string | null {
  const list =
    item.basePrice !== null ? copy.listPrice(formatCurrency(item.basePrice, currency)) : null;
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
  currency,
  id,
}: {
  quote: Parameters<typeof priceSourceText>[0];
  currency: string;
  id?: string;
}) {
  return (
    <p id={id} className="t-caption text-muted tabular-nums">
      {priceSourceText(quote, currency)}
    </p>
  );
}
