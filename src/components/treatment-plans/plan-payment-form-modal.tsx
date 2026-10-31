'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { parseMoneyInput } from '@/lib/format/money';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { readyTimeZone, sedeToday, type SedeZoneState } from '@/lib/locations/use-sede-time-zone';
import { recordPayment, type PlanBalance, type RecordPaymentInput } from '@/lib/payments/payments-api';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { CurrencySelect } from '@/components/shared/currency-select';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { MoneyInput } from '@/components/shared/money-input';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import {
  PaymentMethodSelect,
  PaymentReferenceFields,
  paymentMethodFieldsCopy,
  usePaymentMethodFields,
} from '@/components/payments/payment-method-fields';
import { PaymentRatePreview } from '@/components/payments/payment-rate-preview';
import { useExchangeRates } from '@/components/payments/use-exchange-rates';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { copy } from './treatment-plans-tab-copy';

interface PlanPaymentFormModalProps {
  token: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** El plan (con detalle): su moneda es la sugerida y la de referencia de la tasa. */
  plan: TreatmentPlan;
  planBalance: PlanBalance;
  /** DX-097: la zona de la sede da el «hoy» por defecto. */
  sedeZone: SedeZoneState;
  /** DX-378: formato de la sede para la vista previa de la tasa. */
  sedeFmt: RegionalFormat | null;
  /** A qué sede queda atribuido el abono (nada con una sola sede). */
  locationHint: string | null;
  /** Tras registrar: refresca saldo y abonos (se espera antes de soltar el botón). */
  onRecorded: () => Promise<unknown>;
}

/**
 * «Registrar abono» desde el plan. La pestaña lo monta con una `key` nueva en
 * cada apertura: el formulario empieza limpio (moneda del plan, fecha de hoy
 * en la sede) y con una Idempotency-Key nueva, que se conserva mientras esté
 * abierto — reintentar el MISMO envío tras un fallo de red no cobra dos veces.
 */
