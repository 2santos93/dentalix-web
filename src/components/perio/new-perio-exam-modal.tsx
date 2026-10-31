'use client';
import * as React from 'react';
import { useState } from 'react';
import { createPerioExam, perioErrorMessage, type PerioExamDetail } from '@/lib/perio/perio-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

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
      setError(perioErrorMessage(err, copy.error));
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
        <DatePicker
          id="perio-exam-date"
          required
          max={today()}
          value={examDate === '' ? null : examDate}
          onChange={(next) => {
            setExamDate(next ?? '');
            setDateTouched(true);
          }}
        />
      </FormField>
      <FormField htmlFor="perio-exam-notes" label={copy.notes}>
        <Textarea
          id="perio-exam-notes"
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormField>
      {hasPrevious ? (
        <Checkbox
          label={copy.copySkipped}
          checked={copySkipped}
          onChange={(e) => setCopySkipped(e.target.checked)}
        />
      ) : null}
    </FormModal>
  );
}
