'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createSignatureRequest,
  getSignatureRequestOptions,
  type SignatureRequestCreated,
  type SignatureRequestOptions,
} from '@/lib/signature-requests/signature-requests-api';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Callout } from '@/components/ui/callout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineError } from '@/components/errors/inline-error';
import { SectionError } from '@/components/errors/section-error';

export const sendBudgetCopy = {
  title: 'Enviar a aceptar',
  description:
    'Quien firma (el paciente o su responsable) recibe un enlace por email, lo abre con un código de 6 dígitos, revisa el presupuesto y lo acepta firmando con el dedo. Al aceptarlo, el plan pasa a «Aceptado» y sus otras opciones, a «Rechazado».',
  optionsError: 'No pudimos preparar el envío.',
  recipientHeading: 'Destinatario',
  channel: 'Por correo electrónico',
  toPatient: (to: string, name: string) => `${to} · acepta ${name} (paciente)`,
  toGuardian: (to: string, name: string) => `${to} · acepta ${name}, su responsable (la persona es menor de edad)`,
  expiry: 'El enlace caduca a las 72 horas y sirve una sola vez.',
  changes: 'Si cambias el presupuesto (ítems, precios o estado) después de enviarlo, el enlace dejará de servir.',
  resend: 'Ya hay un enlace sin usar para este presupuesto: al enviar otro, el anterior deja de servir.',
  cancel: 'Cancelar',
  send: 'Enviar a aceptar',
  sendBlocked: (reason: string) => `No se puede enviar: ${reason}`,
  sendError: 'No pudimos enviar el enlace. Intenta de nuevo.',
};

const copy = sendBudgetCopy;

interface SendBudgetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  planId: string;
  /** Hay un enlace anterior del mismo plan aún sin usar (se anulará). */
  replacesPending: boolean;
  onSent: (created: SignatureRequestCreated) => void;
}

/**
 * Confirmación de «Enviar a aceptar» (DX-415): a quién va el enlace
 * (enmascarado) o por qué no se puede, y lo que pasa al aceptarlo. El
 * presupuesto que se envía es el del plan tal como está ahora. El padre lo
 * monta al abrirlo, así cada apertura empieza limpia.
 */
export function SendBudgetModal({
  open,
  onOpenChange,
  token,
  patientId,
  planId,
  replacesPending,
  onSent,
}: SendBudgetModalProps) {
  const [options, setOptions] = useState<SignatureRequestOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsKey, setOptionsKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getSignatureRequestOptions(token, patientId)
      .then((data) => {
        if (!cancelled) setOptions(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setOptionsError(apiErrorMessage(err, copy.optionsError));
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId, optionsKey]);

  const recipient = options?.recipient ?? null;
  const blocked = !recipient?.allowed;

  async function send() {
    setSubmitting(true);
    setError(null);
    try {
      const created = await createSignatureRequest(token, patientId, {
        type: 'BUDGET',
        channel: 'EMAIL',
        treatmentPlanId: planId,
      });
      onOpenChange(false);
      onSent(created);
    } catch (err) {
      setError(apiErrorMessage(err, copy.sendError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {optionsError ? (
          <SectionError
            description={optionsError}
            onRetry={() => {
              setOptionsError(null);
              setOptionsKey((k) => k + 1);
            }}
          />
        ) : !options ? (
          <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            {error ? <InlineError variant="summary">{error}</InlineError> : null}
            <section
              aria-label={copy.recipientHeading}
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <p className="flex items-center gap-2 font-medium text-ink">
                <Mail aria-hidden className="size-4 text-muted" />
                {copy.channel}
              </p>
              {recipient?.allowed && recipient.destinationMasked && recipient.signerName ? (
                <>
                  <p className="break-words text-ink">
                    {recipient.signerType === 'GUARDIAN'
                      ? copy.toGuardian(recipient.destinationMasked, recipient.signerName)
                      : copy.toPatient(recipient.destinationMasked, recipient.signerName)}
                  </p>
                  <p className="text-xs text-muted">{copy.expiry}</p>
                </>
              ) : (
                <p role="alert" className="text-warning-text">
                  {copy.sendBlocked(recipient?.reason ?? '')}
                </p>
              )}
            </section>
            <p className="text-sm text-muted">{copy.changes}</p>
            {replacesPending ? (
              <Callout tone="warning" role="status" className="py-2">
                {copy.resend}
              </Callout>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={submitting}>
                  {copy.cancel}
                </Button>
              </DialogClose>
              <Button type="button" loading={submitting} disabled={blocked} onClick={() => void send()}>
                {copy.send}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
