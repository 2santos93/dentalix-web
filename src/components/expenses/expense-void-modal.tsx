'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { EXPENSE_VOID_REASON_MAX, EXPENSE_VOID_REASON_MIN } from '@/lib/expenses/presentation';
import { InlineError } from '@/components/errors/inline-error';
import { FormModal } from '@/components/shared/form-modal';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

export const expenseVoidCopy = {
  expense: {
    title: '¿Anular este gasto?',
    description:
      'El gasto y todos sus pagos dejan de contar, pero siguen en la lista, tachados, con quién lo anuló y por qué. Las salidas de una caja ya cerrada se devuelven como ajuste en tu caja abierta o, si no tienes una, en la próxima caja de la sede.',
    submit: 'Anular gasto',
  },
  payment: {
    title: '¿Anular este pago?',
    description:
      'El pago deja de contar y lo pendiente del gasto vuelve a subir. Si salió de una caja abierta, deja de restar en su arqueo; si la caja ya cerró, se devuelve como ajuste en tu caja abierta o, si no tienes una, en la próxima caja de la sede.',
    submit: 'Anular pago',
  },
  reasonLabel: 'Motivo de la anulación',
  reasonHint: `Entre ${EXPENSE_VOID_REASON_MIN} y ${EXPENSE_VOID_REASON_MAX} caracteres.`,
  reasonTooShort: `Escribe el motivo (al menos ${EXPENSE_VOID_REASON_MIN} caracteres).`,
  counter: (n: number) => `${n}/${EXPENSE_VOID_REASON_MAX}`,
};

interface ExpenseVoidModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'expense' | 'payment';
  /** Qué se anula, p. ej. «Laboratorio · 150.000,00 COP · 20/10/2026». */
  subject: string;
  /** Recibe el motivo ya recortado y válido. */
  onConfirm: (reason: string) => void;
  submitting: boolean;
  error: string | null;
  /** A dónde va el foco al cerrar si el botón que abrió el modal ya no está. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Anular un gasto o uno de sus pagos (DX-274): motivo obligatorio, que queda
 * junto a quién y cuándo. Se monta con una `key` por apertura para empezar en
 * blanco.
 */
export function ExpenseVoidModal({
  open,
  onOpenChange,
  kind,
  subject,
  onConfirm,
  submitting,
  error,
  onCloseAutoFocus,
}: ExpenseVoidModalProps) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const text = expenseVoidCopy[kind];

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (Array.from(trimmed).length < EXPENSE_VOID_REASON_MIN) {
      setValidationError(expenseVoidCopy.reasonTooShort);
      return;
    }
    setValidationError(null);
    onConfirm(trimmed);
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={text.title}
      description={text.description}
      onSubmit={handleSubmit}
      submitLabel={text.submit}
      submitting={submitting}
      error={error}
      destructive
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink tabular-nums [overflow-wrap:anywhere]">
        {subject}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId}>{expenseVoidCopy.reasonLabel}</Label>
        <textarea
          id={fieldId}
          name="reason"
          rows={3}
          maxLength={EXPENSE_VOID_REASON_MAX}
          value={reason}
          disabled={submitting}
          onChange={(e) => {
            setReason(e.target.value);
            if (validationError) setValidationError(null);
          }}
          aria-invalid={validationError ? true : undefined}
          aria-describedby={validationError ? errorId : hintId}
          className={cn(fieldClass, validationError && 'border-danger')}
        />
        <div className="flex items-start justify-between gap-3">
          {validationError ? (
            <InlineError id={errorId} className="text-xs">
              {validationError}
            </InlineError>
          ) : (
            <p id={hintId} className="text-xs text-muted">
              {expenseVoidCopy.reasonHint}
            </p>
          )}
          <span className="shrink-0 text-xs text-muted tabular-nums" aria-hidden="true">
            {expenseVoidCopy.counter(reason.length)}
          </span>
        </div>
      </div>
    </FormModal>
  );
}
