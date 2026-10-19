'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createClinicalEntry,
  type ClinicalEntry,
  type CreateClinicalEntryInput,
} from '@/lib/patients/clinical-api';
import { listNoteTemplates, type NoteTemplate } from '@/lib/clinical-notes/note-templates-api';
import {
  composeNote,
  initialAnswer,
  type PromptAnswer,
} from '@/lib/clinical-notes/compose';
import { appointmentLine } from '@/lib/clinical-notes/appointment-line';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { FieldError } from '@/components/errors/field-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import { TemplatePicker } from './template-picker';
import { TemplatePrompts } from './template-prompts';
import { DiagnosesFields } from './diagnoses-fields';
import {
  diagnosesPayload,
  emptyDiagnosesDraft,
  type DiagnosesDraft,
} from '@/lib/rda/diagnoses-draft';

export const newEvolutionCopy = {
  title: 'Nueva evolución',
  titleForAppointment: 'Registrar evolución',
  description:
    'Elige una plantilla y responde sus preguntas, o escribe la evolución a mano. Una vez guardada no se puede modificar: se corrige con una adenda.',
  entryDate: 'Fecha de atención',
  entryDateHint: 'Si la dejas vacía se usa hoy. No puede ser una fecha futura.',
  futureDate: 'La fecha de atención no puede ser futura.',
  reason: 'Motivo',
  templatesError: 'Plantillas no disponibles',
  notes: 'Texto de la evolución',
  notesHintTemplate:
    'Se rellena con tus respuestas mientras contestas. Revísalo y edítalo si hace falta antes de guardar.',
  notesHintFree: 'Lo que se hizo en la atención.',
  editedByHand: 'Editaste el texto a mano: las respuestas ya no lo cambian.',
  recompose: 'Volver a componer desde las respuestas',
  notesRequired: 'Escribe el texto de la evolución.',
  submit: 'Guardar evolución',
  genericError: 'No pudimos guardar la evolución. Intenta de nuevo.',
};

const copy = newEvolutionCopy;

/** La cita a la que se liga la evolución (desde la Agenda). */
export interface EvolutionAppointment {
  id: string;
  start: string;
  providerName?: string | null;
}

interface NewEvolutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** DX-170: con cita, la evolución queda ligada a ella y toma su fecha. */
  appointment?: EvolutionAppointment | null;
  onCreated: (entry: ClinicalEntry) => void;
}

