'use client';
import * as React from 'react';
import { useId, useRef, useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import { sendCertificateCopy, type CertificateCopySent } from '@/lib/certificates/certificate-copy';
import { FormModal } from '@/components/shared/form-modal';
import { ExternalLink } from '@/components/shared/external-link';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';

// Copy as constants (i18n-ready, es-first).
export const sendCertificateCopyCopy = {
  title: 'Enviar por WhatsApp',
  description: (label: string, number: string) =>
    `${label} nº ${number}. Le llega al paciente un enlace personal que caduca, con el certificado y su PDF para descargar.`,
  hint: 'Se abre WhatsApp con un mensaje con el nombre de la clínica y el enlace, sin datos clínicos.',
  minorNote: 'Si el paciente es menor de edad, lo recibe su responsable registrado.',
  resendNote: 'Si ya se envió antes, el enlace anterior deja de servir.',
  submit: 'Crear enlace',
  close: 'Cerrar',
  genericError: 'No pudimos crear el enlace del certificado. Intenta de nuevo.',
  readyTitle: (to: string) => `Enlace listo para ${to}`,
  toResponsible: 'Va al responsable del paciente, que es menor de edad.',
  expires: (when: string) => `El enlace caduca el ${when}.`,
  openWhatsApp: 'Abrir WhatsApp',
  linkLabel: 'Enlace del certificado',
  copyLink: 'Copiar enlace',
  copied: 'Enlace copiado',
  copyFailed: 'No pudimos copiar automáticamente: cópialo a mano desde el campo.',
};

const copy = sendCertificateCopyCopy;

interface SendCertificateCopyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  certificateId: string;
  /** «Justificante de asistencia» / «Certificado de reposo». */
  kindLabel: string;
  numberLabel: string;
  /** Escribe una fecha con el reloj de la sede del certificado (DX-354b). */
  formatDate: (iso: string) => string;
}

/**
 * «Enviar por WhatsApp» (DX-306), como la copia de la receta (DX-468): crea el
 * enlace personal de la copia y ofrece abrir `wa.me` con el mensaje prellenado o
 * copiar el enlace (solo existe en esta respuesta: la API guarda su hash). Un
 * fallo (422 sin teléfono, 409 anulado o archivado, 403…) es del formulario
 * (escalón 4, el `message` de la API) y se puede reintentar.
 */
export function SendCertificateCopyModal({
  open,
  onOpenChange,
  token,
  patientId,
  certificateId,
  kindLabel,
  numberLabel,
  formatDate,
}: SendCertificateCopyModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<CertificateCopySent | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  async function send() {
    setSubmitting(true);
    setError(null);
    try {
      setSent(await sendCertificateCopy(token, patientId, certificateId));
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sent) {
      onOpenChange(false);
      return;
    }
    void send();
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      inputRef.current?.select();
      setCopyState('failed');
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description(kindLabel, numberLabel)}
      onSubmit={handleSubmit}
      submitLabel={sent ? copy.close : copy.submit}
      submitting={submitting}
      error={error}
      errorRetry={error ? { label: copy.submit, onRetry: () => void send() } : null}
      fullScreenOnMobile={false}
      touchTargets
    >
      {sent === null ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">{copy.hint}</p>
          <p className="text-xs text-muted">
            {copy.minorNote} {copy.resendNote}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Callout tone="success" title={copy.readyTitle(sent.destinationMasked)} role="status">
            <p className="tnum">{copy.expires(formatDate(sent.expiresAt))}</p>
            {sent.recipientKind === 'RESPONSIBLE' ? <p>{copy.toResponsible}</p> : null}
          </Callout>
          <Button asChild className="w-full sm:w-auto sm:self-start">
            <ExternalLink href={whatsAppUrl(sent.whatsapp.phone, sent.whatsapp.text)}>
              <MessageCircle aria-hidden /> {copy.openWhatsApp}
            </ExternalLink>
          </Button>
          <label htmlFor={`${ids}-link`} className="text-xs font-medium text-muted">
            {copy.linkLabel}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`${ids}-link`}
              ref={inputRef}
              readOnly
              value={sent.whatsapp.url}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleCopy(sent.whatsapp.url)}
              className="w-full shrink-0 sm:w-auto"
            >
              {copyState === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />} {copy.copyLink}
            </Button>
          </div>
          <p role="status" aria-live="polite" className="text-xs text-muted empty:hidden">
            {copyState === 'copied' ? copy.copied : copyState === 'failed' ? copy.copyFailed : ''}
          </p>
        </div>
      )}
    </FormModal>
  );
}
