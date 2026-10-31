'use client';
import * as React from 'react';
import { useMemo, useRef, useState } from 'react';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { MoneyInput } from '@/components/shared/money-input';
import { apiErrorMessage } from '@/lib/api/error-message';
import { formatCurrency } from '@/lib/format/currency';
import { parseMoneyInput } from '@/lib/format/money';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import { transferCredit } from '@/lib/patient-credit/patient-credit-api';
import type { AccountStatementPlan } from '@/lib/account-statement/account-statement-api';
import { creditPreviewCopy, type CreditSource } from './credit-balance';
import { CreditPreview } from './credit-preview';

const copy = {
  title: 'Aplicar saldo a favor a otro plan',
  description:
    'El saldo pasa a otro plan vivo del mismo paciente, en la misma moneda. Los abonos originales no cambian.',
  target: 'Plan de destino',
  noTargets:
    'Este paciente no tiene otro plan vivo en esta moneda. Crea o acepta un plan para aplicarle el saldo.',
  amount: 'Importe a aplicar',
  reason: 'Nota (opcional)',
  reasonTooShort: 'La nota, si la escribes, necesita al menos 3 caracteres.',
  invalidAmount: 'Escribe un importe mayor que 0.',
  overCredit: (max: string) => `No puede superar el saldo a favor (${max}).`,
  submit: 'Aplicar al plan',
  failed: 'No pudimos aplicar el saldo a favor.',
  done: (amount: string, plan: string) => `Saldo a favor aplicado: ${amount} a ${plan}.`,
};

interface CreditTransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  source: CreditSource;
  /** Planes vivos del paciente en la moneda del origen (sin el origen). */
  targets: AccountStatementPlan[];
  planName: (planId: string) => string;
  onDone: (notice: string) => void;
}

/**
 * «Aplicar a otro plan» (DX-253): elige el plan de destino y el importe, con
 * la vista previa del saldo a favor que queda y del saldo del destino. Una
 * Idempotency-Key por intento: reenviar tras un fallo de red no duplica.
 */
export function CreditTransferModal({
  open,
  onOpenChange,
  token,
  source,
  targets,
  planName,
  onDone,
}: CreditTransferModalProps) {
  const [targetId, setTargetId] = useState(targets[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const key = useRef<{ body: string; key: string } | null>(null);
  const target = targets.find((t) => t.id === targetId) ?? null;
  const parsed = parseMoneyInput(amount, source.currency);
  const value = parsed.ok ? parsed.value : 0;
  const preview = useMemo(
    () =>
      target
        ? [
            {
              label: creditPreviewCopy.creditLeft,
              value: formatCurrency(Math.max(0, source.credit - value), source.currency),
            },
            {
              label: creditPreviewCopy.targetBalance(planName(target.id)),
              value: formatCurrency(target.balance - value, source.currency),
            },
          ]
        : [],
    [target, source, value, planName],
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    if (!parsed.ok || parsed.value <= 0) {
      setAmountError(parsed.ok || parsed.reason === 'empty' ? copy.invalidAmount : parsed.message);
      return;
    }
    if (Math.round(parsed.value * 100) > Math.round(source.credit * 100)) {
      setAmountError(copy.overCredit(formatCurrency(source.credit, source.currency)));
      return;
    }
    setAmountError(null);
    // La API exige de 3 a 500 caracteres si llega nota.
    const note = reason.trim();
    if (note.length > 0 && note.length < 3) {
      setReasonError(copy.reasonTooShort);
      return;
    }
    setError(null);
    const body = {
      targetPlanId: target.id,
      amount: parsed.value,
      currency: source.currency,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };
    const fingerprint = JSON.stringify(body);
    if (key.current?.body !== fingerprint) {
      key.current = { body: fingerprint, key: crypto.randomUUID() };
    }
    setSubmitting(true);
    try {
      await transferCredit(token, source.planId, body, key.current.key);
      onDone(copy.done(formatCurrency(parsed.value, source.currency), planName(target.id)));
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: copy.failed }));
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
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={!target}
      error={error}
    >
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink tabular-nums">
        {creditPreviewCopy.source(planName(source.planId), formatCurrency(source.credit, source.currency))}
      </p>
      {targets.length === 0 ? (
        <p role="note" className="text-sm text-muted">
          {copy.noTargets}
        </p>
      ) : (
        <>
          <FormField htmlFor="ct-target" label={copy.target}>
            <select
              id="ct-target"
              value={targetId}
              disabled={submitting}
              onChange={(e) => setTargetId(e.target.value)}
              className={cn(fieldClass, 'h-10')}
            >
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {`${planName(t.id)} · ${creditPreviewCopy.balance(formatCurrency(t.balance, t.currency))}`}
                </option>
              ))}
            </select>
          </FormField>
          <FormField htmlFor="ct-amount" label={copy.amount} error={amountError}>
            <MoneyInput
              id="ct-amount"
              currency={source.currency}
              requirePositive
              value={amount}
              disabled={submitting}
              onValueChange={(next) => {
                setAmount(next);
                setAmountError(null);
              }}
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? fieldErrorId('ct-amount') : undefined}
            />
          </FormField>
          <FormField htmlFor="ct-reason" label={copy.reason} error={reasonError}>
            <textarea
              id="ct-reason"
              rows={2}
              maxLength={500}
              value={reason}
              disabled={submitting}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(null);
              }}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? fieldErrorId('ct-reason') : undefined}
              className={cn(fieldClass, reasonError && 'border-danger')}
            />
          </FormField>
          <CreditPreview rows={preview} />
        </>
      )}
    </FormModal>
  );
}
