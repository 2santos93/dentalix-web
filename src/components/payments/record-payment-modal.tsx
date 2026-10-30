'use client';
import * as React from 'react';
import { useState } from 'react';
import { recordOpeningBalancePayment, recordPayment } from '@/lib/payments/payments-api';
import type { AccountStatementOpeningBalance } from '@/lib/account-statement/account-statement-api';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import { PAYMENT_REFERENCE_DUPLICATE } from '@/lib/payments/payment-methods-api';
import { recordPaymentErrorMessage } from '@/lib/payments/payment-errors';
import { statementCopy } from '@/lib/account-statement/presentation';
import { sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { Input } from '@/components/ui/input';
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
import { usePaymentMethods } from './use-payment-methods';

// Copy como constantes (i18n-ready).
export const recordPaymentCopy = {
  title: 'Registrar abono',
  description: 'El abono se aplica al plan que elijas y aparece en la caja de hoy.',
  // QA D2: con saldos migrados pendientes, el destino puede ser uno de ellos.
  descriptionWithOpenings: 'El abono se aplica al plan o al saldo migrado que elijas y aparece en la caja de hoy.',
  submit: 'Registrar abono',
  amount: 'Importe',
  currency: 'Moneda',
  method: 'Método',
  methodNone: 'Sin especificar',
  // DX-377: medios de la clínica, referencia y aviso de referencia repetida.
  methodsLoading: 'Cargando medios de pago…',
  methodsError: 'No pudimos cargar los medios de pago.',
  methodsRetry: 'Reintentar',
  reference: 'Referencia',
  referenceRequired: 'Referencia (obligatoria)',
  referenceHint: 'El número de operación que da el pagador.',
  referenceMissing: 'Este medio de pago pide la referencia del pago.',
  duplicateReason: 'Motivo para registrarla igualmente',
  duplicateReasonHint: 'Queda guardado con el abono y en la auditoría.',
  duplicateReasonMissing: 'Escribe el motivo para registrar la referencia repetida.',
  duplicateSubmit: 'Registrar igualmente',
  duplicateFallback:
    'Esta referencia ya se usó con este medio de pago en otro abono reciente. Revisa el pago o confirma con un motivo.',
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
};
const copy = recordPaymentCopy;

/** Valor del selector de destino de un saldo migrado. */
const OPENING_PREFIX = 'ob:';

// <select> nativo con el aspecto del átomo Input (misma cadena que el resto de
// formularios de pagos).
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

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
  /** DX-377: medio de la clínica; `''` = sin especificar. */
  paymentMethodId: string;
  reference: string;
  duplicateReason: string;
  date: string;
}

