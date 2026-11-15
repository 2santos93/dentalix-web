'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  PAYMENT_REPORT_NOT_PENDING,
  rejectPaymentReport,
  type RejectedPaymentReport,
} from '@/lib/payment-links/payment-links-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Textarea } from '@/components/ui/textarea';

export const REJECT_REASON_MAX = 280;

export const rejectReportCopy = {
  title: '¿Rechazar este pago reportado?',
  description:
    'No se registra ningún abono y el saldo no cambia. Si el paciente tiene email, se le avisa de que la clínica no pudo confirmar su pago y lo contactará; el motivo no se le envía. Para reportar otro pago necesitará un enlace nuevo.',
  reasonLabel: 'Motivo (interno)',
  reasonHint: (n: number) => `Queda en el reporte y en la auditoría. ${n}/${REJECT_REASON_MAX}`,
  reasonMissing: 'Escribe el motivo del rechazo.',
  submit: 'Rechazar pago',
  genericError: 'No pudimos rechazar el pago. Intenta de nuevo.',
};
const copy = rejectReportCopy;

interface RejectPaymentReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  reportId: string;
  /** Qué pago se rechaza, p. ej. «Ana Pérez · Pago móvil · USD 40,00». */
  subject: string;
  onRejected: (result: RejectedPaymentReport) => void;
  /** 409 `PAYMENT_REPORT_NOT_PENDING`: otra persona ya lo decidió. */
  onStale: () => void;
}

/** DX-569: rechazar un pago reportado con su motivo (1–280), como «Anular abono». */
export function RejectPaymentReportModal({
  open,
  onOpenChange,
  token,
  reportId,
  subject,
  onRejected,
  onStale,
}: RejectPaymentReportModalProps) {
  const fieldId = useId();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = reason.trim();
    if (trimmed === '') {
      setReasonError(copy.reasonMissing);
      document.getElementById(fieldId)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      onRejected(await rejectPaymentReport(token, reportId, trimmed));
    } catch (err) {
      if (err instanceof ApiError && err.code === PAYMENT_REPORT_NOT_PENDING) {
        onStale();
        return;
      }
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      touchTargets
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      destructive
    >
      <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm font-medium text-ink tabular-nums">{subject}</p>
      <FormField htmlFor={fieldId} label={copy.reasonLabel} hint={copy.reasonHint(reason.length)} error={reasonError}>
        <Textarea
          id={fieldId}
          rows={3}
          autoGrow
          maxLength={REJECT_REASON_MAX}
          value={reason}
          disabled={submitting}
          aria-invalid={reasonError ? true : undefined}
          onChange={(e) => {
            setReason(e.target.value);
            if (reasonError) setReasonError(null);
          }}
        />
      </FormField>
    </FormModal>
  );
}
