'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { rejectPlan } from '@/lib/treatment-plans/plan-options-api';
import {
  REJECTION_REASON_LABELS,
  SELECTABLE_REJECTION_REASONS,
  type RejectionReason,
} from '@/lib/treatment-plans/plan-options';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { FormModal } from '@/components/shared/form-modal';
import { Label } from '@/components/ui/label';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';

// Mismo tope que `RejectTreatmentPlanDto.note` en la API.
const NOTE_MAX = 500;

const copy = {
  title: 'Marcar como rechazado',
  description:
    'El presupuesto deja de estar pendiente y sale de «Presupuestos por seguir». Queda registrado el motivo y cuándo se rechazó.',
  reasonLegend: 'Motivo',
  noteLabel: 'Nota (opcional)',
  noteLabelRequired: 'Nota',
  noteHint: `Hasta ${NOTE_MAX} caracteres.`,
  reasonRequired: 'Elige el motivo del rechazo.',
  noteRequired: 'Con el motivo «Otro» describe en la nota por qué lo rechazó.',
  submit: 'Marcar rechazado',
  genericError: 'No pudimos marcar el presupuesto como rechazado. Intenta de nuevo.',
};

interface RejectPlanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  planId: string;
  /** Qué presupuesto se rechaza, p. ej. «Opción B · Ana Pérez». */
  subject?: string;
  onRejected: (plan: TreatmentPlan) => void;
}

/**
 * Rechazar un plan presentado (DX-040) con un motivo del catálogo. «Otro»
 * exige la nota. El estado vive aquí: quien lo usa lo monta con una `key` por
 * plan para que cada rechazo empiece en blanco.
 */
export function RejectPlanModal({
  open,
  onOpenChange,
  token,
  planId,
  subject,
  onRejected,
}: RejectPlanModalProps) {
  const noteId = useId();
  const [reason, setReason] = useState<RejectionReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const noteRequired = reason === 'OTHER';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reason) {
      setError(copy.reasonRequired);
      return;
    }
    const trimmed = note.trim();
    if (noteRequired && trimmed === '') {
      setError(copy.noteRequired);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const rejected = await rejectPlan(token, planId, {
        reason,
        ...(trimmed ? { note: trimmed } : {}),
      });
      onRejected(rejected);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
    >
      {subject ? (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm font-medium text-ink">{subject}</p>
      ) : null}
      <RadioGroup
        id="rejection-reason"
        legend={copy.reasonLegend}
        value={reason ?? ''}
        onValueChange={(value) => {
          setReason(value as typeof reason);
          setError(null);
        }}
        disabled={submitting}
        optionsClassName="flex flex-col gap-2"
      >
        {SELECTABLE_REJECTION_REASONS.map((value, index) => (
          <RadioCard
            key={value}
            id={index === 0 ? 'rejection-reason' : undefined}
            value={value}
            title={REJECTION_REASON_LABELS[value]}
          />
        ))}
      </RadioGroup>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={noteId}>{noteRequired ? copy.noteLabelRequired : copy.noteLabel}</Label>
        <Textarea
          id={noteId}
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          disabled={submitting}
          aria-required={noteRequired || undefined}
          aria-invalid={error === copy.noteRequired || undefined}
          onChange={(e) => setNote(e.target.value)}
          aria-describedby={`${noteId}-hint`}
        />
        <p id={`${noteId}-hint`} className="t-caption text-muted">
          {copy.noteHint}
        </p>
      </div>
    </FormModal>
  );
}
