'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatCurrency } from '@/lib/format/currency';
import { parseDecimalInput } from '@/lib/format/money';
import type { ClinicRole } from '@/lib/me/me-api';
import type { TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import type { RoundingDigits } from '@/lib/money/line-rounding';
import { applyBulkDiscount } from '@/lib/discounts/discounts-api';
import {
  capFor,
  discountForPercent,
  needsReason,
  roleCapMessage,
  type DiscountRules,
} from '@/lib/discounts/discount-rules';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Input } from '@/components/ui/input';
import {
  DiscountReasonFields,
  EMPTY_REASON,
  reasonPayload,
  validateDiscountReason,
  type DiscountReasonValue,
} from './discount-reason-fields';

export const bulkDiscountCopy = {
  title: 'Descuento %',
  description: (n: number) =>
    n === 1
      ? 'Se aplica al ítem seleccionado, sobre su precio, redondeado a los decimales de la moneda del plan.'
      : `Se aplica a los ${n} ítems seleccionados, a cada uno sobre su precio, redondeado a los decimales de la moneda del plan.`,
  percent: 'Porcentaje de descuento',
  percentHint: (cap: number) => `Tu rol permite hasta un ${cap} % por ítem. 0 quita el descuento.`,
  invalidPercent: 'Escribe un porcentaje entre 0 y 100, con hasta 2 decimales.',
  previewLabel: 'Cómo quedan los ítems',
  previewRow: (tooth: string) => `Diente ${tooth}`,
  /** Sin los decimales de la moneda (API anterior a DX-340): lo calcula la API al aplicar. */
  previewPending: 'se calcula al aplicar',
  submit: 'Aplicar descuento',
  skipped: (n: number) =>
    n === 1
      ? '1 prestación no admite descuento y se dejó igual.'
      : `${n} prestaciones no admiten descuento y se dejaron igual.`,
  saveError: 'No pudimos aplicar el descuento. Intenta de nuevo.',
};

interface BulkDiscountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  planId: string;
  currency: string;
  /**
   * DX-340: decimales del redondeo por línea de la moneda del plan, del
   * contrato (`currencyDigits.roundingDigits`); `null` si la API no los manda.
   */
  roundingDigits: RoundingDigits | null;
  items: TreatmentPlanItem[];
  /** Nombre del procedimiento de cada ítem (para la vista previa). */
  procedureOf: (item: TreatmentPlanItem) => string;
  rules: DiscountRules;
  role: ClinicRole | null;
  /** `skippedNoDiscount`: ítems cuya prestación no admite descuentos (DX-105). */
  onApplied: (items: TreatmentPlanItem[], skippedNoDiscount: number) => void;
}

/**
 * El porcentaje con la misma regla decimal que los importes (DX-241): «7,5» y
 * «7.5» valen lo mismo, hasta 2 decimales; fuera de 0–100, `null`.
 */
function parsePercent(text: string): number | null {
  const parsed = parseDecimalInput(text, 2);
  return parsed.ok && parsed.value <= 100 ? parsed.value : null;
}

/**
 * «Descuento %» sobre los ítems seleccionados del plan (DX-204). La vista
 * previa usa el mismo redondeo y el mismo tope que la API (los
 * `roundingDigits` de la moneda que da la API: JPY sin decimales, EUR a
 * céntimos; nunca por encima del tope del rol ítem a ítem);
 * la API vuelve a comprobarlo todo y sus mensajes llegan en español. El padre
 * lo monta con una `key` por apertura.
 */
export function BulkDiscountModal({
  open,
  onOpenChange,
  token,
  planId,
  currency,
  roundingDigits,
  items,
  procedureOf,
  rules,
  role,
  onApplied,
}: BulkDiscountModalProps) {
  // Sin rol conocido, la web no adivina el tope: lo decide la API.
  const cap = role ? capFor(rules, role) : 100;
  const [percentText, setPercentText] = useState('');
  const [reason, setReason] = useState<DiscountReasonValue>(EMPTY_REASON);
  const [percentError, setPercentError] = useState<string | null>(null);
  const [reasonErrors, setReasonErrors] = useState<{ reason?: string; note?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const percent = parsePercent(percentText);
  const preview = items.map((item) => ({
    item,
    // Sin dígitos del contrato no se pinta el importe (lo da la API al aplicar).
    discount: percent === null ? 0 : discountForPercent(item.price, percent, roundingDigits ?? 0, cap),
  }));
  // Sin dígitos del contrato, el motivo se pide si CUALQUIER redondeo posible
  // (0, 1 o 2 decimales) lo exigiría: nunca se deja enviar algo que la API
  // rechazaría por falta de motivo.
  const candidateDigits: readonly RoundingDigits[] = roundingDigits === null ? [0, 1, 2] : [roundingDigits];
  const reasonRequired =
    percent !== null &&
    items.some((item) =>
      candidateDigits.some((digits) =>
        needsReason(rules, item.price, discountForPercent(item.price, percent, digits, cap)),
      ),
    );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPercentError(null);
    setReasonErrors(null);
    if (percent === null) return setPercentError(bulkDiscountCopy.invalidPercent);
    if (percent > cap) return setPercentError(roleCapMessage(cap));
    const reasonProblems = validateDiscountReason(reason, reasonRequired);
    if (reasonProblems) return setReasonErrors(reasonProblems);
    setSubmitting(true);
    try {
      const result = await applyBulkDiscount(token, planId, {
        itemIds: items.map((i) => i.id),
        percent,
        ...reasonPayload(reason),
      });
      onApplied(result.items, result.skippedNoDiscount);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, bulkDiscountCopy.saveError));
    } finally {
      setSubmitting(false);
    }
  }

  const percentId = 'bulk-discount-percent';

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={bulkDiscountCopy.title}
      description={bulkDiscountCopy.description(items.length)}
      onSubmit={handleSubmit}
      submitLabel={bulkDiscountCopy.submit}
      submitting={submitting}
      error={error}
    >
      <FormField
        htmlFor={percentId}
        label={bulkDiscountCopy.percent}
        hint={bulkDiscountCopy.percentHint(cap)}
        error={percentError}
      >
        <div className="flex items-center gap-2">
          {/* Sin min/max nativos: el navegador cortaría el envío con su propio
              mensaje (en su idioma) antes que el nuestro. */}
          <Input
            id={percentId}
            type="text"
            inputMode="decimal"
            value={percentText}
            onChange={(e) => setPercentText(e.target.value)}
            aria-invalid={percentError ? true : undefined}
            aria-describedby={percentError ? fieldErrorId(percentId) : undefined}
            className="w-28 tabular-nums"
          />
          <span className="text-sm text-muted">%</span>
        </div>
      </FormField>

      <section aria-label={bulkDiscountCopy.previewLabel} className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-ink">{bulkDiscountCopy.previewLabel}</h3>
        <ul className="divide-y divide-border-subtle rounded-lg border border-border">
          {preview.map(({ item, discount }) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-ink">
                <span className="font-medium tabular-nums">{bulkDiscountCopy.previewRow(item.toothNumber)}</span>
                {' · '}
                {procedureOf(item)}
              </span>
              <span className="tabular-nums text-muted" data-testid="bulk-discount-preview">
                {formatCurrency(item.price, currency)} →{' '}
                {roundingDigits === null ? bulkDiscountCopy.previewPending : `−${formatCurrency(discount, currency)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <DiscountReasonFields
        idPrefix="bulk-discount"
        value={reason}
        onChange={setReason}
        required={reasonRequired}
        thresholdPercent={rules.reasonRequiredAbovePercent}
        errors={reasonErrors}
      />
    </FormModal>
  );
}
