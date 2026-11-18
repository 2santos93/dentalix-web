'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { FormModal } from '@/components/shared/form-modal';
import { Label } from '@/components/ui/label';
import { Callout } from '@/components/ui/callout';
import { InlineError } from '@/components/errors/inline-error';
import { Textarea } from '@/components/ui/textarea';
import { LockOverrideReasonField, periodLockCopy, validLockReason } from '@/components/payments/period-lock-field';

// Mismos límites que `CancelPaymentPlanDto.reason` en la API (tras recortar).
export const CANCEL_PLAN_REASON_MIN = 3;
export const CANCEL_PLAN_REASON_MAX = 300;

export const cancelPaymentPlanCopy = {
  title: '¿Cancelar el plan de pagos?',
  description:
    'Se cancela el calendario de cuotas. Los abonos registrados y el saldo del plan no cambian, y podrás crear uno nuevo. Queda registrado quién lo canceló, cuándo y por qué.',
  reasonLabel: 'Motivo de la cancelación',
  reasonHint: `Entre ${CANCEL_PLAN_REASON_MIN} y ${CANCEL_PLAN_REASON_MAX} caracteres. Se ve en el historial del plan.`,
  reasonTooShort: `Escribe el motivo (al menos ${CANCEL_PLAN_REASON_MIN} caracteres).`,
  counter: (n: number) => `${n}/${CANCEL_PLAN_REASON_MAX}`,
  submit: 'Cancelar plan de pagos',
  // «Cancelar» a secas confundiría: la acción también es cancelar.
  keep: 'Volver',
  // DX-091: cuotas vencidas en un período contable cerrado.
  lockedBlocked:
    'Este plan tiene cuotas vencidas en un período contable cerrado: ya no se puede cancelar. Pide a administración que lo revise.',
};

interface CancelPaymentPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recibe el motivo recortado y válido y, con la exención del ADMIN, el del período cerrado. */
  onConfirm: (reason: string, lockOverrideReason?: string) => void;
  submitting: boolean;
  error: string | null;
  /**
   * DX-091: alguna cuota vence en un período contable cerrado. `override` =
   * el ADMIN con la exención (pide su motivo); `blocked` = no puede (lo avisa;
   * el envío sigue y la API responde el 409 con el día del cierre, como al
   * anular un abono).
   */
  periodLock: 'none' | 'override' | 'blocked';
}

/**
 * Cancelar el plan de cuotas (DX-092, SEC-029): el motivo es obligatorio, como
 * al anular un abono, y queda junto a quién y cuándo. Quien lo usa lo monta
 * con una `key` por apertura para que cada cancelación empiece en blanco.
 */
export function CancelPaymentPlanModal({
  open,
  onOpenChange,
  onConfirm,
  submitting,
  error,
  periodLock,
}: CancelPaymentPlanModalProps) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const lockFieldId = `${fieldId}-lock`;
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [lockReasonError, setLockReasonError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < CANCEL_PLAN_REASON_MIN) {
      setValidationError(cancelPaymentPlanCopy.reasonTooShort);
      document.getElementById(fieldId)?.focus();
      return;
    }
    setValidationError(null);
    if (periodLock === 'override') {
      const valid = validLockReason(lockReason);
      if (!valid) {
        setLockReasonError(periodLockCopy.reasonMissing);
        document.getElementById(lockFieldId)?.focus();
        return;
      }
      setLockReasonError(null);
      onConfirm(trimmed, valid);
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <FormModal
      touchTargets
      open={open}
      onOpenChange={onOpenChange}
      title={cancelPaymentPlanCopy.title}
      description={cancelPaymentPlanCopy.description}
      onSubmit={handleSubmit}
      submitLabel={cancelPaymentPlanCopy.submit}
      cancelLabel={cancelPaymentPlanCopy.keep}
      submitting={submitting}
      error={error}
      destructive
    >
      {periodLock === 'blocked' ? (
        <Callout tone="warning" role="note">
          {cancelPaymentPlanCopy.lockedBlocked}
        </Callout>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId}>{cancelPaymentPlanCopy.reasonLabel}</Label>
        <Textarea
          id={fieldId}
          name="reason"
          rows={3}
          maxLength={CANCEL_PLAN_REASON_MAX}
          value={reason}
          disabled={submitting}
          onChange={(e) => {
            setReason(e.target.value);
            if (validationError) setValidationError(null);
          }}
          aria-invalid={validationError ? true : undefined}
          aria-describedby={validationError ? errorId : hintId}
        />
        <div className="flex items-start justify-between gap-3">
          {validationError ? (
            <InlineError id={errorId}>{validationError}</InlineError>
          ) : (
            <p id={hintId} className="t-caption text-muted">
              {cancelPaymentPlanCopy.reasonHint}
            </p>
          )}
          <span className="t-caption shrink-0 text-muted tabular-nums" aria-hidden="true">
            {cancelPaymentPlanCopy.counter(reason.length)}
          </span>
        </div>
      </div>
      {periodLock === 'override' ? (
        <LockOverrideReasonField
          id={lockFieldId}
          label={periodLockCopy.planCancelReasonLabel}
          value={lockReason}
          error={lockReasonError}
          disabled={submitting}
          onChange={(next) => {
            setLockReason(next);
            if (lockReasonError) setLockReasonError(null);
          }}
        />
      ) : null}
    </FormModal>
  );
}
