'use client';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const copy = { back: 'Atrás', next: 'Siguiente' };

export interface WizardStep {
  key: string;
  label: string;
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
 * shows progress and lets the caller jump between already-visited steps.
 */
export function Wizard({ steps, current, onStepChange, children }: WizardProps) {
  return (
    <div className="flex flex-col gap-6">
      <ol className="flex items-center gap-2">
        {steps.map((step, i) => {
          const isActive = i === current;
          const isDone = i < current;
          return (
            <li
              key={step.key}
              aria-current={isActive ? 'step' : undefined}
              className="flex flex-1 items-center gap-2"
            >
              <button
                type="button"
                onClick={() => onStepChange(i)}
                className={cn(
                  'flex w-full flex-col items-start gap-1 border-b-2 pb-2 text-left text-sm font-medium transition-colors',
                  isActive && 'border-primary text-primary',
                  isDone && !isActive && 'border-border text-ink',
                  !isActive && !isDone && 'border-border text-muted',
                )}
              >
                <span className="tabular-nums">{i + 1}</span>
                {step.label}
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
