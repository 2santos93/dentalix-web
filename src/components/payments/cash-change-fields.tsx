'use client';
import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { ClinicPaymentMethod } from '@/lib/payments/payment-methods-api';
import {
  CHANGE_MAX_LINES,
  changeEquivalent,
  settleCashChange,
  suggestedChange,
  type ChangeEquivalent,
} from '@/lib/payments/cash-change';
import { collectedAmount, computePaymentAdjustments, adjustmentApplies } from '@/lib/payments/payment-adjustments';
import { ratePairLabel, type RatesOfDay } from '@/lib/payments/payment-rate';
import { currencyRoundingDigits, roundingDigitsOf } from '@/lib/reference/currency-rounding-digits';
import { parseMoneyInput } from '@/lib/format/money';
import { amountCents, amountText, centsToAmount } from '@/lib/money/round';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { useAcceptedPaymentCurrencies } from '@/components/exchange/exchange-header-context';
import { CurrencySelect } from '@/components/shared/currency-select';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { InlineError } from '@/components/errors/inline-error';
import { FieldError } from '@/components/errors/field-error';
import { useExchangeRates } from './use-exchange-rates';
import { comparableReference } from './payment-method-fields';

// Copy como constantes (i18n-ready). Ningún texto nombra un país ni un banco.
export const cashChangeCopy = {
  tendered: 'Recibido',
  tenderedHint: 'Lo que entrega el paciente. Déjalo vacío si no hay vuelto.',
  due: 'Por devolver',
  collected: 'Cobrado',
  change: 'Vuelto',
  changeLegend: 'Vuelto al paciente',
  lineTitle: (n: number) => `Vuelto ${n}`,
  method: 'Entregado por',
  currency: 'Moneda',
  amount: 'Importe',
  reference: 'Referencia (obligatoria)',
  referenceHint: 'El número de operación de la entrega.',
  referenceMissing: 'Este medio pide la referencia de la entrega.',
  methodMissing: 'Elige por qué medio se entrega el vuelto.',
  amountMissing: 'Escribe el importe del vuelto.',
  equivalent: (amount: string, rate: string) => `Equivale a ${amount} · ${rate}`,
  useSuggested: (amount: string) => `Usar ${amount}`,
  suggestedIn: (amount: string) => `Por devolver en esta moneda: ${amount}`,
  rateMissing: 'No hay tasa del día para esta moneda: da el vuelto en la moneda del abono o registra la tasa.',
  ratesError: 'Tasas no disponibles',
  addLine: 'Añadir vuelto en otra moneda o medio',
  removeLine: (n: number) => `Quitar el vuelto ${n}`,
  maxLines: `Como mucho ${CHANGE_MAX_LINES} líneas de vuelto.`,
  given: 'Vuelto entregado',
  belowCollected: (collected: string) => `Lo recibido no cubre lo cobrado (${collected}).`,
  exceeds: (change: string, due: string) => `El vuelto (${change}) supera lo que hay que devolver (${due}).`,
  remainder: (remainder: string) =>
    `Quedan ${remainder} sin devolver. Completa el vuelto o súmalos al abono: si superan lo pendiente, quedan como saldo a favor del paciente.`,
  confirmRemainder: (remainder: string) => `Sumar ${remainder} al abono`,
  confirmMissing: 'Confirma que la diferencia se suma al abono, o completa el vuelto.',
  remainderWithAdjustments:
    'Este medio tiene ajustes sobre el importe: devuelve el vuelto completo o cambia el importe del abono.',
  recorded: (tendered: string, change: string) => ` Recibido ${tendered} · vuelto ${change}.`,
};
const copy = cashChangeCopy;

export interface CashChangeLine {
  key: string;
  paymentMethodId: string;
  /** `''` = la moneda del abono. */
  currency: string;
  amount: string;
  /** Mientras la persona no lo toca, el importe sigue a lo que hay que devolver. */
  amountTouched: boolean;
  reference: string;
  methodError: string | null;
  amountError: string | null;
  referenceError: string | null;
}

/** Lo que se añade al cuerpo del abono (nada si no hay «Recibido»). */
export interface CashChangeBody {
  tendered?: number;
  change?: { paymentMethodId: string; currency: string; amount: number; reference?: string }[];
  changeRemainderToCredit?: boolean;
}

let lineSeq = 0;
const newLine = (paymentMethodId: string): CashChangeLine => ({
  key: `cc-${++lineSeq}`,
  paymentMethodId,
  currency: '',
  amount: '',
  amountTouched: false,
  reference: '',
  methodError: null,
  amountError: null,
  referenceError: null,
});

