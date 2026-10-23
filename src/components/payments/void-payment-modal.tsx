"use client";
import * as React from "react";
import { useId, useState } from "react";
import { FormModal } from "@/components/shared/form-modal";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/errors/inline-error";
import { fieldClass } from "@/lib/ui/field-class";
import { cn } from "@/lib/utils";

// Mismos límites que `VoidPaymentDto.reason` en la API (tras recortar).
export const VOID_REASON_MIN = 3;
export const VOID_REASON_MAX = 300;

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  title: "¿Anular este abono?",
  description:
    "El abono sale de la lista y deja de contar en el saldo, que se recalcula. Queda registrado quién lo anuló, cuándo y por qué, y se ve en el estado de cuenta. Si con él se cumplía un compromiso de pago, el compromiso vuelve a abierto (o a incumplido, si ya pasó su fecha).",
  restrictedHint:
    "Desde recepción puedes anular solo los que registraste tú hoy; para los demás, pide a un administrador.",
  reasonLabel: "Motivo de la anulación",
  reasonHint: `Entre ${VOID_REASON_MIN} y ${VOID_REASON_MAX} caracteres.`,
  reasonTooShort: `Escribe el motivo (al menos ${VOID_REASON_MIN} caracteres).`,
  counter: (n: number) => `${n}/${VOID_REASON_MAX}`,
  submit: "Anular abono",
};

interface VoidPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recibe el motivo ya recortado y válido. */
  onConfirm: (reason: string) => void;
  submitting: boolean;
  /** Fallo del envío (p. ej. el 403 de la ventana de recepción). */
  error: string | null;
  /** Recepción: solo puede anular abonos suyos del día (lo decide la API). */
  restrictedToOwnToday: boolean;
  /** Qué abono se anula, p. ej. «12.345 COP · 16/10/2026 · Ana Gómez». */
  subject?: string;
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
}: VoidPaymentModalProps) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < VOID_REASON_MIN) {
      setValidationError(copy.reasonTooShort);
      return;
    }
    setValidationError(null);
    onConfirm(trimmed);
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={
        restrictedToOwnToday
          ? `${copy.description} ${copy.restrictedHint}`
          : copy.description
      }
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      destructive
    >
      {subject ? (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink tabular-nums">
          {subject}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId}>{copy.reasonLabel}</Label>
        <textarea
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
          className={cn(fieldClass, validationError && "border-danger")}
        />
        <div className="flex items-start justify-between gap-3">
          {validationError ? (
            <InlineError id={errorId} className="text-xs">
              {validationError}
            </InlineError>
          ) : (
            <p id={hintId} className="text-xs text-muted">
              {copy.reasonHint}
            </p>
          )}
          <span
            className="shrink-0 text-xs text-muted tabular-nums"
            aria-hidden="true"
          >
            {copy.counter(reason.length)}
          </span>
        </div>
      </div>
    </FormModal>
  );
}
