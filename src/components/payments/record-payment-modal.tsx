'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  SPLIT_MAX_LINES,
  SPLIT_PAYMENT_BALANCE_CHANGED,
  SPLIT_PAYMENT_EXCEEDS_BALANCE,
  recordOpeningBalancePayment,
  recordPayment,
  recordSplitPayment,
  type SplitPaymentLineInput,
} from '@/lib/payments/payments-api';
import { ApiError } from '@/lib/api/api-error';
import { Button } from '@/components/ui/button';
import type { AccountStatementOpeningBalance } from '@/lib/account-statement/account-statement-api';
import { recordPaymentErrorMessage } from '@/lib/payments/payment-errors';
import { statementCopy } from '@/lib/account-statement/presentation';
import { sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { parseMoneyInput } from '@/lib/format/money';
import { FormModal } from '@/components/shared/form-modal';
import { CurrencySelect } from '@/components/shared/currency-select';
import { BillablePlanField, BillablePlansEmpty } from './billable-plan-field';
import { useBillablePlans } from './use-billable-plans';
import { usePaymentLocationHint } from './use-payment-location-hint';
import { useExchangeRates } from './use-exchange-rates';
import { PaymentRatePreview, ratePreviewCopy, type PreviewPlanBalance } from './payment-rate-preview';
import { usePlanBalance } from './use-plan-balance';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import {
  PaymentMethodSelect,
  PaymentReferenceFields,
  comparableReference,
  paymentMethodFieldsCopy,
  usePaymentMethodFields,
  type PaymentMethodFieldsState,
} from './payment-method-fields';
import {
  SplitLineFields,
  SplitPaymentSummary,
  excessOverPending,
  lineAmount,
  splitPaymentCopy,
  splitTotalOf,
  useSplitLines,
} from './split-payment-lines';

// Copy como constantes (i18n-ready).
export const recordPaymentCopy = {
  title: 'Registrar abono',
  description: 'El abono se aplica al plan que elijas y aparece en la caja de hoy.',
  // QA D2: con saldos migrados pendientes, el destino puede ser uno de ellos.
  descriptionWithOpenings: 'El abono se aplica al plan o al saldo migrado que elijas y aparece en la caja de hoy.',
  submit: 'Registrar abono',
  amount: 'Importe',
  currency: 'Moneda',
  date: 'Fecha de pago',
  invalidAmount: 'Escribe un importe mayor que 0.',
  invalidDate: 'Elige la fecha de pago.',
  recorded: (amount: string, date: string, plan: string) => `Abono registrado: ${amount} · ${date} · ${plan}.`,
  // DX-375: sin tasa de su día el abono se guarda igual, pero el saldo no lo
  // cuenta todavía (el plan lo enseña con su aviso).
  recordedWithoutRate: 'Quedó sin tasa de cambio de su día: el saldo no lo cuenta hasta que haya tasa de ese día.',
  // DX-262: destino del abono cuando el paciente trae saldo migrado.
  target: 'Abonar a',
  targetPlan: 'Un plan de tratamiento',
  targetOpening: (concept: string, pending: string) =>
    `Saldo migrado · ${concept} · pendiente ${pending}`,
  openingLabel: (concept: string) => `Saldo migrado · ${concept}`,
  openingPending: (pending: string) => `Pendiente: ${pending}`,
  overPending: (pending: string) =>
    `El abono supera lo pendiente del saldo migrado: quedan ${pending}.`,
  // DX-376: previsualización del cobro en otra moneda que la del plan.
  preview: ratePreviewCopy,
  // DX-390: cobro dividido en varias formas de pago con un solo recibo.
  recordedSplit: (total: string, count: number, date: string, plan: string, receipt: string | null) =>
    `Cobro registrado: ${total} en ${count} formas de pago · ${date} · ${plan}${receipt ? ` · recibo ${receipt}` : ''}.`,
  split: splitPaymentCopy,
};
const copy = recordPaymentCopy;

/** La casilla del saldo a favor del cobro dividido (`SplitPaymentSummary`). */
const CONFIRM_CREDIT_ID = 'rp-confirm-credit';

/** Valor del selector de destino de un saldo migrado. */
const OPENING_PREFIX = 'ob:';

// <select> nativo con el aspecto del átomo Input (misma cadena que el resto de
// formularios de pagos).
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50';

interface FormState {
  /**
   * DX-262: `''` = un plan; `ob:<id>` = ese saldo migrado. Sin elegir, el
   * plan (o el primer saldo si no hay planes cobrables).
   */
  target: string;
  /** `''` = el primer plan de la lista (llega después de abrir). */
  planId: string;
  amount: string;
  /** `''` = la moneda del plan elegido. */
  currency: string;
  date: string;
}

/** `today`: hoy en la zona de la sede (DX-097), no en la del navegador. */
function initialForm(today: string): FormState {
  return {
    target: '',
    planId: '',
    amount: '',
    currency: '',
    date: today,
  };
}

interface RecordPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /**
   * DX-262: saldos migrados del paciente (del estado de cuenta): los que
   * tienen pendiente se ofrecen como destino del abono.
   */
  openingBalances?: AccountStatementOpeningBalance[];
  /** Tras registrar, con el aviso a enseñar: quien abre cierra y recarga. */
  onRecorded: (notice: string) => void;
}

