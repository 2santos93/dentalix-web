'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { addExpensePayment, type ExpenseDetail } from '@/lib/expenses/expenses-api';
import { formatCurrency } from '@/lib/format/currency';
import { moneyInputText, parseMoneyInput } from '@/lib/format/money';
import { useExpenseToday } from './use-expense-today';
import { SectionError } from '@/components/errors/section-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { MoneyInput } from '@/components/shared/money-input';
import {
  ExpensePaymentFields,
  paidOnError,
  paymentBody,
  type ExpensePaymentValue,
} from './expense-payment-fields';

export const expensePaymentCopy = {
  title: 'Registrar pago',
  description: (pending: string) => `Pendiente: ${pending}. Puede ser un pago parcial.`,
  amount: (currency: string) => `Importe (${currency})`,
  submit: 'Registrar pago',
  amountRequired: 'Escribe un importe mayor que 0.',
  overPending: (pending: string) => `El pago supera lo pendiente del gasto (${pending}).`,
  saveError: 'No pudimos registrar el pago. Intenta de nuevo.',
  saved: (amount: string) => `Pago de ${amount} registrado.`,
};

interface ExpensePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  expense: ExpenseDetail;
  /** Hoy en la sede del gasto. */
  today?: string;
  onSaved: (expense: ExpenseDetail, notice: string) => void;
  /** A dónde va el foco al cerrar si el botón que abrió el modal ya no está. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * «Registrar pago» de un gasto (DX-274): total o parcial, con el pendiente
 * propuesto; «Desde mi caja abierta» lo saca del cajón (R1). Se monta con
 * `key` por apertura: clave de idempotencia nueva cada vez y la misma en cada
 * reintento del mismo envío.
 */
export function ExpensePaymentModal({
  open,
  onOpenChange,
  token,
  expense,
  today: suppliedToday,
  onSaved,
  onCloseAutoFocus,
}: ExpensePaymentModalProps) {
  const configured = useExpenseToday(token, expense.locationId, open && !suppliedToday);
  const today = suppliedToday ?? configured.today;
  const [amount, setAmount] = useState(() => moneyInputText(expense.pendingAmount));
  const [payment, setPayment] = useState<ExpensePaymentValue>({ method: 'CASH', paidOn: today ?? '', fromCashSession: false });
  const [amountError, setAmountError] = useState<string | null>(null);
  const [paidOnErrorText, setPaidOnErrorText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [lastToday, setLastToday] = useState<string | null>(null);
  if (today && today !== lastToday) {
    setLastToday(today);
    setPayment((value) => ({ ...value, paidOn: value.paidOn || today }));
  }
  const pending = formatCurrency(expense.pendingAmount, expense.currency);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!today) return;
    const parsed = parseMoneyInput(amount, expense.currency);
    let nextAmountError: string | null = null;
    if (!parsed.ok) nextAmountError = parsed.reason === 'empty' ? expensePaymentCopy.amountRequired : parsed.message;
    else if (parsed.value <= 0) nextAmountError = expensePaymentCopy.amountRequired;
    else if (Math.round(parsed.value * 100) > Math.round(expense.pendingAmount * 100)) {
      nextAmountError = expensePaymentCopy.overPending(pending);
    }
    const nextPaidOnError = paidOnError(payment, today);
    setAmountError(nextAmountError);
    setPaidOnErrorText(nextPaidOnError);
    if (nextAmountError || nextPaidOnError || !parsed.ok) return;
    setSubmitting(true);
    try {
      const saved = await addExpensePayment(
        token,
        expense.id,
        { amount: parsed.value, ...paymentBody(payment) },
        idempotencyKey,
      );
      onSaved(saved, expensePaymentCopy.saved(formatCurrency(parsed.value, expense.currency)));
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: expensePaymentCopy.saveError }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={expensePaymentCopy.title}
      description={expensePaymentCopy.description(pending)}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={expensePaymentCopy.submit}
      submitting={submitting}
      submitDisabled={!today}
      error={error}
      touchTargets
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {configured.error ? <SectionError description={configured.error} onRetry={configured.retry} /> : null}
      <FormField htmlFor="expense-pay-amount" label={expensePaymentCopy.amount(expense.currency)} error={amountError}>
        <MoneyInput
          id="expense-pay-amount"
          currency={expense.currency}
          requirePositive
          value={amount}
          disabled={submitting}
          onValueChange={(text) => {
            setAmount(text);
            setAmountError(null);
          }}
          aria-invalid={amountError ? true : undefined}
          aria-describedby={amountError ? fieldErrorId('expense-pay-amount') : undefined}
        />
      </FormField>
      <ExpensePaymentFields
        idPrefix="expense-pay"
        value={payment}
        onChange={(next) => {
          setPayment(next);
          setPaidOnErrorText(null);
        }}
        today={today ?? ''}
        paidOnErrorText={paidOnErrorText}
        disabled={submitting}
      />
    </FormModal>
  );
}
