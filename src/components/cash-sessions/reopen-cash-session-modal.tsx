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
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Textarea } from '@/components/ui/textarea';

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
      touchTargets
    >
      <FormField htmlFor={id} label={copy.reason} hint={copy.hint} hintId={`${id}-hint`} error={validation}>
        <Textarea
          id={id}
          rows={3}
          autoGrow
          maxLength={CASH_REASON_MAX}
          value={reason}
          disabled={submitting}
          aria-invalid={validation ? true : undefined}
          aria-describedby={validation ? fieldErrorId(id) : `${id}-hint`}
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
