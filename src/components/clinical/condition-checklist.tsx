'use client';
import * as React from 'react';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { ConditionSummaryText } from '@/components/clinical/condition-summary';
import {
  AnswerGroup, AnswerSection, TRI_STATE_CHOICES, UNANSWERED, type AnswerChoice,
} from '@/components/clinical/answer-group';
import {
  type Condition, type ConditionStatus, STANDARD_CONDITIONS,
} from '@/lib/clinical/clinical-types';

const copy = {
  legend: 'Condiciones médicas',
  hint: 'Marque solo lo que se preguntó. Lo que quede «Sin responder» se guarda así, nunca como «No».',
  note: 'Nota',
};

type Choice = ConditionStatus | typeof UNANSWERED;
const CHOICES: AnswerChoice<ConditionStatus>[] = TRI_STATE_CHOICES;

/**
 * Checklist de condiciones de la anamnesis del personal. Cada condición
 * empieza «Sin responder» (no figura en `value`) y solo entra en la lista
 * cuando alguien elige Sí / No / No sabe: una pregunta que nadie hizo nunca
 * se guarda como «No» (hallazgo negativo falso en un documento médico-legal).
 * Volver a «Sin responder» la quita de la lista.
 */
export function ConditionChecklist({ value, onChange }: { value: Condition[]; onChange: (n: Condition[]) => void }) {
  const ids = useId();
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
    <AnswerSection
      title={copy.legend}
      description={
        <>
          <p>{copy.hint}</p>
          <p className="text-ink">
            <ConditionSummaryText conditions={value} />
          </p>
        </>
      }
    >
      {STANDARD_CONDITIONS.map(({ codigo, etiqueta }) => {
        const row = findRow(codigo);
        const noteId = `${ids}-${codigo}-note`;
        return (
          <AnswerGroup
            key={codigo}
            id={`${ids}-${codigo}`}
            legend={etiqueta}
            value={row?.estado ?? UNANSWERED}
            choices={CHOICES}
            onChange={(v) => answer(codigo, etiqueta, v)}
          >
            {/* La nota va con una respuesta: sin ella no hay fila que guardar. */}
            {row && (
              <FormField htmlFor={noteId} label={`${copy.note} (${etiqueta})`}>
                <Input id={noteId} value={row.nota ?? ''} onChange={(e) => setNote(codigo, e.target.value)} />
              </FormField>
            )}
          </AnswerGroup>
        );
      })}
    </AnswerSection>
  );
}
