'use client';
import * as React from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createClinicalEntry,
  getClinicalEntrySigning,
  type ClinicalEntry,
  type CreateClinicalEntryInput,
} from '@/lib/patients/clinical-api';
import { getTokenRole, getTokenUserId } from '@/lib/auth/token-role';
import {
  ProfessionalLicenseNotice,
  announceClinicalEntryWarnings,
} from './professional-license-notice';
import { listNoteTemplates, type NoteTemplate } from '@/lib/clinical-notes/note-templates-api';
import {
  composeNote,
  initialAnswer,
  type PromptAnswer,
} from '@/lib/clinical-notes/compose';
import { appointmentLine } from '@/lib/clinical-notes/appointment-line';
import {
  missingPlaceholdersMessage,
  replaceRange,
  shortcutBeforeCaret,
  unfilledPlaceholders,
} from '@/lib/clinical-notes/shortcuts';
import { useSedeClock } from '@/lib/locations/sede-clock';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { FieldError } from '@/components/errors/field-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateField } from '@/components/ui/date-field';
import { TemplatePicker } from './template-picker';
import { TemplatePrompts } from './template-prompts';
import { ShortcutPromptsPanel } from './shortcut-prompts-panel';
import { DiagnosesFields } from './diagnoses-fields';
import {
  diagnosesPayload,
  emptyDiagnosesDraft,
  type DiagnosesDraft,
} from '@/lib/clinical-notes/diagnoses-draft';

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
  // DX-455
  shortcutHint: 'Escribe el atajo de una plantilla (p. ej. #resina) y un espacio para insertarla.',
  inserted: (name: string) => `Plantilla «${name}» insertada.`,
  suggestedBy: (procedure: string) =>
    `Sugerida por el procedimiento «${procedure}». Puedes cambiarla o quitarla antes de guardar.`,
  removeSuggested: 'Quitar plantilla',
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
  /**
   * DX-455: plantilla que viene elegida (la del procedimiento que se acaba de
   * marcar hecho). Solo se elige si está entre las ACTIVAS que devuelve la API.
   */
  suggestedTemplateId?: string | null;
  /** DX-455: el procedimiento que la sugiere, para decirlo junto al selector. */
  suggestedBy?: string | null;
}

