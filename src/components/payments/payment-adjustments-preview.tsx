'use client';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/format/currency';
import { contractRoundingDigits } from '@/lib/money/line-rounding';
import { listCurrencies } from '@/lib/reference/currencies-api';
import type { ClinicPaymentMethod } from '@/lib/payments/payment-methods-api';
import {
  PAYMENT_ADJUSTMENT_TYPE_LABELS,
  adjustmentApplies,
  collectedAmount,
  computePaymentAdjustments,
  signedAdjustmentAmount,
} from '@/lib/payments/payment-adjustments';

export const paymentAdjustmentsPreviewCopy = {
  title: 'Ajustes de este medio de pago',
  collected: 'Total a cobrar',
  pending: 'Se calcula al registrar el abono.',
  note: 'El saldo del plan se mueve por el importe del abono: los impuestos y recargos se cobran aparte y los descuentos cuentan como abono.',
};
const copy = paymentAdjustmentsPreviewCopy;

/** Decimales de redondeo por moneda (DX-340), leídos una vez por pestaña. */
let digitsCache: Promise<Map<string, number>> | null = null;
function currencyDigits(token: string): Promise<Map<string, number>> {
  digitsCache ??= listCurrencies(token)
    .then((list) => new Map(list.map((c) => [c.code.toUpperCase(), c.roundingDigits ?? -1])))
    .catch((err: unknown) => {
      digitsCache = null;
      throw err;
    });
  return digitsCache;
}

/** Solo para las pruebas: olvida la caché de decimales. */
export function resetPaymentAdjustmentsPreviewCache(): void {
  digitsCache = null;
}

/**
 * DX-516: bajo el importe de un abono (o de cada forma de pago de un cobro
 * dividido), los ajustes activos de su medio calculados sobre ese importe y
 * lo que hay que cobrar. Solo anticipa: lo que vale es lo que congela la API.
 * Sin ajustes que se apliquen, no pinta nada.
 */
export function PaymentAdjustmentsPreview({
  token,
  method,
  amount,
  currency,
  id,
}: {
  token: string;
  method: ClinicPaymentMethod | null;
  /** El importe ya leído, o `null` si aún no vale. */
  amount: number | null;
  currency: string;
  id: string;
}) {
  const rules = (method?.adjustments ?? []).filter((a) => adjustmentApplies(a, currency));
  const [digits, setDigits] = useState<Map<string, number> | null>(null);
  const needed = rules.length > 0;

  useEffect(() => {
    if (!needed) return;
    let cancelled = false;
    currencyDigits(token).then(
      (map) => {
        if (!cancelled) setDigits(map);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [token, needed]);

  if (!needed) return null;
  const rounding = contractRoundingDigits(
    digits ? { roundingDigits: digits.get(currency.toUpperCase()) ?? -1 } : null,
  );
  const lines = amount !== null && rounding !== null ? computePaymentAdjustments(rules, amount, currency, rounding) : null;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-surface-sunken p-3 text-sm"
    >
      <p id={`${id}-title`} className="t-label text-ink">
        {copy.title}
      </p>
      <ul className="flex flex-col gap-1">
        {rules.map((rule, index) => {
          const line = lines?.find((l) => l.label === rule.label);
          return (
            <li key={`${rule.label}-${index}`} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-muted">
                {rule.label}
                <span className="sr-only"> ({PAYMENT_ADJUSTMENT_TYPE_LABELS[rule.type]})</span>
              </span>
              <span className="shrink-0 tabular-nums text-ink">{line ? signedAdjustmentAmount(line) : '—'}</span>
            </li>
          );
        })}
      </ul>
      <p className="flex items-baseline justify-between gap-3 border-t border-border-subtle pt-1.5" aria-live="polite">
        <span className="font-medium text-ink">{copy.collected}</span>
        <span className="shrink-0 font-semibold tabular-nums text-ink">
          {lines && amount !== null ? formatCurrency(collectedAmount(amount, lines), currency) : copy.pending}
        </span>
      </p>
      <p className="t-caption text-muted">{copy.note}</p>
    </section>
  );
}
