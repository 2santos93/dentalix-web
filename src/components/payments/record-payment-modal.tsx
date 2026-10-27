'use client';
import * as React from 'react';
import { useState } from 'react';
import {
  recordOpeningBalancePayment,
  recordPayment,
  type PaymentMethod,
} from '@/lib/payments/payments-api';
import type { AccountStatementOpeningBalance } from '@/lib/account-statement/account-statement-api';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from '@/lib/payments/payment-method';
import { recordPaymentErrorMessage } from '@/lib/payments/payment-errors';
import { statementCopy } from '@/lib/account-statement/presentation';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate } from '@/lib/format/date';
import { Input } from '@/components/ui/input';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { parseMoneyInput } from '@/lib/format/money';
import { FormModal } from '@/components/shared/form-modal';
import { CurrencySelect } from '@/components/shared/currency-select';
import { BillablePlanField, BillablePlansEmpty } from './billable-plan-field';
import { useBillablePlans } from './use-billable-plans';
import { usePaymentLocationHint } from './use-payment-location-hint';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { SedeConfigError } from '@/components/locations/sede-config-error';

// Copy como constantes (i18n-ready).
const copy = {
  title: 'Registrar abono',
  description: 'El abono se aplica al plan que elijas y aparece en la caja de hoy.',
  // QA D2: con saldos migrados pendientes, el destino puede ser uno de ellos.
  descriptionWithOpenings: 'El abono se aplica al plan o al saldo migrado que elijas y aparece en la caja de hoy.',
  submit: 'Registrar abono',
  amount: 'Importe',
  currency: 'Moneda',
  method: 'Método',
  methodNone: 'Sin especificar',
  date: 'Fecha de pago',
  invalidAmount: 'Escribe un importe mayor que 0.',
  invalidDate: 'Elige la fecha de pago.',
  recorded: (amount: string, date: string, plan: string) =>
    `Abono registrado: ${amount} · ${date} · ${plan}.`,
  // DX-262: destino del abono cuando el paciente trae saldo migrado.
  target: 'Abonar a',
  targetPlan: 'Un plan de tratamiento',
  targetOpening: (concept: string, pending: string) =>
    `Saldo migrado · ${concept} · pendiente ${pending}`,
  openingLabel: (concept: string) => `Saldo migrado · ${concept}`,
  openingPending: (pending: string) => `Pendiente: ${pending}`,
  overPending: (pending: string) =>
    `El abono supera lo pendiente del saldo migrado: quedan ${pending}.`,
};

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
  method: PaymentMethod | '';
  date: string;
}

/** `today`: hoy en la zona de la sede (DX-097), no en la del navegador. */
function initialForm(today: string): FormState {
  return {
    target: '',
    planId: '',
    amount: '',
    currency: '',
    method: '',
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
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : '';
  const [form, setForm] = useState<FormState>(() => initialForm(today));
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

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

  function patch(next: Partial<FormState>) {
    setForm((f) => ({ ...f, ...next }));
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
      setAmountError(copy.overPending(formatCurrency(opening.pending, opening.currency)));
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
    setSubmitting(true);
    try {
      const body = {
        amount,
        currency,
        paidAt,
        ...(form.method ? { method: form.method } : {}),
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
      onRecorded(
        copy.recorded(
          formatCurrency(saved.amount, saved.currency),
          formatCivilDate(saved.paidOn),
          savedOpening
            ? copy.openingLabel(savedOpening.concept)
            : savedPlan
              ? statementCopy.planLabel(savedPlan.createdAt)
              : '',
        ),
      );
    } catch (err) {
      // La clave NO cambia: el reintento de este mismo abono la reusa y el
      // servidor lo deduplica en vez de cobrar dos veces.
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
      submitLabel={copy.submit}
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
                {copy.targetOpening(o.concept, formatCurrency(o.pending, o.currency))}
              </option>
            ))}
          </select>
          {opening ? (
            <p id="rp-target-hint" className="mt-1 text-xs text-muted tabular-nums">
              {copy.openingPending(formatCurrency(opening.pending, opening.currency))}
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
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField htmlFor="rp-method" label={copy.method}>
                  <select
                    id="rp-method"
                    value={form.method}
                    onChange={(e) => patch({ method: e.target.value as PaymentMethod | '' })}
                    className={fieldClass}
                  >
                    <option value="">{copy.methodNone}</option>
                    {PAYMENT_METHOD_OPTIONS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </option>
                    ))}
                  </select>
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
            </>
          ) : null}
        </>
      )}
    </FormModal>
  );
}
