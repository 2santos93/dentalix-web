'use client';
import * as React from 'react';
import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  createRecallContact,
  type RecallContact,
  type RecallContactChannel,
  type RecallContactOutcome,
} from '@/lib/recall/recall-api';
import { CHANNEL_LABELS, CHANNEL_ORDER, OUTCOME_LABELS, OUTCOME_ORDER, RECALL_NOTE_MAX } from '@/lib/recall/presentation';
import { callbackError, callbackRange, recallWriteError } from '@/lib/recall/attempts-presentation';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Callout } from '@/components/ui/callout';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { RecallCallbackField } from './recall-callback-field';
import { announceRecallQueueChanged } from './recall-work-queues';

export const contactDialogCopy = {
  title: 'Registrar intento',
  description: (name: string) => `Intento con ${name}. No se edita ni se borra: si te equivocas, registra otro.`,
  channel: 'Canal',
  outcome: 'Resultado',
  choose: 'Elige una opción',
  note: 'Nota (opcional)',
  counter: (n: number) => `${n}/${RECALL_NOTE_MAX}`,
  clinicalWarning: 'No escribas datos clínicos (diagnósticos, tratamientos, medicación): solo lo hablado sobre la cita.',
  submit: 'Guardar intento',
  // D23: «Agendó» no se guarda sin cita: sigue en «Agendar».
  submitBooked: 'Agendar cita…',
  bookedHint: 'El contacto se guarda al agendar la cita, con este canal y esta nota.',
  channelRequired: 'Elige el canal del intento.',
  outcomeRequired: 'Elige el resultado del intento.',
  noteTooLong: `La nota admite hasta ${RECALL_NOTE_MAX} caracteres.`,
  saveError: 'No pudimos guardar el intento. Intenta de nuevo.',
};
const copy = contactDialogCopy;

/**
 * «Registrar intento» (DX-015, DX-465): canal, resultado y nota corta.
 * Append-only. Con «Agendó» (D23) no guarda nada: pasa el canal y la nota a
 * `onBook`, que abre «Agendar»; el contacto se registra con la cita creada.
 * Con «Llamar luego» pide el día de volver a llamar (de hoy a 90 días en la
 * sede del paciente, `timeZone`).
 */
export function RecallContactDialog({
  open,
  onOpenChange,
  token,
  recallId,
  patientName,
  onSaved,
  onBook,
  timeZone = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  recallId: string;
  patientName: string;
  onSaved: (contact: RecallContact) => void;
  /** Sin él (la ficha) no se ofrece «Agendó»: no hay desde dónde agendar. */
  onBook?: (draft: { channel: RecallContactChannel; note: string }) => void;
  /** Zona de la sede del paciente: el «hoy» de «Llamar luego». */
  timeZone?: string | null;
}) {
  const [channel, setChannel] = useState<RecallContactChannel | ''>('');
  const [outcome, setOutcome] = useState<RecallContactOutcome | ''>('');
  const [note, setNote] = useState('');
  const [callbackOn, setCallbackOn] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ channel?: string; outcome?: string; note?: string; callbackOn?: string }>(
    {},
  );
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
      setCallbackOn(null);
      setErrors({});
      setSubmitError(null);
    }
  }

  const range = callbackRange([timeZone ? safeToday(timeZone) : null]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!channel) next.channel = copy.channelRequired;
    if (!outcome) next.outcome = copy.outcomeRequired;
    if (note.trim().length > RECALL_NOTE_MAX) next.note = copy.noteTooLong;
    const callback = outcome === 'CALL_BACK' ? callbackError(callbackOn, range) : null;
    if (callback) next.callbackOn = callback;
    setErrors(next);
    if (Object.keys(next).length > 0 || !channel || !outcome) return;
    if (outcome === 'BOOKED' && onBook) {
      onBook({ channel, note: note.trim() });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const contact = await createRecallContact(token, recallId, {
        channel,
        outcome,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(outcome === 'CALL_BACK' && callbackOn ? { callbackOn } : {}),
      });
      announceRecallQueueChanged();
      onSaved(contact);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(recallWriteError(err, copy.saveError));
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
      submitLabel={outcome === 'BOOKED' ? copy.submitBooked : copy.submit}
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
            aria-describedby={
              cn(outcome === 'BOOKED' && 'rc-outcome-booked', errors.outcome && fieldErrorId('rc-outcome')) || undefined
            }
          >
            <option value="">{copy.choose}</option>
            {OUTCOME_ORDER.filter((o) => o !== 'BOOKED' || onBook).map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      {outcome === 'BOOKED' ? (
        <p id="rc-outcome-booked" className="text-sm text-muted">
          {copy.bookedHint}
        </p>
      ) : null}
      {outcome === 'CALL_BACK' ? (
        <RecallCallbackField
          id="rc-callback"
          value={callbackOn}
          onChange={(value) => {
            setCallbackOn(value);
            setErrors((prev) => ({ ...prev, callbackOn: undefined }));
          }}
          range={range}
          error={errors.callbackOn}
        />
      ) : null}
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

/** «Hoy» en la zona de la sede; `null` con una zona que no existe (la API lo dirá). */
export function safeToday(timeZone: string): string | null {
  try {
    return sedeToday(timeZone);
  } catch {
    return null;
  }
}
