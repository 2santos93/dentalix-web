'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const copy = {
  back: 'Atrás',
  next: 'Siguiente',
  optional: '(opcional)',
  stepOf: (n: number, total: number) => `Paso ${n} de ${total}`,
  progress: 'Progreso',
};

export interface WizardStep {
  key: string;
  label: string;
  /** Paso que se puede saltar: pinta «(opcional)» junto a la etiqueta. */
  optional?: boolean;
}

interface WizardProps {
  steps: WizardStep[];
  current: number;
  onStepChange: (i: number) => void;
  children: React.ReactNode;
}

/**
 * Accessible step indicator. Does NOT own the step content — the parent
 * renders `children` for whatever step is `current`; this component only
 * shows progress and lets the caller jump between steps.
 *
 * From `sm` up: one row of step buttons, labels on ONE line (truncated, the
 * full name stays in `title`) so every underline sits on the same baseline.
 * Below `sm`: «Paso 2 de 5 · Antecedentes» + a thin progress bar
 * (`role="progressbar"` with the same text as its value), because five labels
 * never fit 390px without hyphenating.
 */
export function Wizard({ steps, current, onStepChange, children }: WizardProps) {
  const active = steps[current];
  const stepOf = copy.stepOf(current + 1, steps.length);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:hidden">
        {/* Un solo nodo de texto: el nombre del paso no se duplica para quien
            busca la etiqueta (la lista de pasos sigue en el DOM, oculta). */}
        <p className="t-label tnum text-ink">
          {active ? `${stepOf} · ${active.label}` : stepOf}
          {active?.optional ? <span className="t-caption text-muted"> {copy.optional}</span> : null}
        </p>
        <div
          role="progressbar"
          aria-label={copy.progress}
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={current + 1}
          aria-valuetext={active ? `${stepOf}: ${active.label}` : stepOf}
          className="h-1 w-full overflow-hidden rounded-full bg-surface-active"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
            style={{ width: `${((current + 1) / Math.max(steps.length, 1)) * 100}%` }}
          />
        </div>
      </div>
      <ol className="hidden items-end gap-2 sm:flex">
        {steps.map((step, i) => {
          const isActive = i === current;
          const isDone = i < current;
          return (
            <li
              key={step.key}
              aria-current={isActive ? 'step' : undefined}
              className="flex min-w-0 flex-1"
            >
              <button
                type="button"
                onClick={() => onStepChange(i)}
                title={step.label}
                className={cn(
                  'flex w-full min-w-0 flex-col items-start gap-1 border-b-2 pb-2 text-left text-sm font-medium transition-colors pointer-coarse:min-h-11',
                  isActive && 'border-primary text-primary-text',
                  isDone && !isActive && 'border-border-input text-ink',
                  !isActive && !isDone && 'border-border text-muted',
                )}
              >
                {/* «(opcional)» junto al número: la etiqueta conserva todo el ancho. */}
                <span className="tnum">
                  {i + 1}
                  {step.optional ? (
                    <span className="t-caption font-normal text-muted"> {copy.optional}</span>
                  ) : null}
                </span>
                <span className="block w-full truncate whitespace-nowrap">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {children}
    </div>
  );
}

interface WizardNavProps {
  current: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  submitting: boolean;
  nextLabel?: string;
  backLabel?: string;
  submitLabel?: string;
}

export function WizardNav({
  current,
  total,
  onBack,
  onNext,
  onSubmit,
  submitting,
  nextLabel = copy.next,
  backLabel = copy.back,
  submitLabel = copy.next,
}: WizardNavProps) {
  const isLast = current === total - 1;
  return (
    <div className="flex items-center justify-between gap-3">
      {current > 0 ? (
        <Button type="button" variant="outline" onClick={onBack}>
          {backLabel}
        </Button>
      ) : (
        <span />
      )}
      {isLast ? (
        <Button type="button" onClick={onSubmit} loading={submitting}>
          {submitLabel}
        </Button>
      ) : (
        <Button type="button" onClick={onNext}>
          {nextLabel}
        </Button>
      )}
    </div>
  );
}
