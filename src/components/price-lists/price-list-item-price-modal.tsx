'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { replacePriceListItems, type PriceListItemRow } from '@/lib/price-lists/price-lists-api';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';
import { formatCurrency } from '@/lib/format/currency';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';

const copy = {
  title: 'Editar precio',
  description: (name: string, catalogPrice: string) =>
    `${name}. Precio de catálogo: ${catalogPrice}.`,
  noCatalogPrice: 'sin precio',
  price: 'Precio de lista',
  hint: 'Hasta 2 decimales. Para dejar este procedimiento sin precio en la lista, usa «Quitar precio».',
  save: 'Guardar',
  required: 'Indica el precio de lista.',
  genericError: 'No pudimos guardar el precio. Intenta de nuevo.',
};

interface PriceListItemPriceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  priceListId: string;
  /** Moneda de la lista: da los decimales y el formato del importe. */
  currency: string;
  row: PriceListItemRow;
  onSaved: (catalogItemId: string, price: number) => void;
}

/**
 * Fija el precio de UN procedimiento en la lista (DX-105): «Guardar» manda
 * `PUT` con una sola fila. El padre lo monta con una `key` por apertura para
 * resembrar el texto.
 */
export function PriceListItemPriceModal({
  open,
  onOpenChange,
  token,
  priceListId,
  currency,
  row,
  onSaved,
}: PriceListItemPriceModalProps) {
  const [price, setPrice] = useState(row.price === null ? '' : moneyInputText(row.price));
  const [priceError, setPriceError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPriceError(null);
    if (price.trim() === '') return setPriceError(copy.required);
    const parsed = parseMoneyInput(price, currency);
    if (!parsed.ok) return setPriceError(parsed.message);

    setSubmitting(true);
    try {
      await replacePriceListItems(token, priceListId, [
        { catalogItemId: row.catalogItemId, price: parsed.value },
      ]);
      onSaved(row.catalogItemId, parsed.value);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  const catalogPrice =
    row.defaultPrice === null ? copy.noCatalogPrice : formatCurrency(row.defaultPrice, currency);

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description(row.labelEs, catalogPrice)}
      onSubmit={handleSubmit}
      submitLabel={copy.save}
      submitting={submitting}
      error={error}
    >
      <FormField htmlFor="price-list-item-price" label={copy.price} hint={copy.hint} error={priceError}>
        <MoneyInput
          id="price-list-item-price"
          currency={currency}
          value={price}
          onValueChange={(text) => {
            setPrice(text);
            setPriceError(null);
          }}
          aria-invalid={priceError ? true : undefined}
          aria-describedby={priceError ? fieldErrorId('price-list-item-price') : undefined}
          autoFocus
        />
      </FormField>
    </FormModal>
  );
}
