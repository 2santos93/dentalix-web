'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  getPrescriptionSettings,
  savePrescriptionSettings,
  PRESCRIPTION_VALIDITY_DAYS_MAX,
  PRESCRIPTION_VALIDITY_DAYS_MESSAGE,
  PRESCRIPTION_VALIDITY_DAYS_MIN,
  type PrescriptionSettings,
} from '@/lib/prescriptions/prescriptions-api';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const copy = {
  wordsTitle: 'Cantidad en letras',
  wordsHint: 'Cada medicamento lleva también la cantidad escrita, p. ej. «21 (veintiuno) cápsulas».',
  recordTitle: 'Exigir el nº de historia clínica',
  recordHint:
    'No se emite la receta si el paciente no tiene documento registrado; la receta lo imprime como nº de historia clínica.',
  validityLabel: 'Validez (días)',
  validityHint: 'Desde la fecha de inicio. Una clínica nueva empieza con 30 días.',
  save: 'Guardar',
  saved: 'Ajustes de la receta guardados.',
  loadError: 'No pudimos cargar los ajustes de la receta.',
  saveError: 'No pudimos guardar los ajustes de la receta. Intenta de nuevo.',
};

/**
 * Una API anterior a esta pantalla no tiene la ruta: `/prescriptions/settings`
 * cae en `GET /prescriptions/:id` (`ParseUUIDPipe`, 400) o en un 404. Los dos
 * dicen qué no cargó, no «revisa los datos» ni «no encontramos lo que buscas».
 */
const loadErrorOptions = {
  fallback: copy.loadError,
  byStatus: { 400: copy.loadError, 404: copy.loadError },
};

/** Días enteros dentro de 1–365, o null (mismos límites que la API). */
function parseValidityDays(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const days = Number(text.trim());
  return days >= PRESCRIPTION_VALIDITY_DAYS_MIN && days <= PRESCRIPTION_VALIDITY_DAYS_MAX ? days : null;
}

/**
 * Ajustes → Recetas (DX-324): los datos que imprime la receta en todas las
 * sedes de la clínica. Una clínica nueva empieza sin cantidad en letras, sin
 * exigir el nº de historia clínica y con 30 días de validez. Solo ADMIN: la
 * página decide el permiso y no monta esto sin él.
 */
/** Los valores de la API pasan a ser la base y el borrador del formulario. */
function useSettingsDraft() {
  const [settings, setSettings] = useState<PrescriptionSettings | null>(null);
  const [words, setWords] = useState(false);
  const [record, setRecord] = useState(false);
  const [validity, setValidity] = useState('');
  const adopt = useCallback((next: PrescriptionSettings) => {
    setSettings(next);
    setWords(next.printQuantityInWords);
    setRecord(next.requireClinicalRecordNumber);
    setValidity(String(next.validityDays));
  }, []);
  return { settings, words, setWords, record, setRecord, validity, setValidity, adopt };
}

export function PrescriptionSettingsForm({ token }: { token: string }) {
  const { settings, words, setWords, record, setRecord, validity, setValidity, adopt } = useSettingsDraft();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [validityError, setValidityError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const validityId = useId();
  const validityHintId = `${validityId}-hint`;

  useEffect(() => {
    let cancelled = false;
    getPrescriptionSettings(token)
      .then((res) => {
        if (cancelled) return;
        adopt(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, loadErrorOptions));
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey, adopt]);

  if (loadError) {
    return (
      <SectionError
        description={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (!settings) {
    return (
      <div role="status" aria-label="Cargando" className="max-w-2xl rounded-xl border border-border bg-surface p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-56" />
        <Skeleton className="mt-4 h-4 w-32" />
      </div>
    );
  }

  const unchanged =
    words === settings.printQuantityInWords &&
    record === settings.requireClinicalRecordNumber &&
    validity.trim() === String(settings.validityDays);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setNotice('');
    const validityDays = parseValidityDays(validity);
    if (validityDays === null) {
      setValidityError(PRESCRIPTION_VALIDITY_DAYS_MESSAGE);
      return;
    }
    setValidityError(null);
    setSaving(true);
    try {
      adopt(
        await savePrescriptionSettings(token, {
          printQuantityInWords: words,
          requireClinicalRecordNumber: record,
          validityDays,
        }),
      );
      setNotice(copy.saved);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-2xl flex-col gap-4">
      <div className="divide-y divide-hairline rounded-xl border border-border bg-surface">
        <SettingSwitch
          title={copy.wordsTitle}
          hint={copy.wordsHint}
          checked={words}
          disabled={saving}
          onChange={setWords}
        />
        <SettingSwitch
          title={copy.recordTitle}
          hint={copy.recordHint}
          checked={record}
          disabled={saving}
          onChange={setRecord}
        />
        <div className="px-4 py-4 sm:px-6">
          <FormField
            htmlFor={validityId}
            label={copy.validityLabel}
            hint={copy.validityHint}
            hintId={validityHintId}
            error={validityError}
          >
            <Input
              id={validityId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={validity}
              disabled={saving}
              aria-invalid={validityError ? true : undefined}
              aria-describedby={validityError ? fieldErrorId(validityId) : validityHintId}
              onChange={(e) => {
                setValidity(e.target.value);
                setValidityError(null);
              }}
              className="w-28 tabular-nums max-sm:min-h-11"
            />
          </FormField>
        </div>
      </div>
      {saveError ? <InlineError variant="summary">{saveError}</InlineError> : null}
      <p role="status" className={notice ? 'text-sm text-success' : 'sr-only'}>
        {notice}
      </p>
      <Button
        type="submit"
        loading={saving}
        disabled={unchanged}
        className="self-start max-sm:min-h-11 max-sm:w-full"
      >
        {copy.save}
      </Button>
    </form>
  );
}

function SettingSwitch({
  title,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-6">
      <div className="min-w-0">
        <p id={`${id}-title`} className="font-medium text-ink">
          {title}
        </p>
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      </div>
      {/* El botón es el objetivo táctil (44 px bajo `sm`, DESIGN.md); el carril va dentro. */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-hint`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="inline-flex shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 max-sm:min-h-11 max-sm:min-w-11 sm:mt-1"
      >
        <span
          aria-hidden
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full border border-border transition-colors',
            checked ? 'bg-primary' : 'bg-bg',
          )}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform',
              checked ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
        </span>
      </button>
    </div>
  );
}
