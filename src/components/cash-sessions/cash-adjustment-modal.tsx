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
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { parseMoneyInput } from '@/lib/format/money';
import { CurrencySelect } from '@/components/shared/currency-select';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

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
  invalidAmount: 'Escribe un importe mayor que 0.',
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
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // DX-241: la lectura común de los campos de dinero; el signo lo da el tipo.
    const parsed = parseMoneyInput(amount, currency);
    if (!parsed.ok || parsed.value <= 0) {
      setAmountError(parsed.ok || parsed.reason === 'empty' ? copy.invalidAmount : parsed.message);
      return;
    }
    const value = parsed.value;
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
      touchTargets
    >
      <FormField htmlFor={`${id}-sign`} label={copy.direction}>
        <NativeSelect
          id={`${id}-sign`}
          value={sign}
          disabled={submitting}
          onChange={(e) => setSign(e.target.value === '1' ? 1 : -1)}
        >
          <option value={-1}>{copy.subtract}</option>
          <option value={1}>{copy.add}</option>
        </NativeSelect>
      </FormField>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField htmlFor={`${id}-amount`} label={copy.amount} error={amountError}>
          <MoneyInput
            id={`${id}-amount`}
            currency={currency}
            requirePositive
            value={amount}
            disabled={submitting}
            onValueChange={(text) => {
              setAmount(text);
              setAmountError(null);
            }}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? fieldErrorId(`${id}-amount`) : undefined}
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
          <NativeSelect
            id={`${id}-method`}
            value={method}
            disabled={submitting}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField
        htmlFor={`${id}-reason`}
        label={copy.reason}
        hint={copy.reasonHint}
        hintId={`${id}-reason-hint`}
        error={validation}
      >
        <Textarea
          id={`${id}-reason`}
          rows={3}
          autoGrow
          maxLength={CASH_REASON_MAX}
          value={reason}
          disabled={submitting}
          aria-invalid={validation ? true : undefined}
          aria-describedby={validation ? fieldErrorId(`${id}-reason`) : `${id}-reason-hint`}
          onChange={(e) => {
            setReason(e.target.value);
            setValidation(null);
          }}
          className="max-h-48"
        />
      </FormField>
    </FormModal>
  );
}
