'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { FormModal } from '@/components/shared/form-modal';
import { Label } from '@/components/ui/label';
import { Callout } from '@/components/ui/callout';
import { InlineError } from '@/components/errors/inline-error';
import { Textarea } from '@/components/ui/textarea';
import { isDayLocked } from '@/lib/financial-lock/financial-lock-api';
import { readyPeriodLock, usePeriodLock } from './use-period-lock';
import { LockOverrideReasonField, periodLockCopy, validLockReason } from './period-lock-field';

// Mismos límites que `VoidPaymentDto.reason` en la API (tras recortar).
export const VOID_REASON_MIN = 3;
export const VOID_REASON_MAX = 300;

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: '¿Anular este abono?',
  description:
    'El abono sale de la lista y deja de contar en el saldo, que se recalcula. Queda registrado quién lo anuló, cuándo y por qué, y se ve en el estado de cuenta. Si con él se cumplía un compromiso de pago, el compromiso vuelve a abierto (o a incumplido, si ya pasó su fecha).',
  restrictedHint:
    'Desde recepción puedes anular solo los que registraste tú hoy; para los demás, pide a un administrador.',
  reasonLabel: 'Motivo de la anulación',
  reasonHint: `Entre ${VOID_REASON_MIN} y ${VOID_REASON_MAX} caracteres.`,
  reasonTooShort: `Escribe el motivo (al menos ${VOID_REASON_MIN} caracteres).`,
  counter: (n: number) => `${n}/${VOID_REASON_MAX}`,
  submit: 'Anular abono',
  // DX-390: una línea de un cobro dividido se anula con todo el cobro.
  splitNotice: (lines: number) =>
    `Es una de las ${lines} formas de pago de un mismo cobro: se anulan todas y su recibo.`,
  // DX-091: el abono es de un período contable cerrado.
  lockedOverride:
    'Este abono es de un período contable cerrado. Como administración puedes anularlo indicando por qué; queda registrado quién, cuándo y por qué.',
  lockedBlocked:
    'Este abono es de un período contable cerrado: ya no se puede anular. Pide a administración que lo revise.',
};

interface VoidPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Recibe el motivo ya recortado y válido y, en un período contable cerrado
   * con la exención del ADMIN, el motivo de la excepción (DX-091).
   */
  onConfirm: (reason: string, lockOverrideReason?: string) => void;
  submitting: boolean;
  /** Fallo del envío (p. ej. el 403 de la ventana de recepción). */
  error: string | null;
  /** Recepción: solo puede anular abonos suyos del día (lo decide la API). */
  restrictedToOwnToday: boolean;
  /** Qué abono se anula, p. ej. «123,45 USD · 16/10/2026 · Ana Gómez». */
  subject?: string;
  /** DX-390: formas de pago del cobro dividido al que pertenece el abono (se anulan juntas). */
  splitLines?: number;
  /**
   * DX-091: para leer el cierre contable vigente (`GET /payments/period-lock`)
   * mientras el modal está abierto. Sin él, no se mira el cierre (decide la API).
   */
  token?: string;
  /** DX-091: día civil del abono en su sede (`paidOn`). */
  paidOn?: string;
  /** DX-091: lo que dice la lista (Caja, Estado de cuenta); gana a `paidOn`. */
  periodLocked?: boolean;
}

/**
 * Anular un abono (SEC-013): el motivo es obligatorio y queda junto a quién y
 * cuándo lo anuló. El estado vive aquí y se pierde al cerrar; quien lo usa lo
 * monta con una `key` por abono para que cada anulación empiece en blanco.
 */
export function VoidPaymentModal({
  open,
  onOpenChange,
  onConfirm,
  submitting,
  error,
  restrictedToOwnToday,
  subject,
  splitLines,
  token,
  paidOn,
  periodLocked,
}: VoidPaymentModalProps) {
  const lock = readyPeriodLock(usePeriodLock(token ?? '', open && token !== undefined));
  const locked = periodLocked ?? (paidOn !== undefined && isDayLocked(paidOn, lock?.lockedThrough));
  // Solo con el cierre leído: sin él no se sabe si se puede saltar.
  // Si la lista ya dice que está cerrado y aun así ofreció anular (`canVoid`),
  // es el ADMIN con la exención: se pide el motivo aunque el cierre no cargue.
  const override = locked && (lock !== null ? lock.canOverride : periodLocked === true);
  const blocked = locked && lock !== null && !lock.canOverride;
  const [lockReason, setLockReason] = useState('');
  const [lockReasonError, setLockReasonError] = useState<string | null>(null);
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < VOID_REASON_MIN) {
      setValidationError(copy.reasonTooShort);
      return;
    }
    setValidationError(null);
    if (override) {
      const valid = validLockReason(lockReason);
      if (!valid) {
        setLockReasonError(periodLockCopy.reasonMissing);
        document.getElementById(`${fieldId}-lock`)?.focus();
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
      title={copy.title}
      description={restrictedToOwnToday ? `${copy.description} ${copy.restrictedHint}` : copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      destructive
    >
      {subject ? (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm font-medium text-ink tabular-nums">
          {subject}
        </p>
      ) : null}
      {override || blocked ? (
        <Callout tone="warning" role="note">
          {override ? copy.lockedOverride : copy.lockedBlocked}
        </Callout>
      ) : null}
      {splitLines && splitLines > 1 ? (
        <Callout tone="warning" role="note">
          {copy.splitNotice(splitLines)}
        </Callout>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId}>{copy.reasonLabel}</Label>
        <Textarea
          id={fieldId}
          name="reason"
          rows={3}
          maxLength={VOID_REASON_MAX}
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
            <InlineError id={errorId}>
              {validationError}
            </InlineError>
          ) : (
            <p id={hintId} className="t-caption text-muted">
              {copy.reasonHint}
            </p>
          )}
          <span className="t-caption shrink-0 text-muted tabular-nums" aria-hidden="true">
            {copy.counter(reason.length)}
          </span>
        </div>
      </div>
      {override ? (
        <LockOverrideReasonField
          id={`${fieldId}-lock`}
          label={periodLockCopy.voidReasonLabel}
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
