'use client';
import * as React from 'react';
import { useCallback, useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { PatientDescriptionEntry } from '@/lib/odontogram/catalog-api';
import {
  normalizePatientDescription,
  offeredLanguages,
  PATIENT_DESCRIPTION_CLINIC_LANGUAGE,
  PATIENT_DESCRIPTION_MAX,
  patientDescriptionLength,
  patientDescriptionPayload,
  sortLanguages,
} from '@/lib/odontogram/patient-description';
import { usePatientLanguages } from '@/lib/patients/use-patient-languages';
import { languageName } from '@/lib/patients/patient-languages';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { InlineError } from '@/components/errors/inline-error';
import { fieldErrorId } from '@/components/shared/form-field';

export const patientDescriptionCopy = {
  title: 'Descripción para el paciente',
  hint: 'Texto claro para el paciente, sin datos de nadie, sin enlaces ni HTML. Es lo que lee al presentarle el plan y en el enlace del presupuesto; sin ella, lee el nombre del procedimiento.',
  placeholder: 'Por ejemplo, Limpieza profunda de las encías para frenar la inflamación.',
  counter: (n: number) => `${n}/${PATIENT_DESCRIPTION_MAX}`,
  counterLabel: (n: number) => `${n} de ${PATIENT_DESCRIPTION_MAX} caracteres`,
  retiredNote: 'Este idioma ya no está entre los de la clínica',
  retiredRemove: (language: string) => `Quitar la descripción en ${language}`,
  retiredRemoveShort: 'Quitar',
};

const copy = patientDescriptionCopy;

export function patientDescriptionFieldId(language: string): string {
  return `catalog-patient-description-${language}`;
}

/**
 * El estado del editor por idioma (patrón de DX-564): un texto por idioma de
 * la clínica (español siempre) y los ya guardados en un idioma que la clínica
 * retiró, que se reenvían sin tocar o se quitan. `reset` lo deja como el ítem
 * que se abre.
 */
export function usePatientDescriptionEditor(token: string | null) {
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clinic = usePatientLanguages(token);
  const clinicLanguages = clinic ? clinic.languages : null;
  const offered = useMemo(() => offeredLanguages(clinicLanguages, Object.keys(saved)), [clinicLanguages, saved]);
  const retired = useMemo(
    () => sortLanguages(Object.keys(texts).filter((l) => !offered.includes(l) && saved[l] !== undefined)),
    [texts, offered, saved],
  );

  const reset = useCallback((entries: readonly PatientDescriptionEntry[] | undefined) => {
    const map = Object.fromEntries((entries ?? []).map((e) => [e.language, e.text]));
    setSaved(map);
    setTexts(map);
    setErrors({});
  }, []);

  const setText = useCallback((language: string, text: string) => {
    setTexts((prev) => ({ ...prev, [language]: text }));
    setErrors((prev) => {
      if (!prev[language]) return prev;
      const next = { ...prev };
      delete next[language];
      return next;
    });
  }, []);

  const removeRetired = useCallback((language: string) => {
    setTexts((prev) => {
      const next = { ...prev };
      delete next[language];
      return next;
    });
  }, []);

  return {
    texts,
    errors,
    setErrors,
    offered,
    retired,
    clinicLanguages,
    reset,
    setText,
    removeRetired,
    payload: () => patientDescriptionPayload(texts, [...offered, ...retired]),
    /** ¿Cambió frente a lo guardado? Sin cambios no se manda (la API no la toca). */
    changed: () => {
      const now = patientDescriptionPayload(texts, [...offered, ...retired]);
      const before = patientDescriptionPayload(saved, sortLanguages(Object.keys(saved)));
      const key = (list: readonly PatientDescriptionEntry[]) =>
        JSON.stringify(
          sortLanguages(list.map((e) => e.language)).map((language) => [
            language,
            normalizePatientDescription(list.find((e) => e.language === language)?.text ?? ''),
          ]),
        );
      return key(now) !== key(before);
    },
  };
}

export type PatientDescriptionEditor = ReturnType<typeof usePatientDescriptionEditor>;

/**
 * DX-560 · «Descripción para el paciente» en el formulario del catálogo: un
 * campo por idioma con su contador (0/300), la ayuda, el error junto al campo
 * (local o el 400 de la API) y los idiomas retirados en solo lectura.
 */
export function PatientDescriptionField({ editor }: { editor: PatientDescriptionEditor }) {
  const hintId = useId();
  const { texts, errors, offered, retired, setText, removeRetired } = editor;
  return (
    <fieldset className="flex min-w-0 flex-col gap-4 border-t border-border-subtle pt-4">
      <legend className="float-left mb-1 w-full">
        <span className="block text-sm font-semibold text-ink">{copy.title}</span>
        <span id={hintId} className="mt-1 block text-xs text-muted">
          {copy.hint}
        </span>
      </legend>
      {offered.map((language) => {
        const id = patientDescriptionFieldId(language);
        const value = texts[language] ?? '';
        const length = patientDescriptionLength(normalizePatientDescription(value));
        const over = length > PATIENT_DESCRIPTION_MAX;
        const error = errors[language] ?? null;
        return (
          <div key={language} className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id}>{languageName(language)}</Label>
            <Textarea
              id={id}
              lang={language}
              value={value}
              autoGrow
              rows={2}
              placeholder={language === PATIENT_DESCRIPTION_CLINIC_LANGUAGE ? copy.placeholder : undefined}
              onChange={(e) => setText(language, e.target.value)}
              aria-invalid={error || over ? true : undefined}
              aria-describedby={[hintId, `${id}-count`, error ? fieldErrorId(id) : null].filter(Boolean).join(' ')}
              className="max-h-48"
            />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">{error ? <InlineError id={fieldErrorId(id)}>{error}</InlineError> : null}</div>
              <span
                id={`${id}-count`}
                aria-label={copy.counterLabel(length)}
                className={
                  over
                    ? 'shrink-0 text-xs font-medium text-danger-text tabular-nums'
                    : 'shrink-0 text-xs text-muted tabular-nums'
                }
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
          data-testid="patient-description-retired"
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
    </fieldset>
  );
}