/** `today`: hoy en la zona de la sede (DX-097), no en la del navegador. */
function initialForm(today: string): FormState {
  return {
    target: '',
    planId: '',
    amount: '',
    currency: '',
    paymentMethodId: '',
    reference: '',
    duplicateReason: '',
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
 * el siguiente abono abre el modal de nuevo y estrena clave.
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
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  // DX-377: mensaje del 409 de referencia repetida; con él se pide el motivo.
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const paymentMethods = usePaymentMethods(token, open);

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
      setIdempotencyKey(crypto.randomUUID());
      setError(null);
      setAmountError(null);
      setReferenceError(null);
      setDuplicate(null);
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
  const rates = useExchangeRates(token, form.date, open && otherCurrency);
  // Lo pendiente sale del saldo del plan con los abonos en otra moneda ya
  // convertidos: `plan.balance` (lista de cobrables) no los descuenta.
  const balance = usePlanBalance(token, plan?.id ?? null, open && otherCurrency);
  const previewBalance: PreviewPlanBalance =
    balance.status === 'ready'
      ? { balance: balance.balance.balance, paymentsWithoutRate: balance.balance.paymentsWithoutRate.length }
      : balance.status === 'error'
        ? 'error'
        : 'loading';
  const parsedAmount = currency ? parseMoneyInput(form.amount, currency) : null;
  const previewAmount = parsedAmount?.ok && parsedAmount.value > 0 ? parsedAmount.value : null;

  const selectedMethod = paymentMethods.methods.find((m) => m.id === form.paymentMethodId) ?? null;

  function patch(next: Partial<FormState>) {
    setForm((f) => ({ ...f, ...next }));
  }

  /** Cambiar el medio o la referencia retira el aviso de repetida. */
  function patchReference(next: Partial<FormState>) {
    patch({ ...next, duplicateReason: '' });
    setReferenceError(null);
    setDuplicate(null);
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
      return;
    }
    if (opening && Math.round(parsed.value * 100) > Math.round(opening.pending * 100)) {
      setAmountError(copy.overPending(money(opening.pending, opening.currency)));
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
    const reference = form.reference.trim();
    if (selectedMethod?.requiresReference && reference === '') {
      setReferenceError(copy.referenceMissing);
      return;
    }
    const duplicateReason = form.duplicateReason.trim();
    if (duplicate && duplicateReason === '') {
      setError(copy.duplicateReasonMissing);
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        amount,
        currency,
        paidAt,
        ...(selectedMethod ? { paymentMethodId: selectedMethod.id } : {}),
        ...(selectedMethod && reference ? { reference } : {}),
        ...(duplicate && duplicateReason ? { duplicateReferenceReason: duplicateReason } : {}),
      };
      const saved = opening
        ? await recordOpeningBalancePayment(token, opening.id, body, idempotencyKey)
        : await recordPayment(token, (plan as NonNullable<typeof plan>).id, body, idempotencyKey);
      // El aviso sale de lo que la API GUARDÓ, no del formulario: si un envío
      // anterior con esta misma clave sí se registró (respuesta perdida) y la
      // persona cambió los datos antes de reintentar, la API devuelve el abono
      // original y es ese el que hay que anunciar.
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
      if (err instanceof ApiError && err.code === PAYMENT_REFERENCE_DUPLICATE) {
        setDuplicate(apiErrorMessage(err, copy.duplicateFallback));
        return;
      }
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
      submitLabel={duplicate ? copy.duplicateSubmit : copy.submit}
      submitting={submitting}
      submitDisabled={plan === null && opening === null}
      error={error}
      size="lg"
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
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField htmlFor="rp-amount" label={copy.amount} error={amountError}>
                  <MoneyInput
                    id="rp-amount"
                    currency={currency}
                    requirePositive
                    value={form.amount}
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
                    disabled={opening !== null}
                  />
                </FormField>
              </div>
              {otherCurrency && plan ? (
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
                <FormField htmlFor="rp-method" label={copy.method}>
                  {paymentMethods.status === 'error' ? (
                    <p className="flex flex-wrap items-center gap-2 text-sm text-danger" role="alert">
                      {copy.methodsError}
                      <button type="button" className="font-medium underline" onClick={paymentMethods.retry}>
                        {copy.methodsRetry}
                      </button>
                    </p>
                  ) : (
                    <select
                      id="rp-method"
                      value={form.paymentMethodId}
                      disabled={paymentMethods.status === 'loading'}
                      onChange={(e) => patchReference({ paymentMethodId: e.target.value })}
                      className={fieldClass}
                    >
                      <option value="">
                        {paymentMethods.status === 'loading' ? copy.methodsLoading : copy.methodNone}
                      </option>
                      {paymentMethods.methods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                <FormField htmlFor="rp-date" label={copy.date}>
                  {zone.status === 'error' && !dateTouched ? (
                    <SedeConfigError kind="timeZone" variant="field" retryId="rp-date" onRetry={zone.retry} />
                  ) : (
                    <Input
                      id="rp-date"
                      type="date"
                      value={form.date}
                      onChange={(e) => {
                        setDateTouched(true);
                        patch({ date: e.target.value });
                      }}
                      className="tabular-nums"
                    />
                  )}
                </FormField>
              </div>
              {selectedMethod ? (
                <FormField
                  htmlFor="rp-reference"
                  label={selectedMethod.requiresReference ? copy.referenceRequired : copy.reference}
                  hint={copy.referenceHint}
                  error={referenceError}
                >
                  <Input
                    id="rp-reference"
                    value={form.reference}
                    maxLength={60}
                    autoComplete="off"
                    aria-required={selectedMethod.requiresReference || undefined}
                    onChange={(e) => patchReference({ reference: e.target.value })}
                    aria-invalid={referenceError ? true : undefined}
                    aria-describedby={referenceError ? fieldErrorId('rp-reference') : undefined}
                    className="font-mono"
                  />
                </FormField>
              ) : null}
              {duplicate ? (
                <div role="alert" className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
                  <p className="text-sm text-ink">{duplicate}</p>
                  <FormField htmlFor="rp-duplicate-reason" label={copy.duplicateReason} hint={copy.duplicateReasonHint}>
                    <Input
                      id="rp-duplicate-reason"
                      value={form.duplicateReason}
                      maxLength={300}
                      onChange={(e) => patch({ duplicateReason: e.target.value })}
                      required
                    />
                  </FormField>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </FormModal>
  );
}
