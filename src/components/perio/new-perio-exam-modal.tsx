'use client';
import * as React from 'react';
import { useState } from 'react';
import { createPerioExam, perioErrorMessage, type PerioExamDetail } from '@/lib/perio/perio-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { readyTimeZone, sedeToday, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';

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
  // DX-354b (E9): «hoy» es el de la sede de la pantalla, no el del navegador (Tokio ya está en el 5 cuando Caracas va por el 4).
  const zone = useSedeTimeZone(token);
  const timeZone = readyTimeZone(zone);
  const today = timeZone ? sedeToday(timeZone) : null;
  // Sin tocar la fecha no se envía: la API pone «hoy» en la zona horaria de la
  // clínica. `null` = sin tocar: se muestra el «hoy» de la sede.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const dateTouched = pickedDate !== null;
  const examDate = pickedDate ?? today ?? '';
  const [notes, setNotes] = useState('');
  const [copySkipped, setCopySkipped] = useState(hasPrevious);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (today !== null && examDate > today) {
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
      submitDisabled={examDate === '' || today === null}
      error={error}
    >
      <FormField htmlFor="perio-exam-date" label={copy.date}>
        {zone.status === 'error' ? (
          // Sin la zona de la sede no hay «hoy» con el que topar la fecha: el campo se sustituye por su error (escalón 2).
          <SedeConfigError kind="timeZone" variant="field" retryId="perio-exam-date" onRetry={zone.retry} />
        ) : (
          <DatePicker
            id="perio-exam-date"
            required
            disabled={today === null}
            max={today ?? undefined}
            value={examDate === '' ? null : examDate}
            onChange={(next) => setPickedDate(next ?? '')}
          />
        )}
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
