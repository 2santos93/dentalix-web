'use client';
import * as React from 'react';
import { useState } from 'react';
import { recordPayment, type PaymentMethod } from '@/lib/payments/payments-api';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from '@/lib/payments/payment-method';
import { recordPaymentErrorMessage } from '@/lib/payments/payment-errors';
import { statementCopy } from '@/lib/account-statement/presentation';
import { formatCurrency } from '@/lib/format/currency';
import { formatCivilDate } from '@/lib/format/date';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { CurrencySelect } from '@/components/shared/currency-select';
import { BillablePlanField, BillablePlansEmpty } from './billable-plan-field';
import { useBillablePlans } from './use-billable-plans';
import { usePaymentLocationHint } from './use-payment-location-hint';

// Copy como constantes (i18n-ready).
const copy = {
  title: 'Registrar abono',
  description: 'El abono se aplica al plan que elijas y aparece en la caja de hoy.',
  submit: 'Registrar abono',
  amount: 'Importe',
  currency: 'Moneda',
  method: 'Método',
  methodNone: 'Sin especificar',
  date: 'Fecha de pago',
  invalidAmount: 'Ingresa un importe mayor que 0.',
  invalidDate: 'Elige la fecha de pago.',
  recorded: (amount: string, date: string, plan: string) =>
    `Abono registrado: ${amount} · ${date} · ${plan}.`,
};

// <select> nativo con el aspecto del átomo Input (misma cadena que el resto de
// formularios de pagos).
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

function todayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface FormState {
  /** `''` = el primer plan de la lista (llega después de abrir). */
  planId: string;
  amount: string;
  /** `''` = la moneda del plan elegido. */
  currency: string;
  method: PaymentMethod | '';
  date: string;
}

function initialForm(): FormState {
  return { planId: '', amount: '', currency: '', method: '', date: todayLocalDateString() };
}

interface RecordPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** Tras registrar, con el aviso a enseñar: quien abre cierra y recarga. */
  onRecorded: (notice: string) => void;
}

/**
 * «Registrar abono» desde el estado de cuenta (DX-067): quien cobra elige el
 * plan entre los cobrables del paciente (`GET /patients/:id/billable-plans`, sin
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
  onRecorded,
}: RecordPaymentModalProps) {
  const billable = useBillablePlans(token, patientId, open);
  const locationHint = usePaymentLocationHint(token, open);
  const [form, setForm] = useState<FormState>(initialForm);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ajuste durante el render: cada apertura empieza de cero, con clave nueva.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(initialForm());
      setIdempotencyKey(crypto.randomUUID());
      setError(null);
    }
  }

  const plans = billable.plans ?? [];
  const plan = plans.find((p) => p.id === form.planId) ?? plans[0] ?? null;
  const currency = form.currency || plan?.currency || '';
  const noPlans = billable.plans !== null && plans.length === 0;

  function patch(next: Partial<FormState>) {
    setForm((f) => ({ ...f, ...next }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!plan) return;
    setError(null);
    const amount = Number(form.amount.trim());
    if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError(copy.invalidAmount);
      return;
    }
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
      const saved = await recordPayment(
        token,
        plan.id,
        {
          amount,
          currency,
          paidAt,
          ...(form.method ? { method: form.method } : {}),
        },
        idempotencyKey,
      );
      // El aviso sale de lo que la API GUARDÓ, no del formulario: si un envío
      // anterior con esta misma clave sí se registró (respuesta perdida) y la
      // persona cambió los datos antes de reintentar, la API devuelve el abono
      // original y es ese el que hay que anunciar.
      const savedPlan = plans.find((p) => p.id === saved.treatmentPlanId) ?? plan;
      onRecorded(
        copy.recorded(
          formatCurrency(saved.amount, saved.currency),
          formatCivilDate(saved.paidAt),
          statementCopy.planLabel(savedPlan.createdAt),
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
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={plan === null}
      error={error}
      size="lg"
    >
      {/* La sede a la que se atribuye se lee antes de escribir el importe. */}
      {locationHint && !noPlans ? <p className="t-label text-muted">{locationHint}</p> : null}

      {noPlans ? (
        <BillablePlansEmpty />
      ) : (
        <>
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
          {plan ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField htmlFor="rp-amount" label={copy.amount}>
                  <Input
                    id="rp-amount"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => patch({ amount: e.target.value })}
                    className="tabular-nums"
                  />
                </FormField>
                <FormField htmlFor="rp-currency" label={copy.currency}>
                  <CurrencySelect
                    id="rp-currency"
                    token={token}
                    value={currency}
                    onChange={(code) => patch({ currency: code })}
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
                  <Input
                    id="rp-date"
                    type="date"
                    value={form.date}
                    onChange={(e) => patch({ date: e.target.value })}
                    className="tabular-nums"
                  />
                </FormField>
              </div>
            </>
          ) : null}
        </>
      )}
    </FormModal>
  );
}
