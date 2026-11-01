'use client';
import * as React from 'react';
import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createRecallContact,
  type RecallContact,
  type RecallContactChannel,
  type RecallContactOutcome,
} from '@/lib/recall/recall-api';
import {
  CHANNEL_LABELS,
  CHANNEL_ORDER,
  OUTCOME_LABELS,
  OUTCOME_ORDER,
  RECALL_NOTE_MAX,
} from '@/lib/recall/presentation';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Callout } from '@/components/ui/callout';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const contactDialogCopy = {
  title: 'Registrar contacto',
  description: (name: string) => `Contacto con ${name}. No se edita ni se borra: si te equivocas, registra otro.`,
  channel: 'Canal',
  outcome: 'Resultado',
  choose: 'Elige una opción',
  note: 'Nota (opcional)',
  counter: (n: number) => `${n}/${RECALL_NOTE_MAX}`,
  clinicalWarning: 'No escribas datos clínicos (diagnósticos, tratamientos, medicación): solo lo hablado sobre la cita.',
  submit: 'Guardar contacto',
  channelRequired: 'Elige el canal del contacto.',
  outcomeRequired: 'Elige el resultado del contacto.',
  noteTooLong: `La nota admite hasta ${RECALL_NOTE_MAX} caracteres.`,
  saveError: 'No pudimos guardar el contacto. Intenta de nuevo.',
};
const copy = contactDialogCopy;

/** «Registrar contacto» (DX-015): canal, resultado y nota corta. Append-only. */
export function RecallContactDialog({
  open,
  onOpenChange,
  token,
  recallId,
  patientName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  recallId: string;
  patientName: string;
  onSaved: (contact: RecallContact) => void;
}) {
  const [channel, setChannel] = useState<RecallContactChannel | ''>('');
  const [outcome, setOutcome] = useState<RecallContactOutcome | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ channel?: string; outcome?: string; note?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Cada apertura empieza en blanco.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setChannel('');
      setOutcome('');
      setNote('');
      setErrors({});
      setSubmitError(null);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!channel) next.channel = copy.channelRequired;
    if (!outcome) next.outcome = copy.outcomeRequired;
    if (note.trim().length > RECALL_NOTE_MAX) next.note = copy.noteTooLong;
    setErrors(next);
    if (Object.keys(next).length > 0 || !channel || !outcome) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const contact = await createRecallContact(token, recallId, {
        channel,
        outcome,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onSaved(contact);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(apiErrorMessage(err, { fallback: copy.saveError }));
    } finally {
      setSubmitting(false);
    }
  }

  const length = note.trim().length;
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description(patientName)}
      onSubmit={(e) => void submit(e)}
      submitLabel={copy.submit}
      submitting={submitting}
      error={submitError}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="rc-channel" label={copy.channel} error={errors.channel}>
          <NativeSelect
            id="rc-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as RecallContactChannel | '')}
            aria-invalid={errors.channel ? true : undefined}
            aria-describedby={errors.channel ? fieldErrorId('rc-channel') : undefined}
          >
            <option value="">{copy.choose}</option>
            {CHANNEL_ORDER.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor="rc-outcome" label={copy.outcome} error={errors.outcome}>
          <NativeSelect
            id="rc-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as RecallContactOutcome | '')}
            aria-invalid={errors.outcome ? true : undefined}
            aria-describedby={errors.outcome ? fieldErrorId('rc-outcome') : undefined}
          >
            <option value="">{copy.choose}</option>
            {OUTCOME_ORDER.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <FormField htmlFor="rc-note" label={copy.note} error={errors.note}>
        <Callout id="rc-note-warning" tone="warning" role="note" icon={ShieldAlert}>
          {copy.clinicalWarning}
        </Callout>
        <Textarea
          id="rc-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          autoGrow
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={cn('rc-note-warning rc-note-counter', errors.note && fieldErrorId('rc-note'))}
        />
        <p
          id="rc-note-counter"
          className={cn('text-right text-xs tabular-nums', length > RECALL_NOTE_MAX ? 'text-danger-text' : 'text-muted')}
        >
          {copy.counter(length)}
        </p>
      </FormField>
    </FormModal>
  );
}
