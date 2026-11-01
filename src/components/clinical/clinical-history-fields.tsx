'use client';
import * as React from 'react';
import { AllergyListEditor } from '@/components/clinical/allergy-list-editor';
import { MedicationListEditor } from '@/components/clinical/medication-list-editor';
import { ConditionChecklist } from '@/components/clinical/condition-checklist';
import { HabitsEditor } from '@/components/clinical/habits-editor';
import { FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AnswerGroup,
  TRI_STATE_CHOICES,
  answerOfChoice,
  choiceOf,
} from '@/components/clinical/answer-group';
import type { ClinicalHistoryValue } from '@/lib/clinical/clinical-types';

const copy = {
  pregnant: 'Embarazo', weeksPregnant: 'Semanas de embarazo', notes: 'Notas',
};

// `notes` is a section like the rest so a multi-step consumer (the create
// wizard) can place the shared "Notas" field on ONE step instead of having it
// reappear on every step that mounts this component. Consumers that render the
// whole anamnesis at once (the patient-detail panel) pass no `sections` and get
// all of them, notes included.
type Section = 'conditions' | 'allergies' | 'medications' | 'habits' | 'notes';
const ALL_SECTIONS: Section[] = ['conditions', 'allergies', 'medications', 'habits', 'notes'];

interface ClinicalHistoryFieldsProps {
  value: ClinicalHistoryValue;
  onChange: (next: ClinicalHistoryValue) => void;
  sections?: Section[];
}

/** Composes the four clinical editors + the safety/notes scalar fields into one controlled form. */
export function ClinicalHistoryFields({ value, onChange, sections = ALL_SECTIONS }: ClinicalHistoryFieldsProps) {
  const show = (s: Section) => sections.includes(s);

  return (
    <div className="flex flex-col gap-8">
      {show('conditions') && (
        <>
          <ConditionChecklist
            value={value.conditions ?? []}
            onChange={(next) => onChange({ ...value, conditions: next })}
          />
          {/* Sigue a las condiciones, como una pregunta más de la lista. */}
          <ul className="-mt-8 flex flex-col border-t border-border-subtle">
            <AnswerGroup
              id="ch-embarazo"
              legend={copy.pregnant}
              value={choiceOf(value.pregnancy)}
              choices={TRI_STATE_CHOICES}
              onChange={(a) => {
                const pregnancy = answerOfChoice(a);
                onChange({
                  ...value,
                  pregnancy,
                  // Las semanas solo acompañan a un «Sí».
                  semanasEmbarazo: pregnancy === 'SI' ? value.semanasEmbarazo : undefined,
                });
              }}
            >
              {value.pregnancy === 'SI' && (
                <FormField htmlFor="ch-semanas-embarazo" label={copy.weeksPregnant}>
                  <Input
                    id="ch-semanas-embarazo"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="sm:max-w-32"
                    value={value.semanasEmbarazo ?? ''}
                    onChange={(e) =>
                      onChange({
                        ...value,
                        semanasEmbarazo: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </FormField>
              )}
            </AnswerGroup>
          </ul>
        </>
      )}

      {show('allergies') && (
        <AllergyListEditor
          value={value.allergies ?? []}
          onChange={(next) => onChange({ ...value, allergies: next })}
        />
      )}

      {show('medications') && (
        <MedicationListEditor
          value={value.medications ?? []}
          onChange={(next) => onChange({ ...value, medications: next })}
        />
      )}

      {show('habits') && (
        <HabitsEditor
          value={value.habits ?? {}}
          // Sin ninguna respuesta, el bloque no viaja (igual que la versión de origen).
          onChange={(next) =>
            onChange({ ...value, habits: Object.keys(next).length > 0 ? next : undefined })
          }
        />
      )}

      {show('notes') && (
        <FormField htmlFor="ch-notes" label={copy.notes}>
          <Textarea
            id="ch-notes"
            autoGrow
            value={value.notes ?? ''}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
          />
        </FormField>
      )}
    </div>
  );
}
