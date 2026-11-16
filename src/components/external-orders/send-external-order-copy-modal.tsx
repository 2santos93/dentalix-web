'use client';
import * as React from 'react';
import { useId, useRef, useState } from 'react';
import { Check, Copy, Mail, MessageCircle } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import {
  sendExternalOrderCopy,
  type ExternalOrderCopyChannel,
  type ExternalOrderCopySent,
} from '@/lib/external-orders/external-orders-api';
import { FormModal } from '@/components/shared/form-modal';
import { ExternalLink } from '@/components/shared/external-link';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';

// Copy as constants (i18n-ready, es-first).
export const sendExternalOrderCopyCopy = {
  title: 'Enviar al paciente',
  description: (number: string) =>
    `Orden nº ${number}. Le llega un enlace personal para descargar el PDF de la orden, con la nota clínica, y llevarlo al centro. El enlace sirve una sola vez y caduca.`,
  channelLabel: 'Cómo enviarla',
  whatsapp: 'WhatsApp',
  email: 'Email',
  hintWhatsApp: 'Se abre WhatsApp con un mensaje con el nombre de la clínica y el enlace, sin datos clínicos.',
  hintEmail: 'Lo enviamos desde la clínica al email del paciente, sin datos clínicos en el correo.',
  minorNote: 'Si el paciente es menor de edad, lo recibe su responsable registrado.',
  resendNote: 'Si ya se envió antes, el enlace anterior deja de servir.',
  submit: 'Enviar al paciente',
  close: 'Cerrar',
  genericError: 'No pudimos enviar la orden al paciente. Intenta de nuevo.',
  sentEmailTitle: (to: string) => `Enlace enviado a ${to}`,
  toResponsible: 'Va al responsable del paciente, que es menor de edad.',
  expires: (when: string) => `El enlace caduca el ${when}.`,
  readyWhatsAppTitle: (to: string) => `Enlace listo para ${to}`,
  openWhatsApp: 'Abrir WhatsApp',
  linkLabel: 'Enlace de la orden',
  copyLink: 'Copiar enlace',
  copied: 'Enlace copiado',
  copyFailed: 'No pudimos copiar automáticamente: cópialo a mano desde el campo.',
};

const copy = sendExternalOrderCopyCopy;

interface SendExternalOrderCopyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  orderId: string;
  numberLabel: string;
  /** Escribe una fecha con el reloj de la sede de la orden (DX-354b). */
  formatDate: (iso: string) => string;
}

/**
 * «Enviar al paciente» (DX-572, como la receta de DX-468): elige WhatsApp o
 * email y crea el enlace de un solo uso de la orden. Por email la API lo envía y aquí solo se confirma a quién (sin el
 * contacto entero). Por WhatsApp el enlace solo existe en esta respuesta (la
 * API guarda su hash): se ofrece abrir `wa.me` con el mensaje prellenado o
 * copiarlo, como la anamnesis por enlace. Un fallo del envío es del
 * formulario (escalón 4, banner con el motivo de la API) y se puede reenviar.
 */
export function SendExternalOrderCopyModal({
  open,
  onOpenChange,
  token,
  orderId,
  numberLabel,
  formatDate,
}: SendExternalOrderCopyModalProps) {
  const [channel, setChannel] = useState<ExternalOrderCopyChannel>('WHATSAPP');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<ExternalOrderCopySent | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  async function send() {
    setSubmitting(true);
    setError(null);
    try {
      setSent(await sendExternalOrderCopy(token, orderId, channel));
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
      description={copy.description(numberLabel)}
      onSubmit={handleSubmit}
      submitLabel={sent ? copy.close : copy.submit}
      submitting={submitting}
      error={error}
      errorRetry={error ? { label: copy.submit, onRetry: () => void send() } : null}
      fullScreenOnMobile={false}
      touchTargets
    >
      {sent === null ? (
        <div className="flex flex-col gap-3">
          <span id={`${ids}-channel`} className="text-sm font-medium text-ink">
            {copy.channelLabel}
          </span>
          <SegmentedControl
            aria-labelledby={`${ids}-channel`}
            value={channel}
            onValueChange={(value) => {
              setChannel(value);
              setError(null);
            }}
            options={[
              {
                value: 'WHATSAPP',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle aria-hidden className="size-4" />
                    {copy.whatsapp}
                  </span>
                ),
                ariaLabel: copy.whatsapp,
              },
              {
                value: 'EMAIL',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail aria-hidden className="size-4" />
                    {copy.email}
                  </span>
                ),
                ariaLabel: copy.email,
              },
            ]}
            fullWidthOnMobile
            disabled={submitting}
          />
          <p className="text-sm text-muted">{channel === 'WHATSAPP' ? copy.hintWhatsApp : copy.hintEmail}</p>
          <p className="text-xs text-muted">
            {copy.minorNote} {copy.resendNote}
          </p>
        </div>
      ) : sent.channel === 'EMAIL' ? (
        <Callout tone="success" title={copy.sentEmailTitle(sent.destinationMasked)} role="status">
          <p className="tnum">{copy.expires(formatDate(sent.expiresAt))}</p>
          {sent.recipientKind === 'RESPONSIBLE' ? <p>{copy.toResponsible}</p> : null}
        </Callout>
      ) : (
        <div className="flex flex-col gap-3">
          <Callout tone="success" title={copy.readyWhatsAppTitle(sent.destinationMasked)} role="status">
            <p className="tnum">{copy.expires(formatDate(sent.expiresAt))}</p>
            {sent.recipientKind === 'RESPONSIBLE' ? <p>{copy.toResponsible}</p> : null}
          </Callout>
          {sent.whatsapp ? (
            <>
              <Button asChild className="w-full sm:w-auto sm:self-start">
                <ExternalLink href={whatsAppUrl(sent.whatsapp.phone, sent.whatsapp.text)}>
                  <MessageCircle aria-hidden /> {copy.openWhatsApp}
                </ExternalLink>
              </Button>
              <label htmlFor={`${ids}-link`} className="text-xs font-medium tracking-wide text-muted">
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
                  onClick={() => void handleCopy(sent.whatsapp!.url)}
                  className="w-full shrink-0 sm:w-auto"
                >
                  {copyState === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />} {copy.copyLink}
                </Button>
              </div>
              <p role="status" aria-live="polite" className="text-xs text-muted empty:hidden">
                {copyState === 'copied' ? copy.copied : copyState === 'failed' ? copy.copyFailed : ''}
              </p>
            </>
          ) : null}
        </div>
      )}
    </FormModal>
  );
}
