'use client';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  POSTOP_VARIABLES,
  createPostOpTemplate,
  unknownVariables,
  updatePostOpTemplate,
  type PostOpTemplate,
  type UpdatePostOpTemplateInput,
} from '@/lib/postop/postop-api';
import { listCatalogItems } from '@/lib/odontogram/catalog-api';
import { listAppointmentTypes } from '@/lib/appointments/appointment-types-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { FieldError } from '@/components/errors/field-error';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import { CatalogMultiPicker, type CatalogMultiPickerItem } from './catalog-multi-picker';

const copy = {
  createTitle: 'Nueva plantilla de indicaciones',
  editTitle: 'Editar indicaciones',
  createDescription:
    'El texto admite variables que se rellenan al entregarlas. Vincúlala a procedimientos o tipos de cita para que se proponga sola.',
  editDescription:
    'Cambiar el título o el texto sube la versión. Las indicaciones ya entregadas no cambian.',
  codeLabel: 'Código',
  codeHintCreate: 'Corto y único, p. ej. EXO o CIR-3M. No se puede cambiar después.',
  codeHintEdit: 'El código no se puede cambiar.',
  codeInvalid: 'El código admite de 2 a 20 letras mayúsculas, números o guiones.',
  titleLabel: 'Título',
  bodyLabel: 'Indicaciones',
  variablesLabel: 'Insertar variable',
  variablesHint: 'Se insertan donde está el cursor.',
  unknown: (names: string[]) =>
    `Estas variables no existen: ${names.map((n) => `{{${n}}}`).join(', ')}.`,
  proceduresLegend: 'Procedimientos',
  typesLegend: 'Tipos de cita',
  linksHint: 'Al entregar, se proponen primero las vinculadas al procedimiento o al tipo de la cita.',
  noTypes: 'No hay tipos de cita activos.',
  optionsError: 'Vínculos no disponibles',
  create: 'Crear plantilla',
  save: 'Guardar cambios',
  genericError: 'No pudimos guardar la plantilla. Intenta de nuevo.',
};

/** Mismo patrón que la API: el código se guarda en mayúsculas. */
const CODE_PATTERN = /^[A-Z0-9-]{2,20}$/;

interface LinkOptions {
  procedures: CatalogMultiPickerItem[];
  types: Array<{ id: string; name: string }>;
}

/** Añade los vínculos actuales que ya no vienen en la lista (p. ej. un procedimiento desactivado). */
function withLinked<T extends { id: string }>(options: T[], linked: T[]): T[] {
  const known = new Set(options.map((o) => o.id));
  return [...options, ...linked.filter((l) => !known.has(l.id))];
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

interface PostOpTemplateFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin plantilla: alta. Con plantilla: edición. */
  template?: PostOpTemplate | null;
  onSaved: (template: PostOpTemplate) => void;
}

/**
 * Alta y edición de una plantilla de indicaciones postoperatorias (DX-222,
 * solo ADMIN). El código solo se escribe al crear. Al editar se envía solo lo
 * que cambió: la API sube la versión si cambian el título o el texto, y los
 * vínculos, si van, reemplazan los anteriores. El padre lo monta con una `key`
 * por apertura.
 */