export interface CashChangeState {
  tendered: string;
  tenderedError: string | null;
  lines: CashChangeLine[];
  confirmRemainder: boolean;
  confirmError: string | null;
  setTendered: (text: string) => void;
  patchLine: (key: string, next: Partial<CashChangeLine>) => void;
  addLine: (paymentMethodId: string) => void;
  removeLine: (key: string) => void;
  setConfirmRemainder: (value: boolean) => void;
  setTenderedError: (message: string | null) => void;
  setConfirmError: (message: string | null) => void;
  reset: () => void;
}

/** El estado del bloque «Recibido / Vuelto» de un abono en efectivo (DX-570). */
export function useCashChange(): CashChangeState {
  const [tendered, setTenderedText] = useState('');
  const [tenderedError, setTenderedError] = useState<string | null>(null);
  const [lines, setLines] = useState<CashChangeLine[]>([]);
  const [confirmRemainder, setConfirm] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Estables: los efectos del bloque los usan (primera línea, importe sugerido).
  const patchLine = useCallback((key: string, next: Partial<CashChangeLine>) => {
    setLines((all) => all.map((l) => (l.key === key ? { ...l, ...next } : l)));
    if ('amount' in next || 'currency' in next || 'paymentMethodId' in next) setConfirmError(null);
  }, []);
  const addLine = useCallback(
    (paymentMethodId: string) => setLines((all) => [...all, newLine(paymentMethodId)]),
    [],
  );
  return {
    tendered,
    tenderedError,
    lines,
    confirmRemainder,
    confirmError,
    setTendered: (text) => {
      setTenderedText(text);
      setTenderedError(null);
      setConfirmError(null);
    },
    patchLine,
    addLine,
    removeLine: (key) => setLines((all) => all.filter((l) => l.key !== key)),
    setConfirmRemainder: (value) => {
      setConfirm(value);
      setConfirmError(null);
    },
    setTenderedError,
    setConfirmError,
    reset: () => {
      setTenderedText('');
      setTenderedError(null);
      setLines([]);
      setConfirm(false);
      setConfirmError(null);
    },
  };
}

/** ¿Es de tipo efectivo el medio elegido? Solo entonces hay «Recibido». */
export function isCashMethod(method: ClinicPaymentMethod | null): boolean {
  return method?.kind === 'CASH';
}

interface CashChangeComputed {
  tenderedValue: number | null;
  collected: number | null;
  equivalents: ChangeEquivalent[];
  settlement: ReturnType<typeof settleCashChange>;
  ratesState: RatesOfDay | 'loading' | 'unavailable';
  ratesRetry: (() => void) | null;
  digitsOf: (currency: string) => 0 | 1 | 2 | null;
  lineCurrency: (line: CashChangeLine) => string;
  hasAdjustments: boolean;
}

/**
 * Lo calculado del vuelto (cobrado, equivalentes y cuadre) con las tasas del
 * día del abono y los decimales de cada moneda. La usan el bloque y el envío.
 */
