'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createAppointmentType,
  updateAppointmentType,
  type AppointmentType,
} from '@/lib/appointments/appointment-types-api';
import { appointmentTypeTextColor, isAppointmentTypeColor } from '@/lib/color/contrast';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/errors/inline-error';
import { fieldErrorId } from '@/components/shared/form-field';
import { usePatientLanguages } from '@/lib/patients/use-patient-languages';
import { languageName } from '@/lib/patients/patient-languages';
import {
  normalizePreVisitText,
  PRE_VISIT_CLINIC_LANGUAGE,
  PRE_VISIT_MESSAGES,
  PRE_VISIT_TEXT_MAX,
  preVisitLead,
  preVisitTextError,
  preVisitTextLength,
  sortPreVisitInstructions,
} from '@/lib/appointments/pre-visit-instructions';

const copy = {
  createTitle: 'Nuevo tipo de cita',
  editTitle: 'Editar tipo de cita',
  description:
    'La duración rellena la hora de fin al agendar y el color pinta la cita en la agenda. Cambiarlo no altera las citas ya agendadas.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Endodoncia',
  duration: 'Duración (minutos)',
  durationHint: 'Múltiplo de 5, entre 5 y 480.',
  color: 'Color',
  colorHex: 'Código del color',
  colorHint: 'Formato #RRGGBB. El texto de la cita se vuelve claro u oscuro solo.',
  preview: 'Vista previa',
  urgent: 'Urgencia',
  urgentHint:
    'Para huecos reservados: al reservar un hueco en la agenda, los tipos de urgencia salen primero y ya marcados.',
  create: 'Crear tipo',
  save: 'Guardar cambios',
  invalidName: 'Escribe un nombre (hasta 60 caracteres).',
  invalidDuration: 'La duración debe ser un múltiplo de 5 entre 5 y 480 minutos.',
  invalidColor: 'El color debe tener el formato #RRGGBB (por ejemplo, #7C3AED).',
  genericError: 'No pudimos guardar el tipo de cita. Intenta de nuevo.',
  // DX-564: indicaciones previas a la cita.
  instructionsTitle: 'Indicaciones previas a la cita',
  instructionsHint:
    'Texto general para todos los pacientes de este tipo de cita: no escribas datos de un paciente. Sin enlaces, direcciones web ni correos, ni HTML.',
  instructionsPlaceholder: 'Por ejemplo, Ven en ayunas de 6 horas y trae tus radiografías.',
  counter: (n: number) => `${n}/${PRE_VISIT_TEXT_MAX}`,
  counterLabel: (n: number) => `${n} de ${PRE_VISIT_TEXT_MAX} caracteres`,
  retiredNote: 'Este idioma ya no está entre los de la clínica',
  retiredRemove: (language: string) => `Quitar las indicaciones en ${language}`,
  retiredRemoveShort: 'Quitar',
  previewTitle: 'Vista previa para el paciente',
  previewHint: 'Así se añade al recordatorio por email y al mensaje de WhatsApp.',
};

/** Bytes del mapa en JSON, como lo mide la API (tope 8000: el CHECK de la BD). */
const PRE_VISIT_TOTAL_BYTES_MAX = 8000;

/** Mensajes de la API que se refieren a un idioma concreto (van junto a su campo). */
const FIELD_MESSAGES = new Set<string>([PRE_VISIT_MESSAGES.tooLong, PRE_VISIT_MESSAGES.noLinks]);
const LANGUAGE_MESSAGES = new Set<string>([PRE_VISIT_MESSAGES.notOffered, PRE_VISIT_MESSAGES.repeated]);

/** Bytes UTF-8 de un texto (sin `TextEncoder`, que jsdom no trae). */
function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function instructionsFieldId(language: string): string {
  return `type-pre-visit-${language}`;
}

const DEFAULT_COLOR = '#0E7490';

interface AppointmentTypeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin tipo: alta. Con tipo: edición. */
  type?: AppointmentType | null;
  onSaved: (type: AppointmentType) => void;
}

/**
 * Alta y edición de un tipo de cita (DX-121, solo ADMIN). El color se elige
 * con el selector nativo o escribiendo `#RRGGBB`; nada más llega a la API (que
 * también lo valida). El padre lo monta con una `key` por apertura.
 */