export function PostOpTemplateFormModal({
  open,
  onOpenChange,
  token,
  template,
  onSaved,
}: PostOpTemplateFormModalProps) {
  const editing = !!template;
  const [code, setCode] = useState(template?.code ?? '');
  const [codeTouched, setCodeTouched] = useState(false);
  const [title, setTitle] = useState(template?.title ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [catalogItemIds, setCatalogItemIds] = useState<string[]>(
    template?.catalogItems.map((i) => i.id) ?? [],
  );
  const [appointmentTypeIds, setAppointmentTypeIds] = useState<string[]>(
    template?.appointmentTypes.map((t) => t.id) ?? [],
  );
  const [options, setOptions] = useState<LinkOptions | null>(null);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [optionsKey, setOptionsKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setOptionsFailed(false);
      try {
        const [procedures, types] = await Promise.all([
          listCatalogItems(token, { kind: 'PROCEDURE', activeOnly: true }),
          listAppointmentTypes(token),
        ]);
        if (cancelled) return;
        setOptions({
          procedures: withLinked<CatalogMultiPickerItem>(
            procedures,
            (template?.catalogItems ?? []).map((item) => ({ ...item, retired: true })),
          ),
          types: withLinked(
            types.map((t) => ({ id: t.id, name: t.name })),
            template?.appointmentTypes ?? [],
          ),
        });
      } catch {
        if (!cancelled) setOptionsFailed(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, token, template, optionsKey]);

  const codeValid = CODE_PATTERN.test(code);
  const codeError = !editing && codeTouched && !codeValid ? copy.codeInvalid : null;
  const unknown = unknownVariables(body);
  const blank = title.trim() === '' || body.trim() === '';

  function insertVariable(key: string) {
    const variable = `{{${key}}}`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + variable + body.slice(end));
    // Devuelve el foco al texto con el cursor tras la variable insertada.
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  function changes(current: PostOpTemplate): UpdatePostOpTemplateInput {
    const input: UpdatePostOpTemplateInput = {};
    if (title.trim() !== current.title) input.title = title.trim();
    if (body.trim() !== current.body) input.body = body.trim();
    if (!sameIds(catalogItemIds, current.catalogItems.map((i) => i.id))) {
      // La API solo acepta procedimientos activos. Los vínculos retirados
      // se muestran como contexto, pero no se reenvían al reemplazar la lista.
      const active = new Set(options?.procedures.filter((item) => !item.retired).map((item) => item.id));
      input.catalogItemIds = catalogItemIds.filter((id) => active.has(id));
    }
    if (!sameIds(appointmentTypeIds, current.appointmentTypes.map((t) => t.id))) {
      input.appointmentTypeIds = appointmentTypeIds;
    }
    return input;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (blank || unknown.length > 0) return;
    if (!editing && !codeValid) {
      setCodeTouched(true);
      codeRef.current?.focus();
      return;
    }
    let input: UpdatePostOpTemplateInput | null = null;
    if (template) {
      input = changes(template);
      if (Object.keys(input).length === 0) {
        onOpenChange(false);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const saved =
        template && input
          ? await updatePostOpTemplate(token, template.id, input)
          : await createPostOpTemplate(token, {
              code,
              title: title.trim(),
              body: body.trim(),
              catalogItemIds,
              appointmentTypeIds,
            });
      onOpenChange(false);
      onSaved(saved);
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
      title={editing ? copy.editTitle : copy.createTitle}
      description={editing ? copy.editDescription : copy.createDescription}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      submitDisabled={blank || unknown.length > 0}
      error={error}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <FormField
          htmlFor="postop-template-code"
          label={copy.codeLabel}
          hint={editing ? copy.codeHintEdit : copy.codeHintCreate}
          hintId="postop-template-code-hint"
          error={codeError}
        >
          <Input
            id="postop-template-code"
            ref={codeRef}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onBlur={() => setCodeTouched(true)}
            readOnly={editing}
            maxLength={20}
            required
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={codeError ? true : undefined}
            aria-describedby={
              codeError ? fieldErrorId('postop-template-code') : 'postop-template-code-hint'
            }
            className={cn('font-mono uppercase', editing && 'bg-surface-2 text-muted')}
          />
        </FormField>
        <FormField htmlFor="postop-template-title" label={copy.titleLabel}>
          <Input
            id="postop-template-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
        </FormField>
      </div>
      <div className="flex flex-col gap-1.5">
        <span id="postop-variables-label" className="text-sm font-medium text-ink">
          {copy.variablesLabel}
        </span>
        <div
          role="group"
          aria-labelledby="postop-variables-label"
          aria-describedby="postop-variables-hint"
          className="flex flex-wrap gap-2"
        >
          {POSTOP_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              title={v.label}
              onClick={() => insertVariable(v.key)}
              className="min-h-9 max-md:min-h-11 rounded-md border border-border bg-surface px-2.5 font-mono text-xs text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {`{{${v.key}}}`}
              <span className="sr-only"> · {v.label}</span>
            </button>
          ))}
        </div>
        <p id="postop-variables-hint" className="text-xs text-muted">
          {copy.variablesHint}
        </p>
      </div>
      <FormField htmlFor="postop-template-body" label={copy.bodyLabel}>
        <textarea
          id="postop-template-body"
          ref={bodyRef}
          rows={10}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={20000}
          required
          aria-invalid={unknown.length > 0 || undefined}
          aria-describedby={unknown.length > 0 ? 'postop-template-unknown' : undefined}
          className={cn(fieldClass, 'h-auto font-[inherit] leading-relaxed')}
        />
      </FormField>
      {unknown.length > 0 ? (
        <InlineError id="postop-template-unknown">{copy.unknown(unknown)}</InlineError>
      ) : null}

      <section className="flex flex-col gap-4 border-t border-hairline pt-4">
        <p className="text-xs text-muted">{copy.linksHint}</p>
        {optionsFailed ? (
          <FieldError
            label={copy.optionsError}
            onRetry={() => setOptionsKey((k) => k + 1)}
            className="h-24"
          />
        ) : !options ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <CatalogMultiPicker
              items={options.procedures}
              value={catalogItemIds}
              onChange={setCatalogItemIds}
              idPrefix="postop-procedure"
              legend={copy.proceduresLegend}
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-0.5 text-sm font-medium text-ink">{copy.typesLegend}</legend>
              {options.types.length === 0 ? (
                <p className="text-sm text-muted">{copy.noTypes}</p>
              ) : (
                <ul className="grid gap-x-4 sm:grid-cols-2">
                  {options.types.map((t) => {
                    const id = `postop-type-${t.id}`;
                    const checked = appointmentTypeIds.includes(t.id);
                    return (
                      <li key={t.id}>
                        <label
                          htmlFor={id}
                          className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink"
                        >
                          <input
                            id={id}
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setAppointmentTypeIds((prev) =>
                                checked ? prev.filter((v) => v !== t.id) : [...prev, t.id],
                              )
                            }
                            className="size-5 shrink-0 accent-[var(--color-primary)]"
                          />
                          {t.name}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
          </>
        )}
      </section>
    </FormModal>
  );
}
