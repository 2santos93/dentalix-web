'use client';
import * as React from 'react';
import { useState } from 'react';
import { Loader2, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { CurrencySelect } from '@/components/shared/currency-select';
import { InlineError } from '@/components/errors/inline-error';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeMoney } from '@/lib/format/sede-number';
import { parseMoneyInput } from '@/lib/format/money';
import { convertWithRate, quoteFromRates } from '@/lib/payments/payment-rate';
import type { ExchangeRatesState } from './use-exchange-rates';
import type { PaymentMethodsState } from './use-payment-methods';
import {
  EMPTY_METHOD_LINE,
  PaymentMethodSelect,
  PaymentReferenceFields,
  methodFieldsOf,
  type MethodLineState,
  type PaymentMethodFieldsState,
} from './payment-method-fields';

// Copy como constantes (i18n-ready). Ningún texto nombra un país ni un banco.
export const splitPaymentCopy = {
  addLine: 'Añadir otra forma de pago',
  lineTitle: (n: number) => `Forma de pago ${n}`,
  removeLine: (n: number) => `Quitar la forma de pago ${n}`,
  remove: 'Quitar',
  maxLines: (max: number) => `Hasta ${max} formas de pago en un mismo cobro.`,
  summaryTitle: (currency: string) => `Cobro en la moneda del plan (${currency})`,
  total: 'Total del cobro',
  pending: 'Pendiente del plan',
  pendingAfter: 'Pendiente tras el cobro',
  inFavorAfter: 'Saldo a favor tras el cobro',
  loading: 'Calculando el total…',
  loadingPending: 'Calculando lo pendiente…',
  balanceUnavailable: 'No se pudo leer el saldo del plan: lo pendiente se verá al guardar.',
  ratesUnavailable:
    'Sin la tasa de algún importe en otra moneda: el total se verá al guardar y esa forma de pago queda «sin tasa» hasta que la haya.',
  exceeds: (excess: string) =>
    `El cobro supera lo pendiente en ${excess}. Confirma que el excedente queda como saldo a favor del paciente.`,
  confirmCredit: 'Registrar el excedente como saldo a favor',
  confirmCreditMissing: 'Confirma el saldo a favor para registrar el cobro.',
  // El mismo texto que el 400 de la API, ya junto a la referencia repetida.
  sameReference:
    'Dos formas de pago del cobro tienen el mismo medio y la misma referencia. Revisa la referencia de cada una.',
};
const copy = splitPaymentCopy;

/** Una forma de pago más del cobro dividido (DX-390): la 2.ª en adelante. */
export interface SplitLineState {
  key: string;
  amount: string;
  /** `''` = la moneda del plan. */
  currency: string;
  amountError: string | null;
  method: MethodLineState;
}

export interface SplitLines {
  lines: SplitLineState[];
  add: () => void;
  remove: (key: string) => void;
  patch: (key: string, next: Partial<Omit<SplitLineState, 'key' | 'method'>>) => void;
  /** Medio y referencia de una línea, con las mismas reglas que el abono suelto. */
  fields: (line: SplitLineState) => PaymentMethodFieldsState;
  reset: () => void;
}

/**
 * Las formas de pago que se añaden a la primera en «Registrar abono»
 * (DX-390). Cada una guarda su importe, su moneda, su medio y su referencia;
 * los medios son los mismos que ya cargó la primera.
 */
export function useSplitLines(methods: PaymentMethodsState): SplitLines {
  const [lines, setLines] = useState<SplitLineState[]>([]);
  const update = (key: string, change: (line: SplitLineState) => SplitLineState) =>
    setLines((all) => all.map((line) => (line.key === key ? change(line) : line)));
  return {
    lines,
    add: () =>
      setLines((all) => [
        ...all,
        {
          key: crypto.randomUUID(),
          amount: '',
          currency: '',
          amountError: null,
          method: EMPTY_METHOD_LINE,
        },
      ]),
    remove: (key) => setLines((all) => all.filter((line) => line.key !== key)),
    patch: (key, next) => update(key, (line) => ({ ...line, ...next })),
    fields: (line) =>
      methodFieldsOf(methods, line.method, (change) =>
        update(line.key, (current) => ({
          ...current,
          method: change(current.method),
        })),
      ),
    reset: () => setLines([]),
  };
}

