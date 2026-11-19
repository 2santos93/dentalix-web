'use client';
import * as React from 'react';
import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createRecallContactsBatch,
  type RecallContactChannel,
  type RecallContactOutcome,
  type RecallDueItem,
} from '@/lib/recall/recall-api';
import {
  BATCH_OUTCOME_ORDER,
  CHANNEL_LABELS,
  CHANNEL_ORDER,
  OUTCOME_LABELS,
  RECALL_NOTE_MAX,
  callbackError,
  callbackRange,
} from '@/lib/recall/presentation';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Callout } from '@/components/ui/callout';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { RecallCallbackField } from './recall-callback-field';
import { contactDialogCopy, safeToday } from './recall-contact-dialog';

export const batchContactCopy = {
  title: (n: number) => (n === 1 ? 'Registrar intento de 1 paciente' : `Registrar intento de ${n} pacientes`),
  description:
    'El mismo canal, resultado y nota para todos. Se guardan todos o ninguno, y no se editan ni se borran.',
  patients: 'Pacientes',
  submit: (n: number) => (n === 1 ? 'Guardar 1 intento' : `Guardar ${n} intentos`),
  bookedHint: '«Agendó» no se registra en lote: se registra al agendar la cita de cada paciente.',
  saveError: 'No pudimos guardar los intentos. Intenta de nuevo.',
  missing: (names: string[]) =>
    names.length === 1
      ? `${names[0]} ya no está en la lista de recall: lo quitamos de la selección. No se guardó ningún intento; revisa y vuelve a guardar.`
      : `${names.join(', ')} ya no están en la lista de recall: los quitamos de la selección. No se guardó ningún intento; revisa y vuelve a guardar.`,
  forbidden:
    'No se guardó ningún intento: algún paciente es de una sede que no gestionas o tu rol no trabaja la lista de recall.',
};
const copy = batchContactCopy;

/**
 * «Registrar intento» en lote (DX-465): el mismo canal, desenlace y nota para
 * los pacientes marcados en la lista, en UNA petición todo-o-nada
 * (`POST /recall/contacts/batch`). Sin «Agendó». Con «Llamar luego» pide el
 * día (el rango que vale en las sedes de todos). Si alguno ya no existe (404),
 * se quita de la selección y no se guarda nada.
 */
export function RecallBatchContactDialog({
  open,
  onOpenChange,
  token,
  items,
  timeZoneOf,
  onSaved,
  onMissing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  items: readonly RecallDueItem[];
  /** Zona de la sede del paciente (`item.locationId`); `null` si no se sabe. */
  timeZoneOf: (locationId: string) => string | null;
  onSaved: (count: number) => void;
  /** Los recalls que el servidor no encontró: se quitan de la selección. */
  onMissing: (recallIds: readonly string[]) => void;
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

  const range = callbackRange(
    [...new Set(items.map((i) => i.locationId))].map((id) => {
      const zone = timeZoneOf(id);
      return zone ? safeToday(zone) : null;
    }),
  );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!channel) next.channel = contactDialogCopy.channelRequired;
    if (!outcome) next.outcome = contactDialogCopy.outcomeRequired;
    if (note.trim().length > RECALL_NOTE_MAX) next.note = contactDialogCopy.noteTooLong;
    const callback = outcome === 'CALL_BACK' ? callbackError(callbackOn, range) : null;
    if (callback) next.callbackOn = callback;
    setErrors(next);
    if (Object.keys(next).length > 0 || !channel || !outcome || items.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await createRecallContactsBatch(token, {
        items: items.map((i) => ({ recallId: i.recallId })),
        channel,
        outcome,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(outcome === 'CALL_BACK' && callbackOn ? { callbackOn } : {}),
      });
      onSaved(res.contacts.length);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404 && err.recallIds && err.recallIds.length > 0) {
        const missing = new Set(err.recallIds);
        setSubmitError(copy.missing(items.filter((i) => missing.has(i.recallId)).map((i) => i.patientName)));
        onMissing(err.recallIds);
      } else if (err instanceof ApiError && err.status === 403) {
        // Rol sin la lista o algún paciente de otra sede: en los dos casos, nada guardado.
        setSubmitError(copy.forbidden);
      } else {
        // 400 (fecha, nota), 409 (sede sin zona) y 429 (demasiados lotes seguidos) con el texto de la API.
        setSubmitError(apiErrorMessage(err, { fallback: copy.saveError }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const length = note.trim().length;
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title(items.length)}
      description={copy.description}
      onSubmit={(e) => void submit(e)}
      submitLabel={copy.submit(items.length)}
      submitting={submitting}
      error={submitError}
    >
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium text-ink">{copy.patients}</h3>
        <ul
          aria-label={copy.patients}
          className="flex max-h-32 flex-col overflow-y-auto rounded-lg border border-border-subtle px-3 py-2 text-sm text-ink"
        >
          {items.map((i) => (
            <li key={i.recallId} className="break-words">
              {i.patientName}
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="rb-channel" label={contactDialogCopy.channel} error={errors.channel}>
          <NativeSelect
            id="rb-channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as RecallContactChannel | '')}
            aria-invalid={errors.channel ? true : undefined}
          >
            <option value="">{contactDialogCopy.choose}</option>
            {CHANNEL_ORDER.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor="rb-outcome" label={contactDialogCopy.outcome} hint={copy.bookedHint} error={errors.outcome}>
          <NativeSelect
            id="rb-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as RecallContactOutcome | '')}
            aria-invalid={errors.outcome ? true : undefined}
          >
            <option value="">{contactDialogCopy.choose}</option>
            {BATCH_OUTCOME_ORDER.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      {outcome === 'CALL_BACK' ? (
        <RecallCallbackField
          id="rb-callback"
          value={callbackOn}
          onChange={(value) => {
            setCallbackOn(value);
            setErrors((prev) => ({ ...prev, callbackOn: undefined }));
          }}
          range={range}
          error={errors.callbackOn}
        />
      ) : null}
      <FormField htmlFor="rb-note" label={contactDialogCopy.note} error={errors.note}>
        <Callout id="rb-note-warning" tone="warning" role="note" icon={ShieldAlert}>
          {contactDialogCopy.clinicalWarning}
        </Callout>
        <Textarea
          id="rb-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          autoGrow
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={cn('rb-note-warning rb-note-counter', errors.note && fieldErrorId('rb-note'))}
        />
        <p
          id="rb-note-counter"
          className={cn('text-right text-xs tabular-nums', length > RECALL_NOTE_MAX ? 'text-danger-text' : 'text-muted')}
        >
          {contactDialogCopy.counter(length)}
        </p>
      </FormField>
    </FormModal>
  );
}
