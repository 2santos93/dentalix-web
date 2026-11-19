'use client';
import { useId, useRef, useState } from 'react';
import { Check, Copy, MessageCircle, Send } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { Appointment, AppointmentStatus } from '@/lib/appointments/appointments-api';
import {
  createConfirmationLink,
  type ConfirmationLink,
} from '@/lib/appointments/confirmations-api';
import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/errors/inline-error';
import { ConfirmationBadge, STATUS_LABELS } from './appointment-display';
import { sedeConfigErrorCopy } from '@/components/locations/sede-config-error';
import { ExternalLink } from '@/components/shared/external-link';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  heading: 'Confirmación del paciente',
  hint: 'Genera un enlace para que el paciente confirme, cancele o pida que lo llamen. Caduca al inicio de la cita.',
  send: 'Enviar confirmación',
  resend: 'Reenviar confirmación',
  linkLabel: 'Enlace de confirmación',
  resendNote: 'Generar otro enlace anula el anterior.',
  // DX-290: la sede envía la anamnesis con el recordatorio y este paciente
  // es nuevo o la tiene caducada: el mensaje lleva también su enlace.
  anamnesisNote:
    'El mensaje incluye el enlace del cuestionario de salud: el paciente es nuevo o su anamnesis estará caducada el día de la cita.',
  anamnesisPendingNote:
    'El paciente ya tiene un enlace del cuestionario de salud sin responder: no se envía otro y el mensaje le recuerda usar ese.',
  copy: 'Copiar enlace',
  copied: 'Enlace copiado',
  copyFailed: 'No pudimos copiar automáticamente: cópialo a mano desde el campo.',
  whatsapp: 'Abrir WhatsApp',
  noClock: `${sedeConfigErrorCopy.fieldLabel.locale}: el mensaje no puede decir la hora de la cita. Copia el enlace.`,
  // DX-329: sin + vale el prefijo de la sede, si tiene; el motivo puede ser
  // un número que no se lee, con dos lecturas o sin prefijo con el que leerlo.
  noPhone:
    'El teléfono del paciente no sirve para WhatsApp: revísalo en su ficha o escríbelo con + y su prefijo. También puedes copiar el enlace.',
  notConfirmable: (status: string) =>
    `La cita está ${status.toLowerCase()}: no hay nada que confirmar.`,
  started: 'La cita ya empezó: el enlace nacería caducado.',
  genericError: 'No pudimos generar el enlace. Intenta de nuevo.',
};

const CONFIRMABLE: ReadonlySet<AppointmentStatus> = new Set(['SCHEDULED', 'CONFIRMED']);

/** Por qué no se puede pedir confirmación, o `null` si se puede. */
function blockedReason(appointment: Appointment): string | null {
  if (!CONFIRMABLE.has(appointment.status)) {
    return copy.notConfirmable(STATUS_LABELS[appointment.status]);
  }
  if (new Date(appointment.start).getTime() <= Date.now()) return copy.started;
  return null;
}

interface ConfirmationLinkPanelProps {
  token: string;
  appointment: Appointment;
  /** Tras generar el enlace — p. ej. refrescar la agenda para que la tarjeta muestre "Confirmación pendiente". */
  onLinkCreated?: () => void;
}

/**
 * Bloque del detalle de la cita (DX-005): recepción genera el enlace firmado y
 * lo copia o lo manda por WhatsApp con el mensaje prellenado que compone la API
 * (`whatsappText`, DX-565: la plantilla de la clínica; `wa.me`; el envío
 * automático es otra tarea). El enlace solo existe en este panel: el backend
 * guarda únicamente su hash, así que cerrar el detalle lo pierde y hay que
 * generar otro (que anula el anterior).
 */
export function ConfirmationLinkPanel({ token, appointment, onLinkCreated }: ConfirmationLinkPanelProps) {
  const [link, setLink] = useState<ConfirmationLink | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const linkId = `${ids}-link`;
  const noPhoneId = `${ids}-no-phone`;
  const blockedId = `${ids}-blocked`;

  const blocked = blockedReason(appointment);
  const alreadySent = appointment.confirmationSentAt !== null || link !== null;

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setCopyState('idle');
    try {
      const created = await createConfirmationLink(token, appointment.id);
      setLink(created);
      onLinkCreated?.();
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopyState('copied');
    } catch {
      // Contexto no seguro o permiso denegado: el enlace queda seleccionado.
      inputRef.current?.select();
      setCopyState('failed');
    }
  }

  return (
    <section aria-labelledby={`${ids}-heading`} className="flex flex-col gap-3 border-t border-border-subtle pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${ids}-heading`} className="text-sm font-semibold text-ink">
          {copy.heading}
        </h3>
        <ConfirmationBadge appointment={appointment} />
      </div>
      <p className="text-sm text-muted">{copy.hint}</p>

      <Button
        type="button"
        variant={link ? 'secondary' : 'default'}
        onClick={() => void handleGenerate()}
        loading={generating}
        disabled={blocked !== null}
        aria-describedby={blocked ? blockedId : undefined}
        className="w-full sm:w-auto sm:self-start"
      >
        <Send aria-hidden /> {alreadySent ? copy.resend : copy.send}
      </Button>
      {blocked && (
        <p id={blockedId} className="text-sm text-muted">
          {blocked}
        </p>
      )}
      {error && <InlineError>{error}</InlineError>}

      {link && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-3">
          <label htmlFor={linkId} className="t-caption text-muted">
            {copy.linkLabel}
          </label>
          <Input
            id={linkId}
            ref={inputRef}
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="secondary" onClick={() => void handleCopy()} className="w-full sm:w-auto">
              {copyState === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />} {copy.copy}
            </Button>
            {link.whatsappPhone && link.whatsappText ? (
              <Button asChild className="w-full sm:w-auto">
                <ExternalLink href={whatsAppUrl(link.whatsappPhone, link.whatsappText)}>
                  <MessageCircle aria-hidden /> {copy.whatsapp}
                </ExternalLink>
              </Button>
            ) : (
              <Button type="button" disabled aria-describedby={noPhoneId} className="w-full sm:w-auto">
                <MessageCircle aria-hidden /> {copy.whatsapp}
              </Button>
            )}
          </div>
          <p role="status" aria-live="polite" className="text-xs text-muted empty:hidden">
            {copyState === 'copied' ? copy.copied : copyState === 'failed' ? copy.copyFailed : ''}
          </p>
          {!link.whatsappPhone || !link.whatsappText ? (
            <p id={noPhoneId} className="text-xs text-muted">
              {link.whatsappPhone ? copy.noClock : copy.noPhone}
            </p>
          ) : null}
          {link.anamnesisUrl || link.anamnesisPending ? (
            <p className="text-xs text-ink" data-testid="confirmation-anamnesis-note">
              {link.anamnesisUrl ? copy.anamnesisNote : copy.anamnesisPendingNote}
            </p>
          ) : null}
          <p className="text-xs text-muted">{copy.resendNote}</p>
        </div>
      )}
    </section>
  );
}
