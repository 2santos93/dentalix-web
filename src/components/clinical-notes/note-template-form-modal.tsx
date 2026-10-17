'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createNoteTemplate,
  updateNoteTemplate,
  type NotePromptType,
  type NoteTemplate,
} from '@/lib/clinical-notes/note-templates-api';
import { composeNote, initialAnswer } from '@/lib/clinical-notes/compose';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

export const noteTemplateFormCopy = {
  createTitle: 'Nueva plantilla de evolución',
  editTitle: 'Editar plantilla de evolución',
  description:
    'Texto fijo con marcadores {{Etiqueta}} que se rellenan con las respuestas. Editarla no cambia las evoluciones ya guardadas.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Resina',
  category: 'Carpeta',
  categoryHint: 'Opcional. Agrupa las plantillas en el selector (Operatoria, Cirugía…).',
  body: 'Texto de la plantilla',
  bodyHint: 'Escribe {{Etiqueta}} donde va la respuesta de cada pregunta.',
  prompts: 'Preguntas',
  noPrompts: 'Sin preguntas: la plantilla es solo texto fijo.',
  addPrompt: 'Añadir pregunta',
  prompt: (n: number) => `Pregunta ${n}`,
  label: 'Etiqueta',
  labelHint: 'Hasta 50 caracteres. Es también su marcador.',
  type: 'Tipo',
  types: { ONE: 'Opción única', MULTI: 'Opción múltiple', TEXT: 'Texto libre' } as Record<
    NotePromptType,
    string
  >,
  options: 'Opciones',
  optionsHint: 'Una por línea.',
  defaultValue: 'Valor por defecto',
  noDefault: 'Ninguno',
  insertMarker: 'Insertar marcador',
  insertMarkerFor: (label: string) => `Insertar el marcador de «${label}» en el texto`,
  moveUp: (n: number) => `Subir la pregunta ${n}`,
  moveDown: (n: number) => `Bajar la pregunta ${n}`,
  remove: (n: number) => `Quitar la pregunta ${n}`,
  preview: 'Vista previa (con los valores por defecto)',
  create: 'Crear plantilla',
  save: 'Guardar cambios',
  invalidName: 'Escribe un nombre (hasta 80 caracteres).',
  invalidBody: 'Escribe el texto de la plantilla.',
  genericError: 'No pudimos guardar la plantilla. Intenta de nuevo.',
};

const copy = noteTemplateFormCopy;

interface PromptDraft {
  key: number;
  label: string;
  type: NotePromptType;
  options: string;
  defaultValue: string;
}

function optionList(text: string): string[] {
  return text
    .split('\n')
    .map((o) => o.trim())
    .filter((o) => o !== '');
}

interface NoteTemplateFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin plantilla: alta. Con plantilla: edición. */
  template?: NoteTemplate | null;
  /** Carpetas ya usadas, para sugerirlas. */
  categories: string[];
  onSaved: (template: NoteTemplate) => void;
}

/**
 * Alta y edición de una plantilla de evolución (DX-170, solo ADMIN): nombre,
 * carpeta, texto con marcadores y sus preguntas (ONE, MULTI o TEXT). La API
 * valida marcadores y opciones y responde en español; aquí solo se evita
 * mandar lo que seguro está vacío. El padre lo monta con una `key` por
 * apertura.
 */
