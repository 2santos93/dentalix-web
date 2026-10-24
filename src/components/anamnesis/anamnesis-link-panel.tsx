'use client';
import { useId, useRef, useState } from 'react';
import { Check, ClipboardList, Copy, MessageCircle } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { createAnamnesisRequest, type AnamnesisRequestCreated } from '@/lib/anamnesis/anamnesis-api';
import { whatsAppUrl } from '@/lib/appointments/confirmation-message';
import { formatDateTime } from '@/lib/format/date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineError } from '@/components/errors/inline-error';

const copy = {
  heading: 'Anamnesis por enlace',
  hint: 'El paciente responde su cuestionario de salud desde el móvil antes de la cita; un odontólogo lo revisa antes de que cambie la historia.',
  send: 'Enviar anamnesis',
  resend: 'Generar otro enlace',
  linkLabel: 'Enlace de anamnesis',
  expires: (when: string) => `Caduca el ${when}. Sirve una sola vez.`,
  resendNote: 'Generar otro enlace anula el anterior que aún no se haya respondido.',
  consentNote: 'El paciente no tiene vigente la autorización de datos de salud: el formulario se la pedirá antes.',
  copy: 'Copiar enlace',
  copied: 'Enlace copiado',
  copyFailed: 'No pudimos copiar automáticamente: cópialo a mano desde el campo.',
  whatsapp: 'Abrir WhatsApp',
  genericError: 'No pudimos generar el enlace. Intenta de nuevo.',
};

interface AnamnesisLinkPanelProps {
  token: string;
  patientId: string;
  /** Con cita: el enlace caduca a su inicio y la anamnesis va a la bandeja de su sede. */
  appointmentId?: string;
  /** Tras crearlo, p. ej. para releer el estado en la ficha. */
  onCreated?: (created: AnamnesisRequestCreated) => void;
}

/**
 * «Enviar anamnesis» (DX-099), en la ficha y en el detalle de la cita: genera
 * el enlace y lo copia o lo abre en `wa.me` con un mensaje prellenado sin
 * nada clínico, como la confirmación de cita (DX-005). El enlace solo existe
 * aquí: la API guarda su hash, así que al cerrar hay que generar otro (que
 * anula el anterior). Recepción también puede enviarlo.
 */
export function AnamnesisLinkPanel({ token, patientId, appointmentId, onCreated }: AnamnesisLinkPanelProps) {
  const [link, setLink] = useState<AnamnesisRequestCreated | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useId();
  const linkId = `${ids}-link`;
  const noPhoneId = `${ids}-no-phone`;

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setCopyState('idle');
    try {
      const created = await createAnamnesisRequest(token, patientId, appointmentId ? { appointmentId } : {});
      setLink(created);
      onCreated?.(created);
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
      inputRef.current?.select();
      setCopyState('failed');
    }
  }

  return (
    <section aria-labelledby={`${ids}-heading`} className="flex flex-col gap-3">
      <h3 id={`${ids}-heading`} className="text-sm font-semibold text-ink">
        {copy.heading}
      </h3>
      <p className="text-sm text-muted">{copy.hint}</p>
      <Button
        type="button"
        variant={link ? 'secondary' : 'default'}
        onClick={() => void handleGenerate()}
        loading={generating}
        className="w-full sm:w-auto sm:self-start"
      >
        <ClipboardList aria-hidden /> {link ? copy.resend : copy.send}
      </Button>
      {error && <InlineError>{error}</InlineError>}

      {link && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
          <label htmlFor={linkId} className="text-xs font-medium tracking-wide text-muted">
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
          <p className="text-xs text-muted tabular-nums">{copy.expires(formatDateTime(link.expiresAt))}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="secondary" onClick={() => void handleCopy()} className="w-full sm:w-auto">
              {copyState === 'copied' ? <Check aria-hidden /> : <Copy aria-hidden />} {copy.copy}
            </Button>
            {link.whatsapp ? (
              <Button asChild className="w-full sm:w-auto">
                <a href={whatsAppUrl(link.whatsapp.phone, link.whatsapp.text)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden /> {copy.whatsapp}
                </a>
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
          {!link.whatsapp && link.whatsappUnavailableReason && (
            <p id={noPhoneId} className="text-xs text-muted">
              {link.whatsappUnavailableReason}
            </p>
          )}
          {link.consentRequired && <p className="text-xs text-muted">{copy.consentNote}</p>}
          <p className="text-xs text-muted">{copy.resendNote}</p>
        </div>
      )}
    </section>
  );
}
