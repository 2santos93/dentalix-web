'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  countersignPatientConsent,
  type PatientConsentSummary,
} from '@/lib/consents/consents-api';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/errors/inline-error';
import { SignaturePad } from '@/components/shared/signature-pad';

const copy = {
  title: 'Firmar como profesional',
  description: (title: string, signer: string) =>
    `${signer} firmó «${title}» a distancia. Con tu firma el consentimiento queda completo.`,
  signature: (name: string) => `Firma del profesional · ${name}`,
  hint: 'Firma con el dedo, el lápiz o el ratón.',
  immutable: 'Al firmar, el documento queda completo y no se puede editar ni borrar.',
  cancel: 'Cancelar',
  sign: 'Firmar',
  error: 'No pudimos guardar tu firma. Intenta de nuevo.',
};

interface CountersignConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  consent: PatientConsentSummary;
  /** Recibe el consentimiento ya completo (el modal ya se cerró). */
  onSigned: (consent: PatientConsentSummary) => void;
}

/**
 * La firma del profesional que completa un consentimiento firmado por el
 * paciente a distancia (DX-243). Reutiliza el lienzo de firma de DX-006. Un
 * fallo deja el modal abierto con el motivo (escalón 4).
 */
export function CountersignConsentModal({
  open,
  onOpenChange,
  token,
  patientId,
  consent,
  onSigned,
}: CountersignConsentModalProps) {
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!signature) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await countersignPatientConsent(token, patientId, consent.id, signature);
      onOpenChange(false);
      onSigned(updated);
    } catch (err) {
      setError(apiErrorMessage(err, copy.error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description(consent.title, consent.signerName)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="flex min-w-0 flex-col gap-4">
          {error ? <InlineError variant="summary">{error}</InlineError> : null}
          <SignaturePad
            label={copy.signature(consent.professionalName)}
            hint={copy.hint}
            onChange={setSignature}
            disabled={submitting}
          />
          <p className="text-xs text-muted">{copy.immutable}</p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={submitting}>
                {copy.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" loading={submitting} disabled={!signature}>
              {copy.sign}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
