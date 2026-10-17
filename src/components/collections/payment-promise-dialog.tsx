'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { createPaymentPromise, type PaymentPromise } from '@/lib/collections/collections-api';
import { todayLocal } from '@/lib/collections/presentation';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Input } from '@/components/ui/input';
import { toolbarFieldClass } from '@/components/shared/list-toolbar';
import { CurrencySelect } from '@/components/shared/currency-select';

export const promiseDialogCopy = {
  title: 'Compromiso de pago',
  description: (name: string) =>
    `Lo que ${name} se compromete a pagar y para cuándo. Se marca «Cumplido» al registrar abonos por ese importe hasta esa fecha, e «Incumplido» al día siguiente si no.`,
  amount: 'Importe',
  currency: 'Moneda',
  dueDate: 'Pagará hasta el',
  submit: 'Guardar compromiso',
  amountRequired: 'Escribe un importe mayor que 0.',
  amountInvalid: 'El importe admite hasta 2 decimales.',
  dueDateRequired: 'Elige la fecha del compromiso.',
  currencyRequired: 'Elige la moneda.',
  dueDatePast: 'La fecha no puede ser anterior a hoy.',
  saveError: 'No pudimos guardar el compromiso. Intenta de nuevo.',
};

function parseAmount(text: string): number | null {
  const normalized = text.replace(/\./g, '').replace(',', '.').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

interface PaymentPromiseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patient: { id: string; fullName: string };
  /** Monedas de la deuda del paciente; la primera es la propuesta. */
  currencies: string[];
  onSaved: (promise: PaymentPromise) => void;
}

/**
 * «Compromiso de pago» (DX-150): importe, moneda y fecha. Uno abierto por
 * paciente (la API responde 409 con el motivo en español). No se edita: se
 * cierra solo al cumplirse o al vencer.
 */
export function PaymentPromiseDialog({
  open,
  onOpenChange,
  token,
  patient,
  currencies,
  onSaved,
}: PaymentPromiseDialogProps) {
  const options = currencies;
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState(options[0] ?? '');
  const [dueDate, setDueDate] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; currency?: string; dueDate?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAmountText('');
      setCurrency(options[0] ?? '');
      setDueDate('');
      setErrors({});
      setSubmitError(null);
    }
  }

  const today = todayLocal();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    const amount = parseAmount(amountText);
    if (amountText.trim() === '') next.amount = promiseDialogCopy.amountRequired;
    else if (amount === null) next.amount = promiseDialogCopy.amountInvalid;
    else if (amount <= 0) next.amount = promiseDialogCopy.amountRequired;
    if (!currency) next.currency = promiseDialogCopy.currencyRequired;
    if (!dueDate) next.dueDate = promiseDialogCopy.dueDateRequired;
    else if (dueDate < today) next.dueDate = promiseDialogCopy.dueDatePast;
    setErrors(next);
    if (Object.keys(next).length > 0 || amount === null) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const promise = await createPaymentPromise(token, patient.id, { amount, currency, dueDate });
      onSaved(promise);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(apiErrorMessage(err, { fallback: promiseDialogCopy.saveError }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={promiseDialogCopy.title}
      description={promiseDialogCopy.description(patient.fullName)}
      onSubmit={(e) => void submit(e)}
      submitLabel={promiseDialogCopy.submit}
      submitting={submitting}
      error={submitError}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField htmlFor="pp-amount" label={promiseDialogCopy.amount} error={errors.amount}>
          <Input
            id="pp-amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? fieldErrorId('pp-amount') : undefined}
            className="tabular-nums"
          />
        </FormField>
        <FormField htmlFor="pp-currency" label={promiseDialogCopy.currency} error={errors.currency}>
          {options.length > 0 ? (
            <select
              id="pp-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={toolbarFieldClass}
            >
              {options.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          ) : (
            // Sin deuda conocida (la ficha de un paciente al día): todas las monedas.
            <CurrencySelect id="pp-currency" token={token} value={currency} onChange={setCurrency} />
          )}
        </FormField>
      </div>
      <FormField htmlFor="pp-due" label={promiseDialogCopy.dueDate} error={errors.dueDate}>
        <Input
          id="pp-due"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-invalid={errors.dueDate ? true : undefined}
          aria-describedby={errors.dueDate ? fieldErrorId('pp-due') : undefined}
          className="tabular-nums"
        />
      </FormField>
    </FormModal>
  );
}