/** Día local `yyyy-mm-dd` de un instante. */
function localDay(d: Date): string {
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Hoy en formato `yyyy-mm-dd`, para topar el `<input type="date">`. */
function todayISO(): string {
  return localDay(new Date());
}

/**
 * «Nueva evolución» (DX-170): selector de plantilla con búsqueda, TODAS sus
 * preguntas a la vez y el texto compuesto, que se ve mientras se contesta y
 * se puede editar antes de guardar. Lo que se guarda es TEXTO (`notes`):
 * editar o desactivar la plantilla después no cambia la evolución (DX-038).
 *
 * Desde la cita, la evolución queda ligada a ella y la API pone como fecha de
 * atención el día de la cita en la zona de su sede. El padre lo monta con una
 * `key` por apertura.
 */
export function NewEvolutionModal({
  open,
  onOpenChange,
  token,
  patientId,
  appointment,
  onCreated,
}: NewEvolutionModalProps) {
  const [templates, setTemplates] = useState<NoteTemplate[] | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);
  const [templatesReloadKey, setTemplatesReloadKey] = useState(0);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, PromptAnswer>>({});
  const [entryDate, setEntryDate] = useState('');
  const [reason, setReason] = useState('');
  // Texto escrito a mano; `null` = el texto sigue a las respuestas.
  const [manualNotes, setManualNotes] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  // DX-212: diagnósticos CIE-10 (opcionales), guardados con la evolución.
  const [diagnoses, setDiagnoses] = useState<DiagnosesDraft>(emptyDiagnosesDraft);
  const [diagnosesError, setDiagnosesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listNoteTemplates(token)
      .then((data) => {
        if (cancelled) return;
        setTemplates(data);
        setTemplatesFailed(false);
      })
      .catch(() => {
        if (!cancelled) setTemplatesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, templatesReloadKey]);

  const template = useMemo(
    () => templates?.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );
  const composed = template ? composeNote(template.body, template.prompts, answers) : '';
  const notes = manualNotes ?? composed;

  function selectTemplate(id: string | null) {
    setTemplateId(id);
    const next = templates?.find((t) => t.id === id);
    setAnswers(
      Object.fromEntries((next?.prompts ?? []).map((p) => [p.id, initialAnswer(p)])),
    );
    // Cambiar de plantilla vuelve a componer; sin plantilla, se conserva lo
    // que ya hubiera para no perder lo escrito.
    setManualNotes(next ? null : manualNotes ?? composed);
    setNotesError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotesError(null);
    setDateError(null);
    setDiagnosesError(null);
    if (!appointment && entryDate && entryDate > todayISO()) {
      setDateError(copy.futureDate);
      return;
    }
    const text = notes.trim();
    if (text === '') {
      setNotesError(copy.notesRequired);
      return;
    }
    const dx = diagnosesPayload(diagnoses);
    if ('error' in dx) {
      setDiagnosesError(dx.error);
      return;
    }
    // Con cita no se manda fecha: la API usa el DÍA de la cita en la zona de
    // su sede (fecha civil, como la que se elige a mano), no el del navegador.
    const civilDay = appointment ? '' : entryDate;
    const input: CreateClinicalEntryInput = {
      notes: text,
      ...(civilDay ? { entryDate: new Date(civilDay).toISOString() } : {}),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(template ? { templateId: template.id } : {}),
      ...(appointment ? { appointmentId: appointment.id } : {}),
      ...(dx.diagnoses.length > 0 ? { diagnoses: dx.diagnoses } : {}),
    };
    setSubmitting(true);
    try {
      const created = await createClinicalEntry(token, patientId, input);
      onCreated({ ...created, addenda: created.addenda ?? [] });
      onOpenChange(false);
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
      title={appointment ? copy.titleForAppointment : copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      size="lg"
    >
      {appointment ? (
        <p className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink">
          <CalendarCheck aria-hidden className="size-4 shrink-0 text-muted" />
          <span className="tabular-nums">
            {appointmentLine(appointment.start, appointment.providerName)}
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {appointment ? null : (
          <FormField
            htmlFor="evo-entry-date"
            label={copy.entryDate}
            hint={copy.entryDateHint}
            error={dateError}
          >
            <Input
              id="evo-entry-date"
              type="date"
              max={todayISO()}
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
          </FormField>
        )}
        <FormField htmlFor="evo-reason" label={copy.reason}>
          <Input id="evo-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
      </div>

      {templatesFailed ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Plantilla</span>
          <FieldError
            label={copy.templatesError}
            onRetry={() => setTemplatesReloadKey((k) => k + 1)}
          />
        </div>
      ) : templates === null ? (
        <div role="status" aria-label="Cargando plantillas" className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <TemplatePicker templates={templates} value={templateId} onChange={selectTemplate} />
      )}

      {template && template.prompts.length > 0 ? (
        <TemplatePrompts
          prompts={template.prompts}
          answers={answers}
          onChange={(promptId, answer) =>
            setAnswers((prev) => ({ ...prev, [promptId]: answer }))
          }
        />
      ) : null}

      <FormField
        htmlFor="evo-notes"
        label={copy.notes}
        hint={template ? copy.notesHintTemplate : copy.notesHintFree}
        error={notesError}
      >
        <textarea
          id="evo-notes"
          rows={template ? 6 : 4}
          value={notes}
          aria-invalid={notesError ? true : undefined}
          onChange={(e) => setManualNotes(e.target.value)}
          className={cn(fieldClass, 'h-auto min-h-24 whitespace-pre-wrap break-words')}
        />
      </FormField>
      <DiagnosesFields
        token={token}
        value={diagnoses}
        onChange={(next) => {
          setDiagnoses(next);
          setDiagnosesError(null);
        }}
        error={diagnosesError}
      />

      {template && manualNotes !== null ? (
        <div className="-mt-2 flex flex-col items-start gap-1 text-xs text-muted">
          <p>{copy.editedByHand}</p>
          <button
            type="button"
            onClick={() => setManualNotes(null)}
            className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {copy.recompose}
          </button>
        </div>
      ) : null}
    </FormModal>
  );
}
