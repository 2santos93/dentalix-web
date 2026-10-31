'use client';
import * as React from 'react';
import { useRef, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  CONSENT_VARIABLES,
  createConsentTemplate,
  updateConsentTemplate,
  type ConsentTemplate,
} from '@/lib/consents/consents-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const copy = {
  createTitle: 'Nueva plantilla',
  editTitle: 'Editar plantilla',
  createDescription: 'El texto admite variables que se rellenan al firmar.',
  editDescription:
    'Los consentimientos ya firmados no cambian: guardan el texto con el que se firmaron.',
  titleLabel: 'Título',
  bodyLabel: 'Texto del consentimiento',
  variablesLabel: 'Insertar variable',
  variablesHint: 'Se insertan donde está el cursor.',
  unknown: (names: string[]) =>
    `Estas variables no existen: ${names.map((n) => `{{${n}}}`).join(', ')}.`,
  create: 'Crear plantilla',
  save: 'Guardar cambios',
  genericError: 'No pudimos guardar la plantilla. Intenta de nuevo.',
};

const KNOWN: ReadonlySet<string> = new Set(CONSENT_VARIABLES.map((v) => v.key));
const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_]+)\s*\}\}/g;

/** Mismo criterio que la API (render-consent.ts): sin distinguir mayúsculas. */
export function unknownVariables(body: string): string[] {
  const out = new Set<string>();
  for (const [, raw] of body.matchAll(VARIABLE_PATTERN)) {
    const name = raw.toLowerCase();
    if (!KNOWN.has(name)) out.add(name);
  }
  return [...out];
}

interface ConsentTemplateFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin plantilla: alta. Con plantilla: edición. */
  template?: ConsentTemplate | null;
  onSaved: (template: ConsentTemplate) => void;
}

/**
 * Alta y edición de una plantilla de consentimiento (DX-006, solo ADMIN). Los
 * botones de variables insertan `{{variable}}` en el cursor, y una variable
 * mal escrita se avisa antes de enviar (la API también la rechaza con 400).
 * El padre lo monta con una `key` por apertura.
 */
export function ConsentTemplateFormModal({
  open,
  onOpenChange,
  token,
  template,
  onSaved,
}: ConsentTemplateFormModalProps) {
  const editing = !!template;
  const [title, setTitle] = useState(template?.title ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const unknown = unknownVariables(body);
  const blank = title.trim() === '' || body.trim() === '';

  function insertVariable(key: string) {
    const token = `{{${key}}}`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    // Devuelve el foco al texto con el cursor tras la variable insertada.
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (blank || unknown.length > 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const input = { title: title.trim(), body: body.trim() };
      const saved = template
        ? await updateConsentTemplate(token, template.id, input)
        : await createConsentTemplate(token, input);
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
      <FormField htmlFor="consent-template-title" label={copy.titleLabel}>
        <Input
          id="consent-template-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
      </FormField>
      <div className="flex flex-col gap-1.5">
        <span id="consent-variables-label" className="text-sm font-medium text-ink">
          {copy.variablesLabel}
        </span>
        <div
          role="group"
          aria-labelledby="consent-variables-label"
          aria-describedby="consent-variables-hint"
          className="flex flex-wrap gap-2"
        >
          {CONSENT_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              title={v.label}
              onClick={() => insertVariable(v.key)}
              className="min-h-9 rounded-md border border-border bg-surface px-2.5 font-mono text-xs text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {`{{${v.key}}}`}
              <span className="sr-only"> · {v.label}</span>
            </button>
          ))}
        </div>
        <p id="consent-variables-hint" className="text-xs text-muted">
          {copy.variablesHint}
        </p>
      </div>
      <FormField htmlFor="consent-template-body" label={copy.bodyLabel}>
        <Textarea
          id="consent-template-body"
          ref={bodyRef}
          rows={12}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={20000}
          required
          aria-invalid={unknown.length > 0 || undefined}
          aria-describedby={unknown.length > 0 ? 'consent-template-unknown' : undefined}
          className="leading-relaxed"
        />
      </FormField>
      {unknown.length > 0 ? (
        <InlineError id="consent-template-unknown">{copy.unknown(unknown)}</InlineError>
      ) : null}
    </FormModal>
  );
}
