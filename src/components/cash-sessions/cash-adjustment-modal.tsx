'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  addCashAdjustment,
  CASH_REASON_MAX,
  CASH_REASON_MIN,
  type CashAdjustment,
} from '@/lib/cash-sessions/cash-sessions-api';
import type { PaymentMethod } from '@/lib/payments/payments-api';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from '@/lib/payments/payment-method';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { CurrencySelect } from '@/components/shared/currency-select';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/errors/inline-error';
import { fieldClass } from '@/lib/ui/field-class';

const copy = {
  title: 'Corregir el cierre',
  description:
    'El cierre no cambia: la corrección es un ajuste con motivo que cuenta en tu caja abierta de esta sede o, si no tienes, en la siguiente que se abra aquí.',
  direction: 'Tipo de ajuste',
  add: 'Suma (faltó registrar dinero)',
  subtract: 'Resta (sobró o se devolvió dinero)',
  amount: 'Importe',
  currency: 'Moneda',
  method: 'Método',
  reason: 'Motivo',
  reasonHint: `Entre ${CASH_REASON_MIN} y ${CASH_REASON_MAX} caracteres.`,
  invalidAmount: 'Escribe un importe mayor que 0, con como mucho 2 decimales.',
  tooShort: `Escribe el motivo (al menos ${CASH_REASON_MIN} caracteres).`,
  submit: 'Registrar ajuste',
  genericError: 'No pudimos registrar el ajuste. Intenta de nuevo.',
};

interface CashAdjustmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  sessionId: string;
  defaultCurrency: string;
  onCreated: (adjustment: CashAdjustment) => void;
}

/** Corrección de un cierre (DX-027): solo ADMIN, un ajuste con motivo y autor. */
export function CashAdjustmentModal({
  open,
  onOpenChange,
  token,
  sessionId,
  defaultCurrency,
  onCreated,
}: CashAdjustmentModalProps) {
  const id = useId();
  const [sign, setSign] = useState<1 | -1>(-1);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = amount.trim().replace(',', '.');
    const value = /^\d+(\.\d{1,2})?$/.test(text) ? Number(text) : 0;
    if (value <= 0) {
      setValidation(copy.invalidAmount);
      return;
    }
    if (reason.trim().length < CASH_REASON_MIN) {
      setValidation(copy.tooShort);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      onCreated(
        await addCashAdjustment(token, sessionId, {
          currency,
          method,
          amount: sign * value,
          reason: reason.trim(),
        }),
      );
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
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
      error={error}
    >
      <FormField htmlFor={`${id}-sign`} label={copy.direction}>
        <select
          id={`${id}-sign`}
          value={sign}
          disabled={submitting}
          onChange={(e) => setSign(Number(e.target.value) === 1 ? 1 : -1)}
          className={`${fieldClass} h-10`}
        >
          <option value={-1}>{copy.subtract}</option>
          <option value={1}>{copy.add}</option>
        </select>
      </FormField>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField htmlFor={`${id}-amount`} label={copy.amount}>
          <Input
            id={`${id}-amount`}
            inputMode="decimal"
            value={amount}
            disabled={submitting}
            onChange={(e) => {
              setAmount(e.target.value);
              setValidation(null);
            }}
            className="tabular-nums"
          />
        </FormField>
        <FormField htmlFor={`${id}-currency`} label={copy.currency}>
          <CurrencySelect
            id={`${id}-currency`}
            token={token}
            value={currency}
            onChange={setCurrency}
            disabled={submitting}
          />
        </FormField>
        <FormField htmlFor={`${id}-method`} label={copy.method}>
          <select
            id={`${id}-method`}
            value={method}
            disabled={submitting}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className={`${fieldClass} h-10`}
          >
            {PAYMENT_METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <FormField htmlFor={`${id}-reason`} label={copy.reason} hint={copy.reasonHint}>
        <textarea
          id={`${id}-reason`}
          rows={3}
          maxLength={CASH_REASON_MAX}
          value={reason}
          disabled={submitting}
          onChange={(e) => {
            setReason(e.target.value);
            setValidation(null);
          }}
          className={fieldClass}
        />
      </FormField>
      {validation ? <InlineError>{validation}</InlineError> : null}
    </FormModal>
  );
}
