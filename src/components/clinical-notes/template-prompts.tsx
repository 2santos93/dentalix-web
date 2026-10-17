'use client';
import * as React from 'react';
import { useId } from 'react';
import type { ComposablePrompt, PromptAnswer } from '@/lib/clinical-notes/compose';
import { SKIPPED_ANSWER } from '@/lib/clinical-notes/compose';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const templatePromptsCopy = {
  title: 'Preguntas de la plantilla',
  skip: 'Omitir',
  skipFor: (label: string) => `Omitir «${label}»`,
  skipped: `Omitida: quedará «${SKIPPED_ANSWER}» en el texto.`,
  multiHint: 'Puedes marcar varias.',
};

const copy = templatePromptsCopy;

interface TemplatePromptsProps {
  prompts: ComposablePrompt[];
  answers: Record<string, PromptAnswer>;
  onChange: (promptId: string, answer: PromptAnswer) => void;
}

/**
 * Todas las preguntas de la plantilla a la vez (como los _Grouped Prompts_ de
 * Open Dental): ONE como opciones de radio, MULTI como casillas y TEXT como un
 * campo. Cada una con «Omitir», que deja el hueco marcado «[sin respuesta]».
 * Las opciones son pastillas que se parten en varias líneas: a 390 px nada
 * desborda en horizontal.
 */
export function TemplatePrompts({ prompts, answers, onChange }: TemplatePromptsProps) {
  return (
    <section aria-label={copy.title} className="flex flex-col gap-4">
      {prompts.map((prompt) => (
        <PromptField
          key={prompt.id}
          prompt={prompt}
          answer={answers[prompt.id] ?? { values: [], skipped: false }}
          onChange={(answer) => onChange(prompt.id, answer)}
        />
      ))}
    </section>
  );
}

function PromptField({
  prompt,
  answer,
  onChange,
}: {
  prompt: ComposablePrompt;
  answer: PromptAnswer;
  onChange: (answer: PromptAnswer) => void;
}) {
  const textId = useId();
  const labelId = useId();
  const name = useId();
  const { skipped } = answer;

  function toggle(option: string) {
    if (prompt.type === 'ONE') return onChange({ values: [option], skipped: false });
    const values = answer.values.includes(option)
      ? answer.values.filter((v) => v !== option)
      : [...answer.values, option];
    onChange({ values, skipped: false });
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3"
    >
      <div className="flex items-start justify-between gap-2">
        {prompt.type === 'TEXT' ? (
          <label id={labelId} htmlFor={textId} className="text-sm font-medium text-ink">
            {prompt.label}
          </label>
        ) : (
          <span id={labelId} className="text-sm font-medium text-ink">
            {prompt.label}
          </span>
        )}
        <button
          type="button"
          aria-pressed={skipped}
          aria-label={copy.skipFor(prompt.label)}
          onClick={() => onChange({ ...answer, skipped: !skipped })}
          className={cn(
            'shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            skipped && 'bg-surface-2 text-ink',
          )}
        >
          {copy.skip}
        </button>
      </div>

      {prompt.type === 'TEXT' ? (
        <Input
          id={textId}
          value={answer.values[0] ?? ''}
          disabled={skipped}
          maxLength={1000}
          onChange={(e) => onChange({ values: [e.target.value], skipped: false })}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {prompt.options.map((option) => {
            const checked = answer.values.includes(option);
            return (
              <label
                key={option}
                className={cn(
                  'inline-flex min-h-9 max-w-full cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm text-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
                  checked && !skipped && 'border-primary bg-primary/10',
                  skipped && 'cursor-not-allowed opacity-50',
                )}
              >
                <input
                  type={prompt.type === 'ONE' ? 'radio' : 'checkbox'}
                  name={name}
                  checked={checked}
                  disabled={skipped}
                  onChange={() => toggle(option)}
                  className="size-4 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="break-words">{option}</span>
              </label>
            );
          })}
        </div>
      )}

      {skipped ? (
        <p className="text-xs text-muted">{copy.skipped}</p>
      ) : prompt.type === 'MULTI' ? (
        <p className="text-xs text-muted">{copy.multiHint}</p>
      ) : null}
    </div>
  );
}
