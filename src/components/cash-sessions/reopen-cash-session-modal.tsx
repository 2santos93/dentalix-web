'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  CASH_REASON_MAX,
  CASH_REASON_MIN,
  reopenCashSession,
  type CashSessionDetail,
} from '@/lib/cash-sessions/cash-sessions-api';
import { FormModal } from '@/components/shared/form-modal';
import { Label } from '@/components/ui/label';
import { InlineError } from '@/components/errors/inline-error';
import { fieldClass } from '@/lib/ui/field-class';

const copy = {
  title: '¿Reabrir esta caja?',
  description:
    'El cierre actual se conserva tal cual en el historial; al volver a cerrar se guarda un cierre nuevo. Queda registrado quién la reabrió, cuándo y por qué.',
  reason: 'Motivo de la reapertura',
  hint: `Entre ${CASH_REASON_MIN} y ${CASH_REASON_MAX} caracteres.`,
  tooShort: `Escribe el motivo (al menos ${CASH_REASON_MIN} caracteres).`,
  submit: 'Reabrir caja',
  genericError: 'No pudimos reabrir la caja. Intenta de nuevo.',
};

interface ReopenCashSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  sessionId: string;
  onReopened: (session: CashSessionDetail) => void;
}

/** Reabrir un cierre (DX-027): solo ADMIN, con motivo obligatorio. */
export function ReopenCashSessionModal({
  open,
  onOpenChange,
  token,
  sessionId,
  onReopened,
}: ReopenCashSessionModalProps) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < CASH_REASON_MIN) {
      setValidation(copy.tooShort);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      onReopened(await reopenCashSession(token, sessionId, trimmed));
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{copy.reason}</Label>
        <textarea
          id={id}
          rows={3}
          maxLength={CASH_REASON_MAX}
          value={reason}
          disabled={submitting}
          aria-invalid={validation ? true : undefined}
          onChange={(e) => {
            setReason(e.target.value);
            setValidation(null);
          }}
          className={fieldClass}
        />
        {validation ? (
          <InlineError className="text-xs">{validation}</InlineError>
        ) : (
          <p className="text-xs text-muted">{copy.hint}</p>
        )}
      </div>
    </FormModal>
  );
}
