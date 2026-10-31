'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  DOC_TYPES,
  DOC_TYPE_NAME_MAX,
  docTypeNameError,
  genericDocTypeName,
  normalizeDocTypeName,
} from '@/lib/patients/doc-type';
import {
  getDocumentTypeNames,
  updateDocumentTypeNames,
  type DocumentTypeNames,
} from '@/lib/patients/document-type-names-api';
import type { DocType } from '@/lib/patients/patients-api';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { SectionError } from '@/components/errors/section-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { SaveBar, useSettingsDraft } from '@/components/settings/save-bar';
import { SettingRows } from '@/components/settings/settings-page';
import { cn } from '@/lib/utils';

const copy = {
  hint: (generic: string) => `Vacío: se usa «${generic}».`,
  save: 'Guardar',
  saved: 'Nombres guardados.',
  tooLong: `Hasta ${DOC_TYPE_NAME_MAX} caracteres.`,
  control: 'El nombre del documento no puede llevar caracteres de control.',
  noLetter: 'El nombre necesita al menos una letra o un número.',
  loadError: 'No pudimos cargar los nombres de documentos.',
  saveError: 'No pudimos guardar los nombres. Intenta de nuevo.',
  forbiddenTitle: 'Solo un administrador puede cambiar los nombres de los documentos.',
  forbiddenHint: 'Cada ficha, recibo y receta muestra el nombre que la clínica haya configurado.',
};

const toDrafts = (names: DocumentTypeNames): Record<DocType, string> =>
  Object.fromEntries(DOC_TYPES.map((t) => [t, names[t] ?? ''])) as Record<DocType, string>;

const EMPTY_DRAFTS = toDrafts({} as DocumentTypeNames);

// Una API anterior no tiene la ruta: su 404 es «no pudimos cargar», no un
// «no existe» (mismo caso que la mayoría de edad).
const loadErrorOptions = { fallback: copy.loadError, byStatus: { 404: copy.loadError } };

/**
 * Ajustes → Nombres de documentos (DX-327, R16): cómo llama la clínica a cada
 * uno de los cinco tipos genéricos. Vacío = se usa el genérico. Solo ADMIN.
 * Valida como la API (`docTypeNameError`): cuenta caracteres, no unidades
 * UTF-16, así que los campos no llevan `maxLength`.
 */
export function DocumentTypeNamesSettingsSection({
  token,
  allowed,
}: {
  token: string;
  allowed: boolean;
}) {
  // Lo guardado (la API) y el borrador: la barra «Cambios sin guardar» solo
  // aparece cuando difieren (DESIGN.md → Settings pages).
  const [savedNames, setSavedNames] = useState<DocumentTypeNames | null>(null);
  const saved = useMemo(() => (savedNames ? toDrafts(savedNames) : EMPTY_DRAFTS), [savedNames]);
  const { draft: current, setDraft, dirty, discard, commit } = useSettingsDraft(saved);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DocType, string>>>({});
  const [notice, setNotice] = useState('');
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const idPrefix = useId();
  const inputRefs = useRef<Partial<Record<DocType, HTMLInputElement | null>>>({});
  // Cada petición es un objeto nuevo: el efecto enfoca aunque se repita el tipo.
  const [focusRequest, setFocusRequest] = useState<{ type: DocType } | null>(null);

  useEffect(() => {
    if (focusRequest) inputRefs.current[focusRequest.type]?.focus();
  }, [focusRequest]);

  // Tras guardar, la barra desaparece y el foco caería a `<body>`: va al aviso.
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    getDocumentTypeNames(token)
      .then((res) => {
        if (cancelled) return;
        setSavedNames(res);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, loadErrorOptions));
      });
    return () => {
      cancelled = true;
    };
  }, [token, allowed, reloadKey]);

  if (!allowed) {
    return (
      <EmptyState
        role="status"
        icon={<Lock aria-hidden />}
        title={copy.forbiddenTitle}
        description={copy.forbiddenHint}
      />
    );
  }
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
  if (!savedNames) {
    return (
      <div role="status" aria-label="Cargando" className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-72" />
      </div>
    );
  }
  const formId = `${idPrefix}-form`;

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNotice('');
    setSaveError(null);
    const found: Partial<Record<DocType, string>> = {};
    for (const t of DOC_TYPES) {
      const error = docTypeNameError(current[t]);
      if (error) found[t] = copy[error];
    }
    setFieldErrors(found);
    const firstInvalid = DOC_TYPES.find((t) => found[t]);
    if (firstInvalid) {
      setFocusRequest({ type: firstInvalid });
      return;
    }

    const body = Object.fromEntries(
      DOC_TYPES.map((t) => [t, normalizeDocTypeName(current[t])]),
    ) as DocumentTypeNames;
    setSaving(true);
    try {
      const next = await updateDocumentTypeNames(token, body);
      commit(toDrafts(next));
      setSavedNames(next);
      setNotice(copy.saved);
    } catch (err) {
      setSaveError(apiErrorMessage(err, copy.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id={formId} onSubmit={handleSave} noValidate className="flex flex-col gap-4">
      <SettingRows>
        {DOC_TYPES.map((type) => {
          const id = `${idPrefix}-${type}`;
          const hintId = `${id}-hint`;
          const error = fieldErrors[type];
          return (
            <div key={type} className="px-4 py-3 sm:px-6 sm:py-4">
              <FormField
                htmlFor={id}
                label={genericDocTypeName(type)}
                hint={copy.hint(genericDocTypeName(type))}
                hintId={hintId}
                error={error}
              >
                <Input
                  ref={(el) => {
                    inputRefs.current[type] = el;
                  }}
                  id={id}
                  type="text"
                  value={current[type]}
                  disabled={saving}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? fieldErrorId(id) : hintId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraft((prev) => ({ ...prev, [type]: value }));
                    // Corregir quita el error de ese campo, y el aviso de guardado
                    // ya no describe lo que se ve.
                    setFieldErrors((prev) => {
                      if (!prev[type]) return prev;
                      const next = { ...prev };
                      delete next[type];
                      return next;
                    });
                    setNotice('');
                    setSaveError(null);
                  }}
                />
              </FormField>
            </div>
          );
        })}
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
          setFieldErrors({});
          setSaveError(null);
        }}
      />
    </form>
  );
}
