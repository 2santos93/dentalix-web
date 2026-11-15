'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  CERTIFICATE_KIND_LABELS,
  CERTIFICATE_VOID_REASON_MAX,
  CERTIFICATE_VOID_REASON_MIN,
  voidCertificate,
  type PatientCertificate,
} from '@/lib/certificates/certificates-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Textarea } from '@/components/ui/textarea';

export const voidCertificateCopy = {
  title: 'Anular certificado',
  description: (label: string, number: string) =>
    `${label} nº ${number}. No se borra: queda anulado en la ficha con el motivo, quién lo anuló y cuándo, y su PDF archivado sale con «ANULADO». Si hace falta, emite uno nuevo.`,
  reasonLabel: 'Motivo de la anulación',
  reasonHint: 'Por ejemplo: fecha equivocada, se emitió para otra cita.',
  reasonTooShort: `Escribe el motivo (al menos ${CERTIFICATE_VOID_REASON_MIN} caracteres).`,
  submit: 'Anular certificado',
  genericError: 'No pudimos anular el certificado. Intenta de nuevo.',
};

const copy = voidCertificateCopy;

interface VoidCertificateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  certificate: PatientCertificate;
  onVoided: (certificate: PatientCertificate) => void;
}

/**
 * Anulación con motivo obligatorio (DX-306). Quien lo emitió o un ADMIN; la API
 * lo vuelve a comprobar (403) y un 409 si ya estaba anulado: los dos llegan en
 * el banner del formulario (escalón 4). El padre lo monta con `key`.
 */
export function VoidCertificateModal({
  open,
  onOpenChange,
  token,
  patientId,
  certificate,
  onVoided,
}: VoidCertificateModalProps) {
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonId = 'certificate-void-reason';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < CERTIFICATE_VOID_REASON_MIN) {
      setReasonError(copy.reasonTooShort);
      return;
    }
    setReasonError(null);
    setSubmitting(true);
    setError(null);
    try {
      const voided = await voidCertificate(token, patientId, certificate.id, trimmed);
      onOpenChange(false);
      onVoided(voided);
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
      description={copy.description(CERTIFICATE_KIND_LABELS[certificate.kind], certificate.numberLabel)}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={reason.trim() === ''}
      error={error}
      destructive
      ownValidation
    >
      <FormField htmlFor={reasonId} label={copy.reasonLabel} hint={copy.reasonHint} error={reasonError}>
        <Textarea
          id={reasonId}
          rows={3}
          autoGrow
          value={reason}
          maxLength={CERTIFICATE_VOID_REASON_MAX}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? fieldErrorId(reasonId) : undefined}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonError(null);
          }}
        />
      </FormField>
    </FormModal>
  );
}