export function NoteTemplateFormModal({
  open,
  onOpenChange,
  token,
  template,
  categories,
  onSaved,
}: NoteTemplateFormModalProps) {
  const editing = !!template;
  const ids = useId();
  const [name, setName] = useState(template?.name ?? '');
  const [category, setCategory] = useState(template?.category ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [nextKey, setNextKey] = useState(template?.prompts.length ?? 0);
  const [prompts, setPrompts] = useState<PromptDraft[]>(
    (template?.prompts ?? []).map((p, i) => ({
      key: i,
      label: p.label,
      type: p.type,
      options: p.options.join('\n'),
      defaultValue: p.defaultValue ?? '',
    })),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: number, patch: Partial<PromptDraft>) {
    setPrompts((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function move(index: number, delta: -1 | 1) {
    setPrompts((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  }

  function addPrompt() {
    setPrompts((prev) => [
      ...prev,
      { key: nextKey, label: '', type: 'ONE', options: '', defaultValue: '' },
    ]);
    setNextKey((k) => k + 1);
  }

  function insertMarker(label: string) {
    const marker = `{{${label.trim()}}}`;
    setBody((prev) => (prev === '' || /\s$/.test(prev) ? `${prev}${marker}` : `${prev} ${marker}`));
  }

  const payloadPrompts = prompts.map((p) => ({
    label: p.label.trim(),
    type: p.type,
    options: p.type === 'TEXT' ? [] : optionList(p.options),
    defaultValue: p.defaultValue.trim() === '' ? null : p.defaultValue.trim(),
  }));
  const previewPrompts = payloadPrompts.map((p, i) => ({ ...p, id: String(i) }));
  const preview = composeNote(
    body,
    previewPrompts,
    Object.fromEntries(previewPrompts.map((p) => [p.id, initialAnswer(p)])),
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 80) return setError(copy.invalidName);
    if (body.trim() === '') return setError(copy.invalidBody);
    setSubmitting(true);
    try {
      const input = {
        name: trimmed,
        category: category.trim() === '' ? null : category.trim(),
        body: body.trim(),
        prompts: payloadPrompts,
      };
      const saved = editing
        ? await updateNoteTemplate(token, template.id, input)
        : await createNoteTemplate(token, input);
      onSaved(saved);
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
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      error={error}
      size="lg"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="tpl-name" label={copy.name}>
          <Input
            id="tpl-name"
            value={name}
            maxLength={80}
            placeholder={copy.namePlaceholder}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </FormField>
        <FormField htmlFor="tpl-category" label={copy.category} hint={copy.categoryHint}>
          <Input
            id="tpl-category"
            value={category}
            maxLength={60}
            list={`${ids}-categories`}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id={`${ids}-categories`}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </FormField>
      </div>

      <FormField htmlFor="tpl-body" label={copy.body} hint={copy.bodyHint}>
        <textarea
          id="tpl-body"
          rows={4}
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
          className={cn(fieldClass, 'h-auto font-mono text-[13px]')}
          required
        />
      </FormField>

      <section aria-labelledby={`${ids}-prompts`} className="flex flex-col gap-3">
        <h3 id={`${ids}-prompts`} className="text-sm font-semibold text-ink">
          {copy.prompts}
        </h3>
        {prompts.length === 0 ? <p className="text-sm text-muted">{copy.noPrompts}</p> : null}
        <ol className="flex flex-col gap-3">
          {prompts.map((p, index) => {
            const n = index + 1;
            const base = `${ids}-p${p.key}`;
            const options = optionList(p.options);
            return (
              <li
                key={p.key}
                aria-label={copy.prompt(n)}
                className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted tabular-nums">{copy.prompt(n)}</span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={copy.moveUp(n)}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={copy.moveDown(n)}
                      disabled={index === prompts.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={copy.remove(n)}
                      onClick={() => setPrompts((prev) => prev.filter((x) => x.key !== p.key))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField htmlFor={`${base}-label`} label={copy.label} hint={copy.labelHint}>
                    <Input
                      id={`${base}-label`}
                      value={p.label}
                      maxLength={50}
                      onChange={(e) => update(p.key, { label: e.target.value })}
                    />
                  </FormField>
                  <FormField htmlFor={`${base}-type`} label={copy.type}>
                    <select
                      id={`${base}-type`}
                      value={p.type}
                      onChange={(e) =>
                        update(p.key, { type: e.target.value as NotePromptType, defaultValue: '' })
                      }
                      className={cn(fieldClass, 'h-10')}
                    >
                      {(['ONE', 'MULTI', 'TEXT'] as const).map((t) => (
                        <option key={t} value={t}>
                          {copy.types[t]}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                {p.type === 'TEXT' ? (
                  <FormField htmlFor={`${base}-default`} label={copy.defaultValue}>
                    <Input
                      id={`${base}-default`}
                      value={p.defaultValue}
                      maxLength={200}
                      onChange={(e) => update(p.key, { defaultValue: e.target.value })}
                    />
                  </FormField>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField htmlFor={`${base}-options`} label={copy.options} hint={copy.optionsHint}>
                      <textarea
                        id={`${base}-options`}
                        rows={3}
                        value={p.options}
                        onChange={(e) => update(p.key, { options: e.target.value })}
                        className={cn(fieldClass, 'h-auto')}
                      />
                    </FormField>
                    <FormField htmlFor={`${base}-default`} label={copy.defaultValue}>
                      <select
                        id={`${base}-default`}
                        value={options.includes(p.defaultValue) ? p.defaultValue : ''}
                        onChange={(e) => update(p.key, { defaultValue: e.target.value })}
                        className={cn(fieldClass, 'h-10')}
                      >
                        <option value="">{copy.noDefault}</option>
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  disabled={p.label.trim() === ''}
                  aria-label={p.label.trim() ? copy.insertMarkerFor(p.label.trim()) : copy.insertMarker}
                  onClick={() => insertMarker(p.label)}
                >
                  {copy.insertMarker}
                </Button>
              </li>
            );
          })}
        </ol>
        <Button type="button" variant="secondary" className="self-start" onClick={addPrompt}>
          <Plus aria-hidden />
          {copy.addPrompt}
        </Button>
      </section>

      {body.trim() ? (
        <section aria-label={copy.preview} className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-ink">{copy.preview}</p>
          <p className="whitespace-pre-line break-words rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink">
            {preview}
          </p>
        </section>
      ) : null}
    </FormModal>
  );
}
