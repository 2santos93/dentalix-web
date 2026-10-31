'use client';
import * as React from 'react';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { ConditionSummaryText } from '@/components/clinical/condition-summary';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import {
  type Condition, type ConditionStatus,
  CONDITION_STATUS_LABELS, CONDITION_UNANSWERED_LABEL, STANDARD_CONDITIONS,
} from '@/lib/clinical/clinical-types';

const copy = {
  legend: 'Condiciones médicas',
  hint: 'Marque solo lo que se preguntó. Lo que quede «Sin responder» se guarda así, nunca como «No».',
  note: 'Nota',
};

/** Valor del radio «Sin responder»: la condición no va en la lista. */
const UNANSWERED = '';
type Choice = ConditionStatus | typeof UNANSWERED;
const CHOICES: { value: Choice; label: string }[] = [
  { value: UNANSWERED, label: CONDITION_UNANSWERED_LABEL },
  { value: 'SI', label: CONDITION_STATUS_LABELS.SI },
  { value: 'NO', label: CONDITION_STATUS_LABELS.NO },
  { value: 'DESCONOCE', label: CONDITION_STATUS_LABELS.DESCONOCE },
];

/**
 * Checklist de condiciones de la anamnesis del personal. Cada condición
 * empieza «Sin responder» (no figura en `value`) y solo entra en la lista
 * cuando alguien elige Sí / No / No sabe: una pregunta que nadie hizo nunca
 * se guarda como «No» (hallazgo negativo falso en un documento médico-legal).
 * Volver a «Sin responder» la quita de la lista.
 */
export function ConditionChecklist({ value, onChange }: { value: Condition[]; onChange: (n: Condition[]) => void }) {
  const ids = useId();
  const hintId = `${ids}-hint`;
  const findRow = (codigo: string) => value.find((c) => c.codigo === codigo);

  const answer = (codigo: string, etiqueta: string, choice: Choice) => {
    const rest = value.filter((c) => c.codigo !== codigo);
    if (choice === UNANSWERED) {
      onChange(rest);
      return;
    }
    const current = findRow(codigo);
    onChange([...rest, { codigo, etiqueta, estado: choice, esAlerta: false, nota: current?.nota }]);
  };

  const setNote = (codigo: string, nota: string) => {
    onChange(value.map((c) => (c.codigo === codigo ? { ...c, nota } : c)));
  };

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={hintId}>
      <legend className="t-label text-ink">{copy.legend}</legend>
      <div id={hintId} className="flex flex-col gap-1 text-sm">
        <p className="text-muted">{copy.hint}</p>
        <p>
          <ConditionSummaryText conditions={value} />
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {STANDARD_CONDITIONS.map(({ codigo, etiqueta }) => {
          const row = findRow(codigo);
          const selected: Choice = row?.estado ?? UNANSWERED;
          const noteId = `${ids}-${codigo}-note`;
          return (
            <li key={codigo} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <RadioGroup
                id={`${ids}-${codigo}`}
                legend={etiqueta}
                value={selected}
                onValueChange={(v) => answer(codigo, etiqueta, v as Choice)}
                optionsClassName="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {CHOICES.map((choice, i) => (
                  <RadioCard
                    key={choice.value || 'unanswered'}
                    id={i === 0 ? `${ids}-${codigo}` : undefined}
                    value={choice.value}
                    title={choice.label}
                    layout="inline"
                  />
                ))}
              </RadioGroup>
              {/* La nota va con una respuesta: sin ella no hay fila que guardar. */}
              {row && (
                <FormField htmlFor={noteId} label={`${copy.note} (${etiqueta})`}>
                  <Input id={noteId} value={row.nota ?? ''} onChange={(e) => setNote(codigo, e.target.value)} />
                </FormField>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