export function useCashChangeComputed(
  cash: CashChangeState,
  {
    token,
    active,
    method,
    amount,
    currency,
    date,
  }: {
    token: string;
    active: boolean;
    method: ClinicPaymentMethod | null;
    amount: number | null;
    currency: string;
    date: string;
  },
): CashChangeComputed {
  const [digits, setDigits] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    currencyRoundingDigits(token).then(
      (map) => {
        if (!cancelled) setDigits(map);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [token, active]);
  const lineCurrency = (line: CashChangeLine) => line.currency || currency;
  const otherCurrencies = cash.lines.map(lineCurrency).filter((c) => c !== currency);
  const rates = useExchangeRates(
    token,
    date,
    active && otherCurrencies.length > 0,
    [currency, ...otherCurrencies],
  );
  const ratesState: RatesOfDay | 'loading' | 'unavailable' =
    rates.status === 'ready' ? rates.rates : rates.status === 'unavailable' || rates.status === 'error' ? 'unavailable' : 'loading';
  const digitsOf = (code: string) => roundingDigitsOf(digits, code);

  const parsedTendered = currency && cash.tendered.trim() ? parseMoneyInput(cash.tendered, currency) : null;
  const tenderedValue = parsedTendered?.ok && parsedTendered.value > 0 ? parsedTendered.value : null;
  const rules = (method?.adjustments ?? []).filter((a) => adjustmentApplies(a, currency));
  const payDigits = digitsOf(currency);
  const collected =
    amount === null
      ? null
      : rules.length === 0
        ? amount
        : payDigits === null
          ? null
          : collectedAmount(amount, computePaymentAdjustments(rules, amount, currency, payDigits));
  const equivalents = cash.lines.map((line): ChangeEquivalent => {
    const lc = lineCurrency(line);
    const parsed = lc ? parseMoneyInput(line.amount, lc) : null;
    if (!parsed?.ok || parsed.value <= 0) return { status: 'ready', amount: 0, quote: null };
    return changeEquivalent(parsed.value, lc, currency, ratesState);
  });
  return {
    tenderedValue,
    collected,
    equivalents,
    settlement: settleCashChange({ tendered: tenderedValue, collected, equivalents }),
    ratesState,
    ratesRetry: rates.status === 'error' ? rates.retry : null,
    digitsOf,
    lineCurrency,
    hasAdjustments: rules.length > 0,
  };
}

/**
 * Antes de enviar: lo que va al cuerpo, o `null` con el error junto a su
 * campo (y su id, para el foco). Sin «Recibido», el cuerpo de siempre.
 */
export function cashChangeBody(
  cash: CashChangeState,
  computed: CashChangeComputed,
  methods: readonly ClinicPaymentMethod[],
  money: (amount: number, currency: string) => string,
  currency: string,
  idPrefix: string,
): { body: CashChangeBody } | { focus: string } {
  if (!cash.tendered.trim()) return { body: {} };
  const parsed = parseMoneyInput(cash.tendered, currency);
  if (!parsed.ok || parsed.value <= 0) {
    cash.setTenderedError(parsed.ok || parsed.reason === 'empty' ? copy.tenderedHint : parsed.message);
    return { focus: `${idPrefix}-tendered` };
  }
  let focus: string | null = null;
  const change: NonNullable<CashChangeBody['change']> = [];
  cash.lines.forEach((line, index) => {
    const n = index + 1;
    const lc = computed.lineCurrency(line);
    const medium = methods.find((m) => m.id === line.paymentMethodId) ?? null;
    const amountParsed = parseMoneyInput(line.amount, lc);
    const errors: Partial<CashChangeLine> = { methodError: null, amountError: null, referenceError: null };
    if (!medium) {
      errors.methodError = copy.methodMissing;
      focus ??= `${idPrefix}-change-${n}-method`;
    }
    if (!amountParsed.ok || amountParsed.value <= 0) {
      errors.amountError = amountParsed.ok || amountParsed.reason === 'empty' ? copy.amountMissing : amountParsed.message;
      focus ??= `${idPrefix}-change-${n}-amount`;
    }
    if (medium?.requiresReference && comparableReference(line.reference) === null) {
      errors.referenceError = copy.referenceMissing;
      focus ??= `${idPrefix}-change-${n}-reference`;
    }
    cash.patchLine(line.key, errors);
    if (medium && amountParsed.ok && amountParsed.value > 0) {
      change.push({
        paymentMethodId: medium.id,
        currency: lc,
        amount: amountParsed.value,
        ...(line.reference.trim() ? { reference: line.reference.trim() } : {}),
      });
    }
  });
  if (focus) return { focus };
  const s = computed.settlement;
  if (s.kind === 'below-collected') {
    cash.setTenderedError(copy.belowCollected(money(s.collected, currency)));
    return { focus: `${idPrefix}-tendered` };
  }
  if (s.kind === 'exceeds') {
    cash.setConfirmError(copy.exceeds(money(s.change, currency), money(s.due, currency)));
    return { focus: `${idPrefix}-change-1-amount` };
  }
  if (s.kind === 'ok' && s.remainder > 0) {
    if (computed.hasAdjustments) {
      cash.setConfirmError(copy.remainderWithAdjustments);
      return { focus: `${idPrefix}-tendered` };
    }
    if (!cash.confirmRemainder) {
      cash.setConfirmError(copy.confirmMissing);
      return { focus: `${idPrefix}-confirm-remainder` };
    }
  }
  return {
    body: {
      tendered: parsed.value,
      ...(change.length > 0 ? { change } : {}),
      ...(s.kind === 'ok' && s.remainder > 0 ? { changeRemainderToCredit: true } : {}),
    },
  };
}

/**
 * DX-570: «Recibido» y el bloque «Vuelto» de un abono en efectivo, con el
 * cálculo en las dos monedas (lo que hay que devolver en la del abono y, en
 * cada línea en otra moneda, cuánto es con la tasa del día). Errores junto a
 * su campo (escalón 4); las tasas que no cargan, en su sitio (escalón 2).
 */
export function CashChangeFields({
  cash,
  computed,
  methods,
  currency,
  token,
  money,
  disabled,
  idPrefix,
}: {
  cash: CashChangeState;
  computed: CashChangeComputed;
  /** Los medios activos de la clínica (por los que se puede dar el vuelto). */
  methods: readonly ClinicPaymentMethod[];
  currency: string;
  token: string;
  money: (amount: number, currency: string) => string;
  disabled?: boolean;
  idPrefix: string;
}) {
  const { settlement, tenderedValue } = computed;
  const due = settlement.kind === 'ok' || settlement.kind === 'exceeds' ? settlement.due : null;
  const cashMethod = methods.find((m) => m.kind === 'CASH')?.id ?? '';

  // El primer vuelto aparece solo, en efectivo y en la moneda del abono, en
  // cuanto hay algo que devolver.
  const needsFirstLine = due !== null && due > 0 && cash.lines.length === 0;
  const { addLine } = cash;
  useEffect(() => {
    if (needsFirstLine) addLine(cashMethod);
  }, [needsFirstLine, cashMethod, addLine]);

  const tenderedId = `${idPrefix}-tendered`;
  const confirmId = `${idPrefix}-confirm-remainder`;
  const remainder = settlement.kind === 'ok' ? settlement.remainder : 0;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor={tenderedId} label={copy.tendered} hint={copy.tenderedHint} error={cash.tenderedError}>
          <MoneyInput
            money={money}
            id={tenderedId}
            currency={currency}
            value={cash.tendered}
            disabled={disabled}
            onValueChange={cash.setTendered}
            aria-invalid={cash.tenderedError ? true : undefined}
            aria-describedby={cash.tenderedError ? fieldErrorId(tenderedId) : undefined}
          />
        </FormField>
        {tenderedValue !== null ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 self-end text-sm" aria-live="polite">
            <div className="min-w-0">
              <dt className="text-muted">{copy.collected}</dt>
              <dd className="tabular-nums text-ink">
                {computed.collected === null ? '—' : money(computed.collected, currency)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted">{copy.due}</dt>
              <dd className="font-semibold tabular-nums text-ink">{due === null ? '—' : money(due, currency)}</dd>
            </div>
          </dl>
        ) : null}
      </div>

      {tenderedValue !== null && cash.lines.length > 0 ? (
        <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3">
          <legend className="t-label px-1 text-ink">{copy.changeLegend}</legend>
          {cash.lines.map((line, index) => (
            <ChangeLineFields
              key={line.key}
              n={index + 1}
              line={line}
              cash={cash}
              computed={computed}
              methods={methods}
              currency={currency}
              due={due}
              token={token}
              money={money}
              disabled={disabled}
              idPrefix={idPrefix}
              equivalent={computed.equivalents[index]}
            />
          ))}
          {cash.lines.length < CHANGE_MAX_LINES ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto sm:self-start"
              disabled={disabled}
              onClick={() => cash.addLine(cashMethod)}
            >
              <Plus aria-hidden />
              {copy.addLine}
            </Button>
          ) : (
            <p className="t-caption text-muted">{copy.maxLines}</p>
          )}
          {settlement.kind === 'ok' || settlement.kind === 'exceeds' ? (
            <p className="flex items-baseline justify-between gap-3 border-t border-border-subtle pt-2 text-sm">
              <span className="text-muted">{copy.given}</span>
              <span className="font-semibold tabular-nums text-ink">{money(settlement.change, currency)}</span>
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {remainder > 0 && !computed.hasAdjustments ? (
        // `group`, no `status`: lleva una casilla y su error ya se anuncia solo.
        <Callout tone="warning" role="group">
          <div className="flex flex-col gap-2">
            <p>{copy.remainder(money(remainder, currency))}</p>
            <Checkbox
              id={confirmId}
              checked={cash.confirmRemainder}
              disabled={disabled}
              onChange={(e) => cash.setConfirmRemainder(e.target.checked)}
              label={copy.confirmRemainder(money(remainder, currency))}
              error={cash.confirmError}
            />
          </div>
        </Callout>
      ) : cash.confirmError ? (
        <InlineError id={`${idPrefix}-change-error`}>{cash.confirmError}</InlineError>
      ) : null}
    </div>
  );
}

function ChangeLineFields({
  n,
  line,
  cash,
  computed,
  methods,
  currency,
  due,
  token,
  money,
  disabled,
  idPrefix,
  equivalent,
}: {
  n: number;
  line: CashChangeLine;
  cash: CashChangeState;
  computed: CashChangeComputed;
  methods: readonly ClinicPaymentMethod[];
  currency: string;
  due: number | null;
  token: string;
  money: (amount: number, currency: string) => string;
  disabled?: boolean;
  idPrefix: string;
  equivalent: ChangeEquivalent | undefined;
}) {
  // DX-584: el vuelto, también solo en las monedas que acepta la clínica.
  const acceptedCurrencies = useAcceptedPaymentCurrencies();
  const id = `${idPrefix}-change-${n}`;
  const lc = computed.lineCurrency(line);
  const medium = methods.find((m) => m.id === line.paymentMethodId) ?? null;
  // Lo que queda por devolver sin contar esta línea, y cuánto es en su moneda.
  const others = computed.equivalents.reduce(
    (sum, e, i) => (i === n - 1 || e.status !== 'ready' ? sum : sum + e.amount),
    0,
  );
  const remaining = due === null ? null : centsToAmount(Math.max(0, amountCents(due) - amountCents(others)));
  const digits = computed.digitsOf(lc);
  const suggestion =
    remaining !== null && digits !== null ? suggestedChange(remaining, lc, currency, computed.ratesState, digits) : null;

  // Mientras no se toca, el importe sigue a lo que hay que devolver.
  const { patchLine } = cash;
  const suggestionText = suggestion === null ? '' : amountText(suggestion, digits ?? 2);
  useEffect(() => {
    if (!line.amountTouched && line.amount !== suggestionText) patchLine(line.key, { amount: suggestionText });
  }, [line.amountTouched, line.amount, line.key, suggestionText, patchLine]);

  return (
    <div role="group" aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p id={`${id}-title`} className="t-label text-ink">
          {copy.lineTitle(n)}
        </p>
        {n > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={copy.removeLine(n)}
            disabled={disabled}
            onClick={() => cash.removeLine(line.key)}
          >
            <X aria-hidden />
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField htmlFor={`${id}-method`} label={copy.method} error={line.methodError}>
          <NativeSelect
            id={`${id}-method`}
            value={line.paymentMethodId}
            disabled={disabled}
            aria-invalid={line.methodError ? true : undefined}
            onChange={(e) => cash.patchLine(line.key, { paymentMethodId: e.target.value, methodError: null })}
          >
            <option value="">—</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor={`${id}-currency`} label={copy.currency}>
          <CurrencySelect
            id={`${id}-currency`}
            token={token}
            only={acceptedCurrencies}
            value={lc}
            disabled={disabled}
            onChange={(code) => cash.patchLine(line.key, { currency: code, amountTouched: false })}
          />
        </FormField>
        <FormField htmlFor={`${id}-amount`} label={copy.amount} error={line.amountError}>
          <MoneyInput
            money={money}
            id={`${id}-amount`}
            currency={lc}
            requirePositive
            value={line.amount}
            disabled={disabled}
            onValueChange={(amount) => cash.patchLine(line.key, { amount, amountTouched: true, amountError: null })}
            aria-invalid={line.amountError ? true : undefined}
            aria-describedby={line.amountError ? fieldErrorId(`${id}-amount`) : undefined}
          />
        </FormField>
      </div>
      {lc !== currency ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-live="polite">
          {computed.ratesRetry ? (
            <FieldError label={copy.ratesError} onRetry={computed.ratesRetry} className="h-8" />
          ) : equivalent?.status === 'unavailable' ? (
            <span className="text-warning-text">{copy.rateMissing}</span>
          ) : equivalent?.status === 'ready' && equivalent.quote ? (
            <span className="tabular-nums text-muted">
              {copy.equivalent(money(equivalent.amount, currency), ratePairLabel(lc, equivalent.quote, money))}
            </span>
          ) : null}
          {suggestion !== null && line.amountTouched && line.amount !== suggestionText ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              disabled={disabled}
              onClick={() => cash.patchLine(line.key, { amount: suggestionText, amountTouched: false })}
            >
              {copy.useSuggested(money(suggestion, lc))}
            </Button>
          ) : null}
        </div>
      ) : null}
      {medium?.requiresReference ? (
        <FormField htmlFor={`${id}-reference`} label={copy.reference} hint={copy.referenceHint} error={line.referenceError}>
          <Input
            id={`${id}-reference`}
            value={line.reference}
            maxLength={60}
            autoComplete="off"
            disabled={disabled}
            aria-required
            aria-invalid={line.referenceError ? true : undefined}
            className="font-mono"
            onChange={(e) => cash.patchLine(line.key, { reference: e.target.value, referenceError: null })}
          />
        </FormField>
      ) : null}
    </div>
  );
}