export function AppointmentTypeFormModal({
  open,
  onOpenChange,
  token,
  type,
  onSaved,
}: AppointmentTypeFormModalProps) {
  const editing = !!type;
  const [name, setName] = useState(type?.name ?? '');
  const [duration, setDuration] = useState(String(type?.durationMinutes ?? 30));
  const [color, setColor] = useState(type?.color ?? DEFAULT_COLOR);
  const [isUrgent, setIsUrgent] = useState(type?.isUrgent ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // DX-564: un texto por idioma; lo guardado entra tal cual (también el de un
  // idioma que la clínica ya retiró: se reenvía sin tocar o se quita).
  const saved = React.useMemo(
    () => Object.fromEntries((type?.preVisitInstructions ?? []).map((v) => [v.language, v.text])),
    [type],
  );
  const [texts, setTexts] = useState<Record<string, string>>(saved);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const patientLanguages = usePatientLanguages(open ? token : null);
  const previewId = useId();

  // Los idiomas de la clínica (español siempre). Mientras carga o si falla,
  // español y los que ya tienen texto, editables: la API valida igualmente.
  const offered = patientLanguages
    ? sortPreVisitInstructions(
        [...new Set([PRE_VISIT_CLINIC_LANGUAGE, ...patientLanguages.languages])].map((language) => ({ language })),
      ).map((v) => v.language)
    : sortPreVisitInstructions(
        [...new Set([PRE_VISIT_CLINIC_LANGUAGE, ...Object.keys(saved)])].map((language) => ({ language })),
      ).map((v) => v.language);
  // Retirados: con texto guardado, ya no ofrecidos y aún no quitados.
  const retired = sortPreVisitInstructions(
    Object.keys(texts)
      .filter((language) => !offered.includes(language) && saved[language] !== undefined)
      .map((language) => ({ language })),
  ).map((v) => v.language);

  function setText(language: string, text: string) {
    setTexts((prev) => ({ ...prev, [language]: text }));
    setFieldErrors((prev) => {
      if (!prev[language]) return prev;
      const next = { ...prev };
      delete next[language];
      return next;
    });
  }

  function removeRetired(language: string) {
    setTexts((prev) => {
      const next = { ...prev };
      delete next[language];
      return next;
    });
  }

  /** La lista ENTERA que se envía: los ofrecidos con texto y los retirados sin tocar. */
  function instructionsPayload() {
    return [...offered, ...retired]
      .map((language) => ({ language, text: texts[language] ?? '' }))
      .filter((entry) => normalizePreVisitText(entry.text) !== '');
  }

  const preview = sortPreVisitInstructions(
    [...offered, ...retired]
      .map((language) => ({ language, text: normalizePreVisitText(texts[language] ?? '') }))
      .filter((entry) => entry.text !== ''),
  );

  const minutes = Number(duration);
  const validColor = isAppointmentTypeColor(color);

  /**
   * El 400 de la API junto al campo de su idioma cuando se puede saber cuál:
   * enlaces/HTML o largo → el primero que lo incumple; idioma no ofrecido o
   * repetido → el primero editable que ya no está en la lista de la clínica.
   */
  function languageForApiError(
    message: string,
    sent: readonly { language: string; text: string }[],
  ): string | null {
    const editable = sent.filter((v) => offered.includes(v.language));
    if (FIELD_MESSAGES.has(message)) {
      return (editable.find((v) => preVisitTextError(v.text) !== null) ?? editable[0])?.language ?? null;
    }
    if (LANGUAGE_MESSAGES.has(message)) {
      const offeredByClinic = patientLanguages?.languages ?? [];
      return (
        editable.find((v) => v.language !== PRE_VISIT_CLINIC_LANGUAGE && !offeredByClinic.includes(v.language))
          ?.language ??
        editable[0]?.language ??
        null
      );
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 60) return setError(copy.invalidName);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 480 || minutes % 5 !== 0) {
      return setError(copy.invalidDuration);
    }
    if (!validColor) return setError(copy.invalidColor);
    const preVisitInstructions = instructionsPayload();
    const localErrors: Record<string, string> = {};
    for (const language of offered) {
      const problem = preVisitTextError(texts[language] ?? '');
      if (problem) localErrors[language] = problem;
    }
    setFieldErrors(localErrors);
    const firstInvalid = offered.find((language) => localErrors[language]);
    if (firstInvalid) {
      document.getElementById(instructionsFieldId(firstInvalid))?.focus();
      return;
    }
    const map = Object.fromEntries(preVisitInstructions.map((v) => [v.language, normalizePreVisitText(v.text)]));
    if (utf8Bytes(JSON.stringify(map)) > PRE_VISIT_TOTAL_BYTES_MAX) {
      return setError(PRE_VISIT_MESSAGES.tooLarge);
    }
    setSubmitting(true);
    try {
      const input = {
        name: trimmed,
        durationMinutes: minutes,
        color: color.toUpperCase(),
        isUrgent,
        preVisitInstructions,
      };
      const result = editing
        ? await updateAppointmentType(token, type.id, input)
        : await createAppointmentType(token, input);
      onSaved(result);
      onOpenChange(false);
    } catch (err) {
      const message = apiErrorMessage(err, copy.genericError);
      const language = languageForApiError(message, preVisitInstructions);
      if (language) {
        setFieldErrors({ [language]: message });
        document.getElementById(instructionsFieldId(language))?.focus();
      } else {
        // El tope conjunto y el resto: error del formulario.
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      error={error}
    >
      <FormField htmlFor="type-name" label={copy.name}>
        <Input
          id="type-name"
          value={name}
          maxLength={60}
          placeholder={copy.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </FormField>
      <FormField htmlFor="type-duration" label={copy.duration} hint={copy.durationHint}>
        <Input
          id="type-duration"
          type="number"
          inputMode="numeric"
          min={5}
          max={480}
          step={5}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField htmlFor="type-color-hex" label={copy.colorHex} hint={copy.colorHint}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={copy.color}
            value={validColor ? color.toLowerCase() : DEFAULT_COLOR.toLowerCase()}
            onChange={(e) => setColor(e.target.value.toUpperCase())}
            className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
          />
          <Input
            id="type-color-hex"
            value={color}
            maxLength={7}
            onChange={(e) => setColor(e.target.value.trim())}
            aria-invalid={!validColor || undefined}
            className="font-mono uppercase"
            required
          />
        </div>
      </FormField>
      <Switch
        label={copy.urgent}
        description={copy.urgentHint}
        checked={isUrgent}
        onChange={(e) => setIsUrgent(e.target.checked)}
      />
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted">{copy.preview}</span>
        <span
          data-testid="type-preview"
          className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-semibold"
          style={
            validColor
              ? { backgroundColor: color, color: appointmentTypeTextColor(color), borderColor: color }
              : undefined
          }
        >
          {name.trim() || copy.namePlaceholder} · {Number.isFinite(minutes) ? minutes : 0} min
        </span>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-4 border-t border-border-subtle pt-4">
        <legend className="float-left mb-1 w-full">
          <span className="block text-sm font-semibold text-ink">{copy.instructionsTitle}</span>
          <span id={`${previewId}-hint`} className="mt-1 block text-xs text-muted">
            {copy.instructionsHint}
          </span>
        </legend>
        {offered.map((language) => {
          const id = instructionsFieldId(language);
          const value = texts[language] ?? '';
          const length = preVisitTextLength(normalizePreVisitText(value));
          const over = length > PRE_VISIT_TEXT_MAX;
          const fieldError = fieldErrors[language] ?? null;
          return (
            <div key={language} className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={id}>{languageName(language)}</Label>
              <Textarea
                id={id}
                lang={language}
                value={value}
                autoGrow
                rows={3}
                placeholder={language === PRE_VISIT_CLINIC_LANGUAGE ? copy.instructionsPlaceholder : undefined}
                onChange={(e) => setText(language, e.target.value)}
                aria-invalid={fieldError || over ? true : undefined}
                aria-describedby={[`${previewId}-hint`, `${id}-count`, fieldError ? fieldErrorId(id) : null]
                  .filter(Boolean)
                  .join(' ')}
                className="max-h-64"
              />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {fieldError ? <InlineError id={fieldErrorId(id)}>{fieldError}</InlineError> : null}
                </div>
                <span
                  id={`${id}-count`}
                  aria-label={copy.counterLabel(length)}
                  className={over ? 'shrink-0 text-xs font-medium text-danger-text tabular-nums' : 'shrink-0 text-xs text-muted tabular-nums'}
                >
                  {copy.counter(length)}
                </span>
              </div>
            </div>
          );
        })}
        {retired.map((language) => (
          <div
            key={language}
            data-testid="pre-visit-retired"
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-sunken p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink">{languageName(language)}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRetired(language)}
                aria-label={copy.retiredRemove(languageName(language))}
              >
                <X aria-hidden /> {copy.retiredRemoveShort}
              </Button>
            </div>
            <p className="text-xs text-muted">{copy.retiredNote}</p>
            <p lang={language} className="whitespace-pre-line break-words text-sm text-ink">
              {texts[language]}
            </p>
          </div>
        ))}
        {preview.length > 0 ? (
          <section aria-labelledby={`${previewId}-preview`} className="flex min-w-0 flex-col gap-2">
            <h3 id={`${previewId}-preview`} className="text-xs font-semibold text-muted">
              {copy.previewTitle}
            </h3>
            <p className="text-xs text-muted">{copy.previewHint}</p>
            <ul className="flex flex-col gap-2" data-testid="pre-visit-preview">
              {preview.map((entry) => (
                <li
                  key={entry.language}
                  lang={entry.language}
                  className="rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-ink"
                >
                  <span className="sr-only">{languageName(entry.language)}: </span>
                  <strong className="font-semibold">{preVisitLead(entry.language)}</strong>
                  <span className="block whitespace-pre-line break-words">{entry.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </fieldset>
    </FormModal>
  );
}
