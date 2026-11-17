'use client';
import * as React from 'react';
import { useState } from 'react';
import { ApiError } from '@/lib/api/api-error';
import { getTokenRole } from '@/lib/auth/token-role';
import { apiErrorMessage } from '@/lib/api/error-message';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import {
  POST_OP_MAX_NO_ANSWER,
  POST_OP_NOTE_MAX,
  POST_OP_OUTCOME_LABELS,
  POST_OP_OUTCOME_ORDER,
  isPostOpCheckClosedError,
  registerPostOpAttempt,
  type PostOpAttemptOutcome,
  type PostOpCheck,
  type PostOpCheckItem,
} from '@/lib/post-op-checks/post-op-checks-api';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export const outcomeDialogCopy = {
  title: 'Registrar resultado',
  description: (name: string, procedure: string | null) =>
    procedure ? `Llamada de control a ${name} por ${procedure}.` : `Llamada de control a ${name}.`,
  outcome: 'Resultado',
  hints: {
    FINE: 'Cierra el control.',
    DISCOMFORT: 'Cierra el control; anota qué refiere el paciente.',
    NEEDS_APPOINTMENT: 'Cierra el control y abre la agenda para darle cita.',
    NO_ANSWER: `Suma un intento. Al ${POST_OP_MAX_NO_ANSWER}.º sin respuesta el control se cierra como «No localizado».`,
  } satisfies Record<PostOpAttemptOutcome, string>,
  noAnswerLast: 'Es el tercer intento: el control se cerrará como «No localizado».',
  note: 'Nota (opcional)',
  noteHint: 'Queda en la historia clínica del paciente al cerrar el control.',
  counter: (n: number) => `${n}/${POST_OP_NOTE_MAX}`,
  outcomeRequired: 'Elige el resultado de la llamada.',
  noteTooLong: `La nota admite hasta ${POST_OP_NOTE_MAX} caracteres.`,
  submit: 'Guardar resultado',
  submitBook: 'Guardar y agendar cita',
  saveError: 'No pudimos guardar el resultado. Intenta de nuevo.',
  // 409 LOCATION_LOCALE_REQUIRED (G1-B §10): sin el formato de la sede no se escribe la historia.
  localeMissing: (isAdmin: boolean) =>
    `La sede del control no tiene formato regional configurado: sin él no se puede escribir el resultado en la historia clínica. ${
      isAdmin
        ? 'Configúralo en Ajustes → Sedes y vuelve a intentarlo.'
        : 'Pide a quien administra la clínica que lo configure en Ajustes → Sedes y vuelve a intentarlo.'
    }`,
};

/** El 409 de la sede sin formato regional: un dato que falta, no un fallo. */
function isLocaleMissing(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 409 && err.code === 'LOCATION_LOCALE_REQUIRED';
}
const copy = outcomeDialogCopy;

/**
 * «Registrar resultado» del control postoperatorio (DX-566, solo clínicos):
 * Bien, Molestias, Necesita cita o No contesta, con una nota. Los tres
 * primeros cierran el control y lo dejan en la historia; «No contesta» suma
 * un intento (al tercero, «No localizado»). Un 409 (otra persona ya lo cerró)
 * no se queda en el diálogo: va a `onClosedElsewhere`, que avisa y relee.
 */
export function PostOpOutcomeDialog({
  open,
  onOpenChange,
  token,
  item,
  onSaved,
  onClosedElsewhere,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  item: PostOpCheckItem;
  onSaved: (check: PostOpCheck, outcome: PostOpAttemptOutcome) => void;
  onClosedElsewhere: (message: string) => void;
}) {
  const [outcome, setOutcome] = useState<PostOpAttemptOutcome | ''>('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ outcome?: string; note?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // La sede a la que le falta el formato regional (409 LOCATION_LOCALE_REQUIRED).
  const [localeMissing, setLocaleMissing] = useState<{ locationId: string } | null>(null);

  // Cada apertura empieza en blanco.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setOutcome('');
      setNote('');
      setErrors({});
      setSubmitError(null);
      setLocaleMissing(null);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await save();
  }

  async function save() {
    const trimmed = note.trim();
    const next: typeof errors = {};
    if (!outcome) next.outcome = copy.outcomeRequired;
    if (trimmed.length > POST_OP_NOTE_MAX) next.note = copy.noteTooLong;
    setErrors(next);
    if (Object.keys(next).length > 0 || !outcome) return;
    setSubmitting(true);
    setSubmitError(null);
    setLocaleMissing(null);
    try {
      const check = await registerPostOpAttempt(token, item.id, { outcome, ...(trimmed ? { note: trimmed } : {}) });
      onOpenChange(false);
      onSaved(check, outcome);
    } catch (err) {
      if (isLocaleMissing(err)) {
        setLocaleMissing({ locationId: err.locationId ?? item.locationId });
      } else if (isPostOpCheckClosedError(err)) {
        onOpenChange(false);
        onClosedElsewhere(apiErrorMessage(err, { fallback: copy.saveError }));
      } else {
        setSubmitError(apiErrorMessage(err, { fallback: copy.saveError }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const length = note.trim().length;
  const lastTry = outcome === 'NO_ANSWER' && item.attemptsCount >= POST_OP_MAX_NO_ANSWER - 1;
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description(item.patientName, item.procedureName)}
      onSubmit={(e) => void submit(e)}
      submitLabel={outcome === 'NEEDS_APPOINTMENT' ? copy.submitBook : copy.submit}
      submitting={submitting}
      error={submitError}
      touchTargets
    >
      <RadioGroup
        id="post-op-outcome"
        legend={copy.outcome}
        value={outcome}
        onValueChange={(v) => {
          setOutcome(v as PostOpAttemptOutcome);
          setErrors((prev) => ({ ...prev, outcome: undefined }));
        }}
        error={errors.outcome}
      >
        {POST_OP_OUTCOME_ORDER.map((o, i) => (
          <RadioOption
            key={o}
            id={i === 0 ? 'post-op-outcome' : undefined}
            value={o}
            label={POST_OP_OUTCOME_LABELS[o]}
            description={copy.hints[o]}
          />
        ))}
      </RadioGroup>
      {localeMissing ? (
        <SedeConfigError
          kind="locale"
          variant="note"
          description={copy.localeMissing(getTokenRole(token) === 'ADMIN')}
          locationId={localeMissing.locationId}
          onRetry={() => void save()}
        />
      ) : null}
      {lastTry ? (
        <p role="status" className="text-sm text-warning-text">
          {copy.noAnswerLast}
        </p>
      ) : null}
      <FormField htmlFor="post-op-note" label={copy.note} hint={copy.noteHint} error={errors.note}>
        <Textarea
          id="post-op-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          autoGrow
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={cn('post-op-note-counter', errors.note && fieldErrorId('post-op-note'))}
        />
        <p
          id="post-op-note-counter"
          className={cn('text-right text-xs tabular-nums', length > POST_OP_NOTE_MAX ? 'text-danger-text' : 'text-muted')}
        >
          {copy.counter(length)}
        </p>
      </FormField>
    </FormModal>
  );
}