/**
 * «Registrar abono» desde el estado de cuenta (DX-067): quien cobra elige el
 * plan entre los cobrables del paciente (o, DX-262, un saldo migrado con
 * pendiente: `POST /opening-balances/:id/payments`, en su moneda) (`GET /patients/:id/billable-plans`, sin
 * datos clínicos) y registra el abono con el mismo `POST
 * /treatment-plans/:id/payments` que el plan de tratamiento.
 *
 * Idempotencia: la clave se crea al abrir el modal y se reusa en cada reintento
 * del mismo envío (un fallo de red seguido de otro clic no cobra dos veces);
 * el siguiente abono abre el modal de nuevo y estrena clave. Si tras un fallo
 * la persona cambia los datos, el reintento es otra petición y estrena clave
 * (la API respondería 422 a la misma clave con otro cuerpo; QA DX-390).
 */
export function RecordPaymentModal({
  open,
  onOpenChange,
  token,
  patientId,
  openingBalances = [],
  onRecorded,
}: RecordPaymentModalProps) {
  const billable = useBillablePlans(token, patientId, open);
  const locationHint = usePaymentLocationHint(token, open);
  // «Hoy» de la sede (DX-097). Sin su zona la fecha empieza vacía y, si la
  // sede no tiene zona, el campo muestra `SedeConfigError`: nunca otra zona.
  const zone = useSedeTimeZone(token);
  // DX-386: importes y días con el formato de la sede y el código ISO de la
  // moneda; mientras carga, «—».
  const fmt = readyFormat(useSedeFormat(token));
  const money = (amount: number, code: string) => sedeMoney(amount, code, fmt);
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : '';
  const [form, setForm] = useState<FormState>(() => initialForm(today));
  // La clave y lo que identifica la petición que ya viajó con ella (como la
  // huella de la API: ni el motivo de una repetida ni la confirmación del
  // saldo a favor cuentan, así el reintento tras esos 409 es la misma).
  const idempotency = useRef<{ key: string; sent: string | null }>({ key: '', sent: null });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  // DX-377: medio de la clínica, referencia y aviso de referencia repetida.
  const methodFields = usePaymentMethodFields(token, open);
  // DX-390: las formas de pago 2.ª a 5.ª del cobro dividido, con los mismos
  // medios que la primera.
  const split = useSplitLines(methodFields.methods);
  const [confirmCredit, setConfirmCredit] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Tras un 409 de «lo pendiente cambió» se vuelve a leer el saldo del plan.
  const [balanceRefresh, setBalanceRefresh] = useState(0);
  // El foco tras añadir (su importe) o quitar (el botón de añadir) una forma
  // de pago: el botón pulsado desaparece o queda lejos del campo nuevo.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (pendingFocus.current === null) return;
    document.getElementById(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });
  /** El foco a un campo con error: ya, o tras el render que lo monta. */
  function focusField(id: string) {
    const el = document.getElementById(id);
    if (el) el.focus();
    else pendingFocus.current = id;
  }
  // Cada apertura estrena clave (la primera petición la crea).
  useEffect(() => {
    if (open) idempotency.current = { key: '', sent: null };
  }, [open]);
  /** La clave para `request`: la misma si ya viajó esa petición, otra si cambió. */
  function keyFor(request: unknown): string {
    const shape = JSON.stringify(request);
    const current = idempotency.current;
    if (!current.key || (current.sent !== null && current.sent !== shape)) {
      current.key = crypto.randomUUID();
    }
    current.sent = shape;
    return current.key;
  }

  // Si la persona aún no tocó la fecha, sigue a «hoy» de la sede cuando llega
  // su zona (DX-097).
  const [dateTouched, setDateTouched] = useState(false);
  const [prevTimeZone, setPrevTimeZone] = useState(timeZone);
  if (timeZone !== prevTimeZone) {
    setPrevTimeZone(timeZone);
    if (!dateTouched) setForm((f) => ({ ...f, date: today }));
  }

  // Ajuste durante el render: cada apertura empieza de cero, con clave nueva.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(initialForm(today));
      setDateTouched(false);
      setError(null);
      setAmountError(null);
      methodFields.reset();
      split.reset();
      setConfirmCredit(false);
      setConfirmError(null);
    }
  }

  const plans = billable.plans ?? [];
  const openings = openingBalances.filter((o) => o.pending > 0);
  const noPlans = billable.plans !== null && plans.length === 0;
  // Sin elegir: un plan; sin planes cobrables, el primer saldo migrado.
  const targetValue =
    form.target || (noPlans && openings.length > 0 ? `${OPENING_PREFIX}${openings[0].id}` : '');
  const opening = targetValue.startsWith(OPENING_PREFIX)
    ? (openings.find((o) => `${OPENING_PREFIX}${o.id}` === targetValue) ?? null)
    : null;
  const plan = opening ? null : (plans.find((p) => p.id === form.planId) ?? plans[0] ?? null);
  // El abono a un saldo migrado va siempre en su moneda.
  const currency = opening ? opening.currency : form.currency || plan?.currency || '';
  // DX-376: cobrar en otra moneda que la del plan enseña, antes de guardar, la
  // tasa del día del abono y cuánto cubre (un saldo migrado va en su moneda).
  const otherCurrency = plan !== null && currency !== '' && currency !== plan.currency;
  // DX-390: con varias formas de pago (solo a un plan), el total y lo
  // pendiente en la moneda del plan.
  const isSplit = plan !== null && split.lines.length > 0;
  const lineCurrency = (c: string) => c || plan?.currency || '';
  const splitOtherCurrency =
    isSplit && plan !== null && split.lines.some((l) => lineCurrency(l.currency) !== plan.currency);
  const rates = useExchangeRates(token, form.date, open && (otherCurrency || splitOtherCurrency));
  // Lo pendiente sale del saldo del plan con los abonos en otra moneda ya
  // convertidos: `plan.balance` (lista de cobrables) no los descuenta.
  const balance = usePlanBalance(token, plan?.id ?? null, open && (otherCurrency || isSplit), balanceRefresh);
  const previewBalance: PreviewPlanBalance =
    balance.status === 'ready'
      ? { balance: balance.balance.balance, paymentsWithoutRate: balance.balance.paymentsWithoutRate.length }
      : balance.status === 'error'
        ? 'error'
        : 'loading';
  const parsedAmount = currency ? parseMoneyInput(form.amount, currency) : null;
  const previewAmount = parsedAmount?.ok && parsedAmount.value > 0 ? parsedAmount.value : null;

  function patch(next: Partial<FormState>) {
    setForm((f) => ({ ...f, ...next }));
  }

  const splitTotal =
    isSplit && plan
      ? splitTotalOf(
          [
            { amount: lineAmount(form.amount, currency), currency },
            ...split.lines.map((l) => ({
              amount: lineAmount(l.amount, lineCurrency(l.currency)),
              currency: lineCurrency(l.currency),
            })),
          ],
          plan.currency,
          rates,
        )
      : null;
  const pending: number | 'loading' | 'error' =
    balance.status === 'ready' ? balance.balance.balance : balance.status === 'error' ? 'error' : 'loading';
  const splitExceeds =
    splitTotal?.status === 'ready' && typeof pending === 'number' && excessOverPending(splitTotal.total, pending) > 0;

  /**
   * DX-390: el cobro dividido. Cada forma de pago valida como un abono (su
   * importe en su moneda, su medio, su referencia y el motivo de una
   * repetida); el error va junto al campo, que recibe el foco.
   */
  async function submitSplit(planId: string, paidAt: string, first: number) {
    const lines: SplitPaymentLineInput[] = [];
    let firstInvalid: string | null = null;
    for (const [index, line] of split.lines.entries()) {
      const lc = lineCurrency(line.currency);
      const parsed = parseMoneyInput(line.amount, lc);
      if (!parsed.ok || parsed.value <= 0) {
        split.patch(line.key, {
          amountError: parsed.ok || parsed.reason === 'empty' ? copy.invalidAmount : parsed.message,
        });
        firstInvalid ??= `rp-line-${index + 2}-amount`;
        continue;
      }
      lines.push({
        amount: parsed.value,
        currency: lc,
        paymentMethodId: '',
        ...split.fields(line).body(),
      });
    }
    // B3 (QA DX-390): el error lleva el foco a su campo.
    if (firstInvalid) {
      focusField(firstInvalid);
      return;
    }
    if (!methodFields.validate({ requireMethod: true })) return;
    for (const line of split.lines) {
      if (!split.fields(line).validate({ requireMethod: true })) return;
    }
    // La misma regla que la API (400): dos líneas con el mismo medio y la
    // misma referencia. Se marca en la segunda, antes de enviar.
    const allFields: PaymentMethodFieldsState[] = [methodFields, ...split.lines.map((l) => split.fields(l))];
    const seen = new Set<string>();
    for (const fields of allFields) {
      const reference = comparableReference(fields.reference);
      if (!fields.selected || reference === null) continue;
      const pair = `${fields.selected.id}|${reference}`;
      if (seen.has(pair)) {
        fields.markReference(copy.split.sameReference);
        return;
      }
      seen.add(pair);
    }
    if (splitExceeds && !confirmCredit) {
      setConfirmError(copy.split.confirmCreditMissing);
      focusField(CONFIRM_CREDIT_ID);
      return;
    }
    const allLines: SplitPaymentLineInput[] = [
      {
        amount: first,
        currency,
        paymentMethodId: '',
        ...methodFields.body(),
      } as SplitPaymentLineInput,
      ...lines,
    ];
    const key = keyFor([
      'split',
      planId,
      paidAt,
      allLines.map((l) => [l.amount, l.currency, l.paymentMethodId, l.reference ?? null]),
    ]);
    setSubmitting(true);
    try {
      const saved = await recordSplitPayment(
        token,
        planId,
        {
          paidAt,
          ...(confirmCredit ? { confirmCreditBalance: true } : {}),
          lines: allLines,
        },
        key,
      );
      const savedPlan = plans.find((p) => p.id === planId) ?? plan;
      const head = saved.payments[0];
      const recorded = copy.recordedSplit(
        saved.total === null
          ? saved.payments.map((p) => money(p.amount, p.currency)).join(' + ')
          : money(saved.total, saved.planCurrency),
        saved.payments.length,
        head ? sedeCivilDate(head.paidOn, fmt) : '',
        savedPlan ? statementCopy.planLabel(savedPlan.createdAt) : '',
        saved.receiptNumber,
      );
      onRecorded(
        saved.payments.some((p) => p.exchangeRateStatus === 'MISSING')
          ? `${recorded} ${copy.recordedWithoutRate}`
          : recorded,
      );
    } catch (err) {
      // La clave NO cambia: el reintento de este cobro la reusa.
      if (err instanceof ApiError && err.code === SPLIT_PAYMENT_EXCEEDS_BALANCE) {
        setConfirmError(copy.split.confirmCreditMissing);
        setBalanceRefresh((n) => n + 1);
        // La casilla se monta con el error: el foco va a ella tras ese render.
        pendingFocus.current = CONFIRM_CREDIT_ID;
        return;
      }
      // Otro abono entró a la vez: lo pendiente que se ve ya no vale.
      if (err instanceof ApiError && err.code === SPLIT_PAYMENT_BALANCE_CHANGED) {
        setBalanceRefresh((n) => n + 1);
      }
      if (err instanceof ApiError && err.line !== null && err.line > 0) {
        const line = split.lines[err.line - 1];
        if (line && split.fields(line).catchDuplicate(err)) return;
      }
      if (methodFields.catchDuplicate(err)) return;
      setError(recordPaymentErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!plan && !opening) return;
    setError(null);
    // DX-241: la lectura común de los campos de dinero, con los decimales de
    // la moneda del abono. El motivo va junto al campo.
    const parsed = parseMoneyInput(form.amount, currency);
    if (!parsed.ok || parsed.value <= 0) {
      setAmountError(parsed.ok || parsed.reason === 'empty' ? copy.invalidAmount : parsed.message);
      focusField('rp-amount');
      return;
    }
    if (opening && Math.round(parsed.value * 100) > Math.round(opening.pending * 100)) {
      setAmountError(copy.overPending(money(opening.pending, opening.currency)));
      focusField('rp-amount');
      return;
    }
    setAmountError(null);
    const amount = parsed.value;
    if (!form.date) {
      setError(copy.invalidDate);
      return;
    }
    // DX-097: se manda el DÍA (`YYYY-MM-DD`), no la medianoche UTC: la API lo
    // guarda al mediodía de la sede, así cae en ese día de caja en su zona
    // (medianoche UTC sería la tarde del día anterior en Bogotá).
    const paidAt = form.date;
    if (isSplit && plan) {
      await submitSplit(plan.id, paidAt, amount);
      return;
    }
    // DX-395: la referencia o el motivo que faltan se marcan en su campo,
    // que recibe el foco.
    if (!methodFields.validate()) return;
    setSubmitting(true);
    try {
      const body = {
        amount,
        currency,
        paidAt,
        ...methodFields.body(),
      };
      const key = keyFor([
        opening ? `ob:${opening.id}` : (plan as NonNullable<typeof plan>).id,
        amount,
        currency,
        paidAt,
        body.paymentMethodId ?? null,
        body.reference ?? null,
      ]);
      const saved = opening
        ? await recordOpeningBalancePayment(token, opening.id, body, key)
        : await recordPayment(token, (plan as NonNullable<typeof plan>).id, body, key);
      // El aviso sale de lo que la API GUARDÓ, no del formulario: si un envío
      // anterior con esta misma clave sí se registró (respuesta perdida), la
      // API devuelve el abono original y es ese el que hay que anunciar.
      const savedOpening = saved.openingBalanceId
        ? (openings.find((o) => o.id === saved.openingBalanceId) ?? opening)
        : null;
      const savedPlan = plans.find((p) => p.id === saved.treatmentPlanId) ?? plan;
      const recorded = copy.recorded(
        money(saved.amount, saved.currency),
        sedeCivilDate(saved.paidOn, fmt),
        savedOpening
          ? copy.openingLabel(savedOpening.concept)
          : savedPlan
            ? statementCopy.planLabel(savedPlan.createdAt)
            : '',
      );
      onRecorded(saved.exchangeRateStatus === 'MISSING' ? `${recorded} ${copy.recordedWithoutRate}` : recorded);
    } catch (err) {
      // La clave NO cambia: el reintento de este mismo abono la reusa y el
      // servidor lo deduplica en vez de cobrar dos veces.
      if (methodFields.catchDuplicate(err)) return;
      setError(recordPaymentErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={openings.length > 0 ? copy.descriptionWithOpenings : copy.description}
      onSubmit={handleSubmit}
      submitLabel={
        methodFields.duplicate || split.lines.some((l) => l.method.duplicate)
          ? paymentMethodFieldsCopy.duplicateSubmit
          : copy.submit
      }
      submitting={submitting}
      submitDisabled={plan === null && opening === null}
      error={error}
      size="lg"
      touchTargets
    >
      {/* La sede a la que se atribuye se lee antes de escribir el importe. */}
      {locationHint && (!noPlans || openings.length > 0) ? (
        <p className="t-label text-muted">{locationHint}</p>
      ) : null}

      {openings.length > 0 ? (
        <FormField htmlFor="rp-target" label={copy.target}>
          <select
            id="rp-target"
            value={targetValue}
            disabled={submitting}
            onChange={(e) => {
              setAmountError(null);
              // El cobro dividido es solo a un plan: otro destino lo deshace.
              split.reset();
              patch({ target: e.target.value });
            }}
            aria-describedby={opening ? 'rp-target-hint' : undefined}
            className={fieldClass}
          >
            {!noPlans ? <option value="">{copy.targetPlan}</option> : null}
            {openings.map((o) => (
              <option key={o.id} value={`${OPENING_PREFIX}${o.id}`}>
                {copy.targetOpening(o.concept, money(o.pending, o.currency))}
              </option>
            ))}
          </select>
          {opening ? (
            <p id="rp-target-hint" className="mt-1 text-xs text-muted tabular-nums">
              {copy.openingPending(money(opening.pending, opening.currency))}
            </p>
          ) : null}
        </FormField>
      ) : null}

      {noPlans && openings.length === 0 ? (
        <BillablePlansEmpty />
      ) : (
        <>
          {opening || noPlans ? null : (
            <BillablePlanField
              id="rp-plan"
              state={billable}
              value={plan?.id ?? ''}
              onChange={(planId) => {
                const next = plans.find((p) => p.id === planId);
                // Cambiar de plan propone su moneda.
                patch({ planId, currency: next?.currency ?? '' });
              }}
              disabled={submitting}
              money={money}
            />
          )}
          {plan || opening ? (
            <>
              {/* B9 (QA DX-390): con más de una forma de pago, la primera es
                  también un grupo con título. El contenedor está siempre, así
                  añadir o quitar líneas no vuelve a montar sus campos. */}
              <div
                role={isSplit ? 'group' : undefined}
                aria-labelledby={isSplit ? 'rp-line-1-title' : undefined}
                className={cn(
                  'flex min-w-0 flex-col gap-4',
                  isSplit && 'rounded-lg border border-border p-3',
                )}
              >
                {isSplit ? (
                  <p id="rp-line-1-title" className="t-label text-ink">
                    {copy.split.lineTitle(1)}
                  </p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField htmlFor="rp-amount" label={copy.amount} error={amountError}>
                    <MoneyInput
                      id="rp-amount"
                      currency={currency}
                      requirePositive
                      value={form.amount}
                      disabled={submitting}
                      onValueChange={(amount) => {
                        patch({ amount });
                        setAmountError(null);
                      }}
                      aria-invalid={amountError ? true : undefined}
                      aria-describedby={amountError ? fieldErrorId('rp-amount') : undefined}
                    />
                  </FormField>
                  <FormField htmlFor="rp-currency" label={copy.currency}>
                    <CurrencySelect
                      id="rp-currency"
                      token={token}
                      value={currency}
                      onChange={(code) => patch({ currency: code })}
                      disabled={opening !== null || submitting}
                    />
                  </FormField>
                </div>
                {otherCurrency && plan && !isSplit ? (
                  <PaymentRatePreview
                    state={rates}
                    amount={previewAmount}
                    paymentCurrency={currency}
                    planCurrency={plan.currency}
                    planBalance={previewBalance}
                    date={form.date}
                    fmt={fmt}
                  />
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <PaymentMethodSelect fields={methodFields} id="rp-method" disabled={submitting} />
                  <FormField htmlFor="rp-date" label={copy.date}>
                    {zone.status === 'error' && !dateTouched ? (
                      <SedeConfigError kind="timeZone" variant="field" retryId="rp-date" onRetry={zone.retry} />
                    ) : (
                      <Input
                        id="rp-date"
                        type="date"
                        value={form.date}
                        disabled={submitting}
                        onChange={(e) => {
                          setDateTouched(true);
                          patch({ date: e.target.value });
                        }}
                        className="tabular-nums"
                      />
                    )}
                  </FormField>
                </div>
                <PaymentReferenceFields fields={methodFields} idPrefix="rp" disabled={submitting} />
              </div>
              {plan && !opening
                ? split.lines.map((line, index) => (
                    <SplitLineFields
                      key={line.key}
                      line={line}
                      index={index + 1}
                      fields={split.fields(line)}
                      token={token}
                      defaultCurrency={plan.currency}
                      disabled={submitting}
                      onPatch={(next) => split.patch(line.key, next)}
                      onRemove={() => {
                        split.remove(line.key);
                        setConfirmError(null);
                        pendingFocus.current = 'rp-add-line';
                      }}
                    />
                  ))
                : null}
              {plan && !opening ? (
                split.lines.length + 1 < SPLIT_MAX_LINES ? (
                  <Button
                    id="rp-add-line"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      split.add();
                      pendingFocus.current = `rp-line-${split.lines.length + 2}-amount`;
                    }}
                    disabled={submitting}
                    className="w-full sm:w-auto sm:self-start"
                  >
                    <Plus aria-hidden />
                    {copy.split.addLine}
                  </Button>
                ) : (
                  <p className="text-xs text-muted">{copy.split.maxLines(SPLIT_MAX_LINES)}</p>
                )
              ) : null}
              {isSplit && plan && splitTotal ? (
                <SplitPaymentSummary
                  total={splitTotal}
                  pending={pending}
                  planCurrency={plan.currency}
                  fmt={fmt}
                  confirmCredit={confirmCredit}
                  onConfirmCredit={(value) => {
                    setConfirmCredit(value);
                    setConfirmError(null);
                  }}
                  confirmError={confirmError}
                  disabled={submitting}
                />
              ) : null}
            </>
          ) : null}
        </>
      )}
    </FormModal>
  );
}
