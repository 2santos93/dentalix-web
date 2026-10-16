'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { recordDentitionEvents } from '@/lib/odontogram/odontogram-api';
import {
  DENTITION_LABELS,
  DENTITION_ORDER,
  DENTITION_REASON_LABELS,
  hasPrimaryPredecessor,
  primaryAtPosition,
  type DentitionReason,
  type DentitionType,
} from '@/lib/odontogram/dentition';
import { PERMANENT_LOWER, PERMANENT_UPPER } from '@/lib/odontogram/fdi';
import { toothChartSide } from '@/lib/odontogram/tooth-anatomy';
import { FormModal } from '@/components/shared/form-modal';
import { InlineError } from '@/components/errors/inline-error';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

const copy = {
  title: 'Cambiar dentición',
  description:
    'Marca las posiciones y su nueva dentición. Queda en el historial con el motivo, tu nombre y la fecha; no se borra nada.',
  positionsLegend: 'Posiciones',
  quadrant: (n: number) => `Cuadrante ${n}`,
  positionName: (position: string, current: string) => `Posición ${position}, ahora ${current}`,
  currentShort: (position: string, current: DentitionType) => {
    const primary = primaryAtPosition(position);
    if (current === 'PRIMARY') return primary ? `temporal (${primary})` : 'sin erupcionar';
    if (current === 'MIXED') return `mixta (${primary})`;
    return 'permanente';
  },
  dentitionLegend: 'Nueva dentición',
  reasonLabel: 'Motivo',
  exfoliationHint: 'Exfoliar es perder el temporal: la posición queda en permanente.',
  submit: 'Guardar dentición',
  noPositions: 'Elige al menos una posición.',
  mixedMolars: (list: string) =>
    `Los molares (${list}) no tienen diente temporal: no pueden estar en dentición mixta.`,
  exfoliationMolars: (list: string) => `Los molares (${list}) no tienen diente temporal que exfoliar.`,
  genericError: 'No pudimos cambiar la dentición. Intenta de nuevo.',
};

/** Cuadrantes en el orden de la carta, cada uno con sus 8 posiciones de la línea media hacia fuera. */
const QUADRANTS: { n: number; positions: string[] }[] = [1, 2, 3, 4].map((n) => ({
  n,
  positions: [...PERMANENT_UPPER, ...PERMANENT_LOWER]
    .filter((p) => Number(p[0]) === n)
    .sort((a, b) => Number(a[1]) - Number(b[1])),
}));

interface DentitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** Dentición actual de cada posición (para rotular las casillas). */
  dentitionOf: (position: string) => DentitionType;
  /** Posiciones marcadas al abrir (p. ej. la del diente seleccionado). */
  initialPositions?: string[];
  initialDentition?: DentitionType;
  initialReason?: DentitionReason;
  onChanged: () => void;
}

/**
 * «Cambiar dentición» sobre una selección de posiciones (DX-120): erupción,
 * exfoliación o cambio manual. Un evento por posición, append-only; la API
 * vuelve a validar (422 en español).
 */
export function DentitionDialog({
  open,
  onOpenChange,
  token,
  patientId,
  dentitionOf,
  initialPositions = [],
  initialDentition = 'PERMANENT',
  initialReason = 'MANUAL',
  onChanged,
}: DentitionDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialPositions));
  const [dentition, setDentition] = useState<DentitionType>(
    initialReason === 'EXFOLIATION' ? 'PERMANENT' : initialDentition,
  );
  const [reason, setReason] = useState<DentitionReason>(initialReason);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggle(position: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(position);
      else next.delete(position);
      return next;
    });
  }

  function handleReason(next: DentitionReason) {
    setReason(next);
    if (next === 'EXFOLIATION') setDentition('PERMANENT');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const positions = QUADRANTS.flatMap((q) => q.positions).filter((p) => selected.has(p));
    const molars = positions.filter((p) => !hasPrimaryPredecessor(p)).join(', ');
    const problem =
      positions.length === 0
        ? copy.noPositions
        : molars && dentition === 'MIXED'
          ? copy.mixedMolars(molars)
          : molars && reason === 'EXFOLIATION'
            ? copy.exfoliationMolars(molars)
            : null;
    setValidationError(problem);
    if (problem) return;

    setSubmitting(true);
    try {
      await recordDentitionEvents(token, patientId, { positions, dentition, reason });
      onOpenChange(false);
      onChanged();
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
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      size="lg"
    >
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="t-label mb-1 text-muted">{copy.positionsLegend}</legend>
        {/* Los cuadrantes en la disposición de la carta (1 | 2 arriba, 4 | 3
            abajo), cada uno de la línea media hacia fuera. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2, 4, 3].map((n) => {
            const quadrant = QUADRANTS[n - 1];
            const ordered =
              toothChartSide(quadrant.positions[0]) === 'left' ? [...quadrant.positions].reverse() : quadrant.positions;
            return (
              <fieldset key={n} className="min-w-0 rounded-lg border border-hairline p-2">
                <legend className="px-1 text-xs text-muted">{copy.quadrant(n)}</legend>
                <div className="grid grid-cols-4 gap-1">
                  {ordered.map((position) => {
                    const current = dentitionOf(position);
                    const id = `dent-pos-${position}`;
                    return (
                      <label
                        key={position}
                        htmlFor={id}
                        className="flex min-h-11 items-start gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-surface-2"
                      >
                        <input
                          id={id}
                          type="checkbox"
                          className="mt-0.5"
                          checked={selected.has(position)}
                          aria-label={copy.positionName(position, copy.currentShort(position, current))}
                          onChange={(e) => toggle(position, e.target.checked)}
                        />
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="font-medium tabular-nums text-ink">{position}</span>
                          <span className="truncate text-[11px] text-muted">{copy.currentShort(position, current)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="t-label mb-1 text-muted">{copy.dentitionLegend}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {DENTITION_ORDER.map((option) => (
              <label key={option} htmlFor={`dent-new-${option}`} className="flex items-center gap-1.5 text-sm text-ink">
                <input
                  id={`dent-new-${option}`}
                  type="radio"
                  name="dentition"
                  value={option}
                  checked={dentition === option}
                  disabled={reason === 'EXFOLIATION' && option !== 'PERMANENT'}
                  onChange={() => setDentition(option)}
                />
                {DENTITION_LABELS[option]}
              </label>
            ))}
          </div>
          {reason === 'EXFOLIATION' ? <p className="text-xs text-muted">{copy.exfoliationHint}</p> : null}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dent-reason">{copy.reasonLabel}</Label>
          <select
            id="dent-reason"
            value={reason}
            onChange={(e) => handleReason(e.target.value as DentitionReason)}
            className={cn(fieldClass, 'h-10')}
          >
            {(Object.keys(DENTITION_REASON_LABELS) as DentitionReason[]).map((r) => (
              <option key={r} value={r}>
                {DENTITION_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {validationError ? <InlineError>{validationError}</InlineError> : null}
    </FormModal>
  );
}