/** DX-455: un atajo con preguntas a la espera de que se contesten. */
interface PendingShortcut {
  template: NoteTemplate;
  start: number;
  end: number;
  /** Lo que se escribió (atajo + espacio): se busca de nuevo al insertar. */
  typed: string;
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
  suggestedTemplateId = null,
  suggestedBy = null,
}: NewEvolutionModalProps) {
  // DX-378: el día de la cita, en la zona y con el formato de la sede.
  const sede = useSedeClock(token);
  const clock = sede.status === 'ready' ? sede.clock : null;
  // DX-354b (E9): «hoy» es el de la sede de la pantalla, no el del navegador (Tokio ya está en el 5 cuando Caracas va por el 4).
  const today = clock ? sedeToday(clock.timeZone) : null;
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
  // DX-540: ¿la firma saldría sin registro profesional (y la clínica avisa)?
  const [licenseMissing, setLicenseMissing] = useState(false);
  // DX-455: atajos de plantilla en el texto.
  const notesRef = useRef<HTMLTextAreaElement>(null);
  // Cursor a poner tras sustituir un atajo (se aplica después del render).
  const caretRef = useRef<number | null>(null);
  const [pendingShortcut, setPendingShortcut] = useState<PendingShortcut | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // DX-455: la sugerida se elige una sola vez (al cargar las plantillas).
  const suggestionTried = useRef(false);
  const [suggestionShown, setSuggestionShown] = useState(false);

  useLayoutEffect(() => {
    const caret = caretRef.current;
    if (caret === null || !notesRef.current) return;
    caretRef.current = null;
    notesRef.current.focus();
    notesRef.current.setSelectionRange(caret, caret);
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Fail soft: sin esta consulta no hay aviso previo, pero el alta trae el
    // mismo aviso en su respuesta (toast tras guardar).
    getClinicalEntrySigning(token)
      .then((signing) => {
        if (cancelled) return;
        setLicenseMissing(signing.warnings.some((w) => w.code === 'PROFESSIONAL_LICENSE_MISSING'));
      })
      .catch(() => {
        /* fail soft — el aviso llega con la respuesta del alta */
      });
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listNoteTemplates(token)
      .then((data) => {
        if (cancelled) return;
        setTemplates(data);
        setTemplatesFailed(false);
        // DX-455: la sugerida, solo si está activa (la lista trae solo activas).
        // Se intenta una vez: el selector no existe hasta esta primera carga,
        // así que nadie ha podido elegir otra antes.
        if (suggestedTemplateId && !suggestionTried.current) {
          suggestionTried.current = true;
          const suggested = data.find((t) => t.id === suggestedTemplateId && t.active);
          if (suggested) {
            setTemplateId(suggested.id);
            setAnswers(Object.fromEntries(suggested.prompts.map((p) => [p.id, initialAnswer(p)])));
            setSuggestionShown(true);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setTemplatesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, templatesReloadKey, suggestedTemplateId]);

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
    if (id !== suggestedTemplateId) setSuggestionShown(false);
  }

  /** DX-455: «Quitar plantilla» de la sugerida: sin plantilla y sin su texto si no se tocó. */
  function removeSuggested() {
    setTemplateId(null);
    setAnswers({});
    setManualNotes(manualNotes ?? '');
    setSuggestionShown(false);
    setNotesError(null);
  }

  /** El texto cambia a mano; «atajo + espacio» de una plantilla activa se sustituye. */
  function handleNotesChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    const caret = e.target.selectionStart ?? next.length;
    setNotesError(null);
    // Solo al teclear un carácter (no al pegar ni al borrar).
    const match =
      next.length === notes.length + 1 && templates && !pendingShortcut
        ? shortcutBeforeCaret(next, caret, templates)
        : null;
    if (!match) {
      setManualNotes(next);
      return;
    }
    if (match.template.prompts.length > 0) {
      // Con preguntas: el atajo se queda escrito mientras se contestan.
      setManualNotes(next);
      setPendingShortcut({
        template: match.template,
        start: match.start,
        end: match.end,
        typed: next.slice(match.start, match.end),
      });
      return;
    }
    insertTemplateText(next, match.start, match.end, match.template.body, match.template.name);
  }

  function insertTemplateText(text: string, start: number, end: number, insert: string, name: string) {
    const result = replaceRange(text, start, end, insert);
    caretRef.current = result.caret;
    setManualNotes(result.text);
    setAnnouncement(copy.inserted(name));
  }

  function insertPending(composedText: string) {
    if (!pendingShortcut) return;
    const { start, end, typed, template: t } = pendingShortcut;
    setPendingShortcut(null);
    // Si el texto cambió mientras se contestaba, se busca el atajo de nuevo;
    // si ya no está, lo compuesto va al final.
    let from = notes.slice(start, end) === typed ? start : notes.lastIndexOf(typed);
    let to = from + typed.length;
    if (from < 0) {
      from = notes.length;
      to = notes.length;
    }
    insertTemplateText(notes, from, to, composedText, t.name);
  }

  function cancelPending() {
    if (!pendingShortcut) return;
    const { end } = pendingShortcut;
    setPendingShortcut(null);
    caretRef.current = Math.min(end, notes.length);
  }

  // DX-455: un `{{Etiqueta}}` sin rellenar no se guarda.
  const missingMessage = missingPlaceholdersMessage(unfilledPlaceholders(notes));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotesError(null);
    setDateError(null);
    setDiagnosesError(null);
    if (!appointment && entryDate && today !== null && entryDate > today) {
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
      const { warnings, ...created } = await createClinicalEntry(token, patientId, input);
      onCreated({ ...created, addenda: created.addenda ?? [] });
      onOpenChange(false);
      // DX-540: ya guardada; el aviso del servidor se lee en un toast.
      announceClinicalEntryWarnings(warnings);
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
      // Sin el día de la sede no se puede topar la fecha de atención (la API la valida igual).
      submitDisabled={(!appointment && today === null) || missingMessage !== null || pendingShortcut !== null}
      size="lg"
    >
      {licenseMissing ? (
        <ProfessionalLicenseNotice
          canEditStaff={getTokenRole(token) === 'ADMIN'}
          userId={getTokenUserId(token)}
        />
      ) : null}
      {appointment ? (
        <p className="flex items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink">
          <CalendarCheck aria-hidden className="size-4 shrink-0 text-muted" />
          <span className="tabular-nums">
            {appointmentLine(appointment.start, appointment.providerName, clock)}
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
            {/* Fecha que la persona ya sabe: DateField (sin calendario), en el
                formato de la sede, nunca el type=date del navegador. */}
            {sede.status === 'error' ? (
              // Sin la zona de la sede no hay «hoy» con el que topar la fecha: el campo se sustituye por su error (escalón 2).
              <SedeConfigError kind={sede.kind} variant="field" retryId="evo-entry-date" onRetry={sede.retry} />
            ) : (
              <DateField
                id="evo-entry-date"
                max={today ?? undefined}
                disabled={today === null}
                value={entryDate === '' ? null : entryDate}
                isInvalid={!!dateError}
                onChange={(next) => setEntryDate(next ?? '')}
              />
            )}
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

      {suggestionShown && template && suggestedBy ? (
        <div className="-mt-2 flex flex-col items-start gap-1 text-xs text-muted sm:flex-row sm:items-center sm:gap-3">
          <p>{copy.suggestedBy(suggestedBy)}</p>
          <button
            type="button"
            onClick={removeSuggested}
            className="font-medium text-primary-text underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text max-sm:min-h-11"
          >
            {copy.removeSuggested}
          </button>
        </div>
      ) : null}

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
        hint={template ? copy.notesHintTemplate : templates?.some((t) => t.shortcut) ? `${copy.notesHintFree} ${copy.shortcutHint}` : copy.notesHintFree}
        error={notesError ?? missingMessage}
      >
        <Textarea
          id="evo-notes"
          ref={notesRef}
          rows={template ? 6 : 4}
          value={notes}
          aria-invalid={notesError || missingMessage ? true : undefined}
          onChange={handleNotesChange}
          className="whitespace-pre-wrap break-words"
        />
      </FormField>
      {pendingShortcut ? (
        <ShortcutPromptsPanel
          key={`${pendingShortcut.template.id}-${pendingShortcut.start}`}
          template={pendingShortcut.template}
          onInsert={insertPending}
          onCancel={cancelPending}
        />
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
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
            className="font-medium text-primary-text underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text"
          >
            {copy.recompose}
          </button>
        </div>
      ) : null}
    </FormModal>
  );
}
