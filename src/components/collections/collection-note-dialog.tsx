'use client';
import * as React from 'react';
import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { createCollectionNote, type CollectionChannel, type CollectionNote, type CollectionOutcome } from '@/lib/collections/collections-api';
import {
  CHANNEL_LABELS,
  CHANNEL_ORDER,
  NOTE_TEXT_MAX,
  OUTCOME_LABELS,
  OUTCOME_ORDER,
} from '@/lib/collections/presentation';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { toolbarFieldClass } from '@/components/shared/list-toolbar';
import { cn } from '@/lib/utils';

export const noteDialogCopy = {
  title: 'Registrar gestión',
  description: (name: string) => `Gestión de cobro con ${name}. No se edita ni se borra: si te equivocas, registra otra.`,
  channel: 'Canal',
  outcome: 'Resultado',
  choose: 'Elige una opción',
  text: 'Nota (opcional)',
  textCounter: (n: number) => `${n}/${NOTE_TEXT_MAX}`,
  clinicalWarning: 'No escribas datos clínicos (diagnósticos, tratamientos, medicación): solo lo hablado sobre el pago.',
  submit: 'Guardar gestión',
  channelRequired: 'Elige el canal de la gestión.',
  outcomeRequired: 'Elige el resultado de la gestión.',
  textTooLong: `La nota admite hasta ${NOTE_TEXT_MAX} caracteres.`,
  saveError: 'No pudimos guardar la gestión. Intenta de nuevo.',
};

interface CollectionNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patient: { id: string; fullName: string };
  onSaved: (note: CollectionNote) => void;
}

/**
 * «Registrar gestión» (DX-150): canal, resultado y una nota corta sin datos
 * clínicos. Append-only: la API no deja editar ni borrar; una corrección es
 * otra gestión.
 */
export function CollectionNoteDialog({ open, onOpenChange, token, patient, onSaved }: CollectionNoteDialogProps) {
  const [channel, setChannel] = useState<CollectionChannel | ''>('');
  const [outcome, setOutcome] = useState<CollectionOutcome | ''>('');
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<{ channel?: string; outcome?: string; text?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Cada apertura empieza en blanco.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setChannel('');
      setOutcome('');
      setText('');
      setErrors({});
      setSubmitError(null);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!channel) next.channel = noteDialogCopy.channelRequired;
    if (!outcome) next.outcome = noteDialogCopy.outcomeRequired;
    if (text.trim().length > NOTE_TEXT_MAX) next.text = noteDialogCopy.textTooLong;
    setErrors(next);
    if (Object.keys(next).length > 0 || !channel || !outcome) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const note = await createCollectionNote(token, patient.id, {
        channel,
        outcome,
        ...(text.trim() ? { text: text.trim() } : {}),
      });
      onSaved(note);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(apiErrorMessage(err, { fallback: noteDialogCopy.saveError }));
    } finally {
      setSubmitting(false);
    }
  }

  const length = text.trim().length;
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={noteDialogCopy.title}
      description={noteDialogCopy.description(patient.fullName)}
      onSubmit={(e) => void submit(e)}
      submitLabel={noteDialogCopy.submit}
      submitting={submitting}
      error={submitError}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="cn-channel" label={noteDialogCopy.channel} error={errors.channel}>
          <select
            id="cn-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as CollectionChannel | '')}
            aria-invalid={errors.channel ? true : undefined}
            aria-describedby={errors.channel ? fieldErrorId('cn-channel') : undefined}
            className={toolbarFieldClass}
          >
            <option value="">{noteDialogCopy.choose}</option>
            {CHANNEL_ORDER.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField htmlFor="cn-outcome" label={noteDialogCopy.outcome} error={errors.outcome}>
          <select
            id="cn-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as CollectionOutcome | '')}
            aria-invalid={errors.outcome ? true : undefined}
            aria-describedby={errors.outcome ? fieldErrorId('cn-outcome') : undefined}
            className={toolbarFieldClass}
          >
            <option value="">{noteDialogCopy.choose}</option>
            {OUTCOME_ORDER.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <FormField htmlFor="cn-text" label={noteDialogCopy.text} error={errors.text}>
        <p id="cn-text-warning-text" className="flex items-start gap-1.5 rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning-text">
          <ShieldAlert aria-hidden className="mt-px size-4 shrink-0" />
          {noteDialogCopy.clinicalWarning}
        </p>
        <textarea
          id="cn-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          aria-invalid={errors.text ? true : undefined}
          aria-describedby={cn('cn-text-warning-text cn-text-counter', errors.text && fieldErrorId('cn-text'))}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        <p
          id="cn-text-counter"
          className={cn('text-right text-xs tabular-nums', length > NOTE_TEXT_MAX ? 'text-danger-text' : 'text-muted')}
        >
          {noteDialogCopy.textCounter(length)}
        </p>
      </FormField>
    </FormModal>
  );
}
