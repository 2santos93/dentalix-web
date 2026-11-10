'use client';
import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { NoteTemplate } from '@/lib/clinical-notes/note-templates-api';
import { composeNote, initialAnswer, type PromptAnswer } from '@/lib/clinical-notes/compose';
import { Button } from '@/components/ui/button';
import { TemplatePrompts } from './template-prompts';

export const shortcutPromptsCopy = {
  title: (name: string) => `Preguntas de «${name}»`,
  description: 'Respóndelas y el texto se inserta donde escribiste el atajo.',
  preview: 'Se insertará',
  insert: 'Insertar en el texto',
  cancel: 'Cancelar',
};

const copy = shortcutPromptsCopy;

interface ShortcutPromptsPanelProps {
  template: NoteTemplate;
  onInsert: (text: string) => void;
  onCancel: () => void;
}

/**
 * DX-455: el atajo de una plantilla CON preguntas no inserta el texto a
 * ciegas: abre estas preguntas (las mismas de DX-170, `TemplatePrompts`) y lo
 * que se inserta es el texto ya compuesto. «Cancelar» deja el atajo como texto.
 * Vive dentro del formulario de la evolución (no es un diálogo encima de otro,
 * que en un modal a pantalla completa en el móvil sería una trampa de foco):
 * recibe el foco al aparecer.
 */
export function ShortcutPromptsPanel({ template, onInsert, onCancel }: ShortcutPromptsPanelProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [answers, setAnswers] = useState<Record<string, PromptAnswer>>(() =>
    Object.fromEntries(template.prompts.map((p) => [p.id, initialAnswer(p)])),
  );
  const composed = composeNote(template.body, template.prompts, answers);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-sunken p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-text"
    >
      <div className="flex flex-col gap-0.5">
        <p id={titleId} className="text-sm font-semibold text-ink">
          {copy.title(template.name)}
        </p>
        <p className="text-xs text-muted">{copy.description}</p>
      </div>
      <TemplatePrompts
        prompts={template.prompts}
        answers={answers}
        onChange={(promptId, answer) => setAnswers((prev) => ({ ...prev, [promptId]: answer }))}
      />
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted">{copy.preview}</p>
        <p className="whitespace-pre-line break-words rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-ink">
          {composed}
        </p>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" className="max-sm:min-h-11" onClick={onCancel}>
          {copy.cancel}
        </Button>
        {/* Secundario: la primaria del modal sigue siendo «Guardar evolución». */}
        <Button type="button" variant="secondary" className="max-sm:min-h-11" onClick={() => onInsert(composed)}>
          {copy.insert}
        </Button>
      </div>
    </div>
  );
}