/** Los campos de la 2.ª forma de pago en adelante, con «Quitar». */
export function SplitLineFields({
  line,
  index,
  fields,
  token,
  defaultCurrency,
  disabled,
  onPatch,
  onRemove,
}: {
  line: SplitLineState;
  /** Posición en el cobro (la primera forma de pago es la 0). */
  index: number;
  fields: PaymentMethodFieldsState;
  token: string;
  defaultCurrency: string;
  disabled: boolean;
  onPatch: (next: Partial<Omit<SplitLineState, 'key' | 'method'>>) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const prefix = `rp-line-${n}`;
  const titleId = `${prefix}-title`;
  const currency = line.currency || defaultCurrency;
  // Un <legend> dentro de un <div> no nombra el <fieldset>: el título visible
  // lo nombra con aria-labelledby.
  return (
    <fieldset
      data-testid={`split-line-${n}`}
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p id={titleId} className="t-label text-ink">
          {copy.lineTitle(n)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={disabled}
          aria-label={copy.removeLine(n)}
          className="text-muted hover:text-ink max-sm:h-11"
        >
          <Trash2 aria-hidden />
          {copy.remove}
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor={`${prefix}-amount`} label="Importe" error={line.amountError}>
          <MoneyInput
            id={`${prefix}-amount`}
            currency={currency}
            requirePositive
            value={line.amount}
            disabled={disabled}
            onValueChange={(amount) => onPatch({ amount, amountError: null })}
            aria-invalid={line.amountError ? true : undefined}
            aria-describedby={line.amountError ? fieldErrorId(`${prefix}-amount`) : undefined}
          />
        </FormField>
        <FormField htmlFor={`${prefix}-currency`} label="Moneda">
          <CurrencySelect
            id={`${prefix}-currency`}
            token={token}
            value={currency}
            disabled={disabled}
            onChange={(code) => onPatch({ currency: code })}
          />
        </FormField>
      </div>
      <PaymentMethodSelect fields={fields} id={`${prefix}-method`} disabled={disabled} />
      <PaymentReferenceFields fields={fields} idPrefix={prefix} disabled={disabled} />
    </fieldset>
  );
}

/** El importe de una línea ya leído en su moneda, o `null` si no vale. */
export function lineAmount(text: string, currency: string): number | null {
  if (!currency) return null;
  const parsed = parseMoneyInput(text, currency);
  return parsed.ok && parsed.value > 0 ? parsed.value : null;
}

export type SplitTotal =
  | { status: 'loading' }
  /** Alguna línea en otra moneda sin tasa de su día (o las tasas no cargaron). */
  | { status: 'unavailable' }
  | { status: 'ready'; total: number };

/**
 * El total del cobro en la moneda del plan, con la tasa del día que cada línea
 * congelará al guardarse (DX-375, la misma cuenta que la API). Las líneas sin
 * importe válido no suman.
 */
export function splitTotalOf(
  lines: { amount: number | null; currency: string }[],
  planCurrency: string,
  rates: ExchangeRatesState,
): SplitTotal {
  let cents = 0;
  for (const line of lines) {
    if (line.amount === null) continue;
    if (line.currency === planCurrency) {
      cents += Math.round(line.amount * 100);
      continue;
    }
    if (rates.status === 'loading' || rates.status === 'idle') return { status: 'loading' };
    if (rates.status !== 'ready') return { status: 'unavailable' };
    const quote = quoteFromRates(rates.rates, line.currency, planCurrency);
    if (quote === null) return { status: 'unavailable' };
    cents += Math.round(convertWithRate(line.amount, quote) * 100);
  }
  return { status: 'ready', total: cents / 100 };
}

/**
 * Lo que el cobro supera lo pendiente del plan, al céntimo, o 0. Lo pendiente
 * nunca baja de 0: un saldo a favor previo no se suma al excedente de este
 * cobro. La misma cuenta que `excessOverPending` de la API (QA DX-390).
 */
export function excessOverPending(total: number, pending: number): number {
  return Math.max(0, Math.round(total * 100) - Math.max(0, Math.round(pending * 100))) / 100;
}

/**
 * Total y pendiente del cobro dividido en la moneda del plan, y la
 * confirmación del saldo a favor si el total lo supera (DX-390).
 */
export function SplitPaymentSummary({
  total,
  pending,
  planCurrency,
  fmt,
  confirmCredit,
  onConfirmCredit,
  confirmError,
  disabled,
}: {
  total: SplitTotal;
  /** Pendiente del plan antes del cobro; `'loading'` o `'error'` si no se sabe. */
  pending: number | 'loading' | 'error';
  planCurrency: string;
  fmt: RegionalFormat | null;
  confirmCredit: boolean;
  onConfirmCredit: (value: boolean) => void;
  confirmError: string | null;
  disabled: boolean;
}) {
  const money = (value: number) => sedeMoney(value, planCurrency, fmt);
  const known = total.status === 'ready' && typeof pending === 'number';
  const after = known ? Math.round((pending - total.total) * 100) / 100 : null;
  const excess = known ? excessOverPending(total.total, pending) : 0;
  const exceeds = excess > 0;
  return (
    <section
      data-testid="split-summary"
      aria-label={copy.summaryTitle(planCurrency)}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink"
    >
      <p className="t-label text-muted">{copy.summaryTitle(planCurrency)}</p>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-muted">{copy.total}</dt>
          <dd className="font-semibold tabular-nums">
            {total.status === 'ready' ? (
              money(total.total)
            ) : total.status === 'loading' ? (
              <span className="inline-flex items-center gap-2 text-muted">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                <span className="sr-only">{copy.loading}</span>
              </span>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">{copy.pending}</dt>
          <dd className="font-semibold tabular-nums">
            {typeof pending === 'number' ? (
              money(Math.max(0, pending))
            ) : pending === 'loading' ? (
              <span className="inline-flex items-center gap-2 text-muted">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                <span className="sr-only">{copy.loadingPending}</span>
              </span>
            ) : (
              '—'
            )}
          </dd>
        </div>
        {after !== null ? (
          <div className="min-w-0">
            <dt className="text-muted">{after < 0 ? copy.inFavorAfter : copy.pendingAfter}</dt>
            <dd className="font-semibold tabular-nums">{money(Math.abs(after))}</dd>
          </div>
        ) : null}
      </dl>
      {total.status === 'unavailable' ? (
        <p className="flex items-start gap-2">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-text" />
          <span>{copy.ratesUnavailable}</span>
        </p>
      ) : null}
      {pending === 'error' ? <p className="text-muted">{copy.balanceUnavailable}</p> : null}
      {exceeds || confirmError ? (
        // `group`, no `status`: lleva una casilla y su error ya se anuncia solo.
        <Callout tone="warning" role="group">
          <div className="flex flex-col gap-2">
            {exceeds ? <p>{copy.exceeds(money(excess))}</p> : null}
            <Checkbox
              id="rp-confirm-credit"
              checked={confirmCredit}
              disabled={disabled}
              onChange={(e) => onConfirmCredit(e.target.checked)}
              aria-invalid={confirmError ? true : undefined}
              aria-describedby={confirmError ? 'rp-confirm-credit-error' : undefined}
              label={copy.confirmCredit}
            />
            {confirmError ? (
              <InlineError id="rp-confirm-credit-error" className="text-xs">
                {confirmError}
              </InlineError>
            ) : null}
          </div>
        </Callout>
      ) : null}
    </section>
  );
}
