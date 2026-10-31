'use client';
import * as React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingRows } from '@/components/settings/settings-page';
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

/** Lo que edita el formulario: los valores de la API, con la validez como texto. */
interface PrescriptionSettingsDraft {
  words: boolean;
  record: boolean;
  validity: string;
}

const EMPTY_DRAFT: PrescriptionSettingsDraft = { words: false, record: false, validity: '' };

function toDraft(settings: PrescriptionSettings): PrescriptionSettingsDraft {
  return {
    words: settings.printQuantityInWords,
    record: settings.requireClinicalRecordNumber,
    validity: String(settings.validityDays),
  };
}

/** «30» y « 30 » son el mismo valor: espacios alrededor no son un cambio. */
function sameDraft(a: PrescriptionSettingsDraft, b: PrescriptionSettingsDraft): boolean {
  return a.words === b.words && a.record === b.record && a.validity.trim() === b.validity.trim();
}

/**
 * Ajustes → Recetas (DX-324): los datos que imprime la receta en todas las
 * sedes de la clínica. Una clínica nueva empieza sin cantidad en letras, sin
 * exigir el nº de historia clínica y con 30 días de validez. Solo ADMIN: la
 * página decide el permiso y no monta esto sin él.
 */
export function PrescriptionSettingsForm({ token }: { token: string }) {
  const [settings, setSettings] = useState<PrescriptionSettings | null>(null);
  const saved = useMemo(() => (settings ? toDraft(settings) : EMPTY_DRAFT), [settings]);
  // Borrador frente a lo guardado: la barra «Cambios sin guardar» solo aparece
  // con cambios, y salir con cambios pregunta (DESIGN.md → Settings pages).
  const { draft, update, dirty, discard, commit } = useSettingsDraft(saved, sameDraft);
  const { words, record, validity } = draft;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [validityError, setValidityError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const formId = `${id}-form`;
  const validityId = `${id}-validity`;
  const validityRef = useRef<HTMLInputElement>(null);
  const validityHintId = `${validityId}-hint`;

  useEffect(() => {
    let cancelled = false;
    getPrescriptionSettings(token)
      .then((res) => {
        if (cancelled) return;
        setSettings(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, loadErrorOptions));
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  // Tras guardar, la barra desaparece (no hay cambios) y el foco caería a
  // `<body>`: lo llevamos al aviso para no perder el sitio al teclado.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

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
      <div role="status" aria-label="Cargando" className="rounded-xl border border-border bg-surface p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-56" />
        <Skeleton className="mt-4 h-4 w-32" />
      </div>
    );
  }

  function edit(patch: Partial<PrescriptionSettingsDraft>) {
    update(patch);
    setNotice('');
    setSaveError(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setNotice('');
    const validityDays = parseValidityDays(validity);
    if (validityDays === null) {
      setValidityError(PRESCRIPTION_VALIDITY_DAYS_MESSAGE);
      // DESIGN.md (errores de formulario): el foco va al campo que hay que corregir.
      validityRef.current?.focus();
      return;
    }
    setValidityError(null);
    setSaving(true);
    try {
      const next = await savePrescriptionSettings(token, {
        printQuantityInWords: words,
        requireClinicalRecordNumber: record,
        validityDays,
      });
      commit(toDraft(next));
      setSettings(next);
      setNotice(copy.saved);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <SettingRows>
        {/* Esperan a «Guardar»: casillas, no interruptores (DESIGN.md → Form Controls). */}
        <div className="px-4 py-3 sm:px-6">
          <Checkbox
            label={copy.wordsTitle}
            description={copy.wordsHint}
            checked={words}
            disabled={saving}
            onChange={(e) => edit({ words: e.target.checked })}
          />
        </div>
        <div className="px-4 py-3 sm:px-6">
          <Checkbox
            label={copy.recordTitle}
            description={copy.recordHint}
            checked={record}
            disabled={saving}
            onChange={(e) => edit({ record: e.target.checked })}
          />
        </div>
        <div className="px-4 py-4 sm:px-6">
          <FormField
            htmlFor={validityId}
            label={copy.validityLabel}
            hint={copy.validityHint}
            hintId={validityHintId}
            error={validityError}
          >
            <Input
              ref={validityRef}
              id={validityId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={validity}
              disabled={saving}
              aria-invalid={validityError ? true : undefined}
              aria-describedby={validityError ? fieldErrorId(validityId) : validityHintId}
              onChange={(e) => {
                edit({ validity: e.target.value });
                setValidityError(null);
              }}
              className="t-data w-28"
            />
          </FormField>
        </div>
      </SettingRows>
      <p
        ref={noticeRef}
        role="status"
        tabIndex={-1}
        className={cn(notice ? 'text-sm text-success-text' : 'sr-only', 'focus:outline-none')}
      >
        {notice}
      </p>
      {/* Único guardado: aparece con cambios; el error del guardado va dentro. */}
      <SaveBar
        dirty={dirty}
        saving={saving}
        form={formId}
        error={saveError}
        saveLabel={copy.save}
        onDiscard={() => {
          discard();
          setValidityError(null);
          setSaveError(null);
        }}
      />
    </form>
  );
}
