'use client';
import * as React from 'react';
import { useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { createPerioExam, type PerioExamDetail } from '@/lib/perio/perio-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';

const copy = {
  title: 'Nuevo examen periodontal',
  description: 'Se crea como borrador: podrás cargar las medidas y finalizarlo cuando termines.',
  date: 'Fecha del examen',
  notes: 'Notas (opcional)',
  copySkipped: 'Copiar los dientes omitidos del último examen',
  submit: 'Crear examen',
  error: 'No pudimos crear el examen.',
  futureDate: 'La fecha del examen no puede ser futura.',
};

/** Hoy en la zona horaria del navegador, `YYYY-MM-DD`. */
function today(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

interface NewPerioExamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** Hay exámenes previos: se ofrece copiar los dientes omitidos. */
  hasPrevious: boolean;
  onCreated: (exam: PerioExamDetail) => void;
}

export function NewPerioExamModal({
  open,
  onOpenChange,
  token,
  patientId,
  hasPrevious,
  onCreated,
}: NewPerioExamModalProps) {
  const [examDate, setExamDate] = useState(today);
  // Sin tocar la fecha no se envía: la API pone «hoy» en la zona horaria de la
  // clínica, que puede no coincidir con la del navegador cerca de medianoche.
  const [dateTouched, setDateTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [copySkipped, setCopySkipped] = useState(hasPrevious);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (examDate > today()) {
      setError(copy.futureDate);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const exam = await createPerioExam(token, patientId, {
        examDate: dateTouched ? examDate : undefined,
        notes: notes.trim() || undefined,
        copySkippedFromLast: hasPrevious && copySkipped,
      });
      onCreated(exam);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.error);
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
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={copy.submit}
      submitting={submitting}
      submitDisabled={examDate === ''}
      error={error}
    >
      <FormField htmlFor="perio-exam-date" label={copy.date}>
        <Input
          id="perio-exam-date"
          type="date"
          required
          max={today()}
          value={examDate}
          onChange={(e) => {
            setExamDate(e.target.value);
            setDateTouched(true);
          }}
        />
      </FormField>
      <FormField htmlFor="perio-exam-notes" label={copy.notes}>
        <textarea
          id="perio-exam-notes"
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </FormField>
      {hasPrevious ? (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={copySkipped}
            onChange={(e) => setCopySkipped(e.target.checked)}
            className="size-4 accent-[var(--color-primary)]"
          />
          {copy.copySkipped}
        </label>
      ) : null}
    </FormModal>
  );
}