export function PlanPaymentFormModal({
  token,
  open,
  onOpenChange,
  plan,
  planBalance,
  sedeZone,
  sedeFmt,
  locationHint,
  onRecorded,
}: PlanPaymentFormModalProps) {
  const sedeTimeZone = readyTimeZone(sedeZone);
  // DX-377: medio de la clínica, referencia y aviso de repetida (el mismo que
  // «Registrar abono» del estado de cuenta).
  const paymentMethodFields = usePaymentMethodFields(token, open);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [paymentAmount, setPaymentAmount] = useState('');
  // GLOBAL-G1 (R14): la del plan, sin moneda de reserva.
  const [paymentCurrency, setPaymentCurrency] = useState(plan.currency);
  // DX-097: hoy en la zona de la sede, no en la del navegador.
  const [paymentDate, setPaymentDate] = useState(() => (sedeTimeZone ? sedeToday(sedeTimeZone) : ''));
  // La zona llega después de abrir el formulario: la fecha vacía pasa a «hoy».
  const [prevSedeTimeZone, setPrevSedeTimeZone] = useState(sedeTimeZone);
  if (sedeTimeZone !== prevSedeTimeZone) {
    setPrevSedeTimeZone(sedeTimeZone);
    if (sedeTimeZone && paymentDate === '') setPaymentDate(sedeToday(sedeTimeZone));
  }
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  // DX-241: el motivo de un monto que no vale va junto al campo (escalón 4).
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // DX-376: cobrar en otra moneda que la del plan enseña, antes de guardar, la
  // tasa del día del abono, cuánto cubre y lo que queda pendiente.
  const inOtherCurrency = paymentCurrency !== '' && paymentCurrency !== plan.currency;
  const rates = useExchangeRates(token, paymentDate, open && inOtherCurrency);
  const parsedAmount = paymentCurrency ? parseMoneyInput(paymentAmount, paymentCurrency) : null;
  const previewAmount = parsedAmount?.ok && parsedAmount.value > 0 ? parsedAmount.value : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationError(null);
    setAmountError(null);
    setSubmitError(null);

    const currencyValue = paymentCurrency.trim().toUpperCase();
    if (!currencyValue) {
      setValidationError(copy.invalidPaymentCurrency);
      return;
    }
    // DX-241: la lectura común de los campos de dinero, con los decimales de
    // la moneda del abono.
    const parsed = parseMoneyInput(paymentAmount, currencyValue);
    if (!parsed.ok || parsed.value <= 0) {
      setAmountError(parsed.ok || parsed.reason === 'empty' ? copy.invalidPaymentAmount : parsed.message);
      return;
    }
    if (!paymentDate) {
      setValidationError(copy.invalidPaymentDate);
      return;
    }
    // DX-395: la referencia o el motivo que faltan se marcan en su campo,
    // que recibe el foco.
    if (!paymentMethodFields.validate()) return;

    setSubmitting(true);
    try {
      const input: RecordPaymentInput = {
        amount: parsed.value,
        currency: currencyValue,
        // DX-097: el DÍA elegido; la API lo guarda al mediodía de la sede.
        paidAt: paymentDate,
        ...paymentMethodFields.body(),
        ...(paymentNotes.trim() ? { notes: paymentNotes.trim() } : {}),
      };
      await recordPayment(token, plan.id, input, idempotencyKey);
      onOpenChange(false);
      await onRecorded();
    } catch (err) {
      // La clave NO rota aquí: reintentar este mismo envío debe reutilizarla
      // para que el backend lo deduplique en vez de cobrar dos veces.
      // DX-377: la referencia repetida se avisa junto al campo y pide motivo.
      if (paymentMethodFields.catchDuplicate(err)) return;
      // Un 400 técnico (importe/moneda) se dice en español (apiErrorMessage).
      setSubmitError(apiErrorMessage(err, copy.genericAddPaymentError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.registerPayment}
      onSubmit={handleSubmit}
      submitLabel={paymentMethodFields.duplicate ? paymentMethodFieldsCopy.duplicateSubmit : copy.addPaymentSubmit}
      submitting={submitting}
      error={validationError ?? submitError}
      size="lg"
      touchTargets
    >
      {/* Va antes de los campos: la sede a la que se atribuye el abono se lee
          ANTES de escribir el monto, no como una nota al pie ya con el dedo en
          «Registrar abono». */}
      {locationHint ? <p className="t-label text-muted">{locationHint}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="tp-payment-amount" label={copy.paymentAmountLabel} error={amountError}>
          <MoneyInput
            id="tp-payment-amount"
            currency={paymentCurrency}
            requirePositive
            value={paymentAmount}
            onValueChange={(text) => {
              setPaymentAmount(text);
              setAmountError(null);
            }}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? fieldErrorId('tp-payment-amount') : undefined}
          />
        </FormField>

        <FormField htmlFor="tp-payment-currency" label={copy.paymentCurrencyLabel}>
          <CurrencySelect id="tp-payment-currency" token={token} value={paymentCurrency} onChange={setPaymentCurrency} />
        </FormField>
      </div>

      {inOtherCurrency ? (
        <PaymentRatePreview
          state={rates}
          amount={previewAmount}
          paymentCurrency={paymentCurrency}
          planCurrency={plan.currency}
          planBalance={{
            balance: planBalance.balance,
            paymentsWithoutRate: planBalance.paymentsWithoutRate.length,
          }}
          date={paymentDate}
          fmt={sedeFmt}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="tp-payment-date" label={copy.paymentDateLabel}>
          {sedeZone.status === 'error' && paymentDate === '' ? (
            <SedeConfigError kind="timeZone" variant="field" retryId="tp-payment-date" onRetry={sedeZone.retry} />
          ) : (
            <DatePicker
              id="tp-payment-date"
              name="tp-payment-date"
              value={paymentDate || null}
              onChange={(next) => setPaymentDate(next ?? '')}
            />
          )}
        </FormField>

        <PaymentMethodSelect fields={paymentMethodFields} id="tp-payment-method" label={copy.paymentMethodLabel} />
      </div>

      <PaymentReferenceFields fields={paymentMethodFields} idPrefix="tp-payment" />

      <FormField htmlFor="tp-payment-notes" label={copy.paymentNotesLabel}>
        <Textarea
          id="tp-payment-notes"
          rows={2}
          autoGrow
          value={paymentNotes}
          onChange={(e) => setPaymentNotes(e.target.value)}
        />
      </FormField>
    </FormModal>
  );
}
