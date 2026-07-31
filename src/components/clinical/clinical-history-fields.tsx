'use client';
import * as React from 'react';
import { AllergyListEditor } from '@/components/clinical/allergy-list-editor';
import { MedicationListEditor } from '@/components/clinical/medication-list-editor';
import { ConditionChecklist } from '@/components/clinical/condition-checklist';
import { HabitsEditor } from '@/components/clinical/habits-editor';
import { FormField } from '@/components/molecules/form-field';
import { Input } from '@/components/ui/input';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import type { ClinicalHistoryValue } from '@/lib/clinical/clinical-types';

const copy = {
  pregnant: 'Embarazo', weeksPregnant: 'Semanas de embarazo', notes: 'Notas',
};

type Section = 'conditions' | 'allergies' | 'medications' | 'habits';
const ALL_SECTIONS: Section[] = ['conditions', 'allergies', 'medications', 'habits'];

interface ClinicalHistoryFieldsProps {
  value: ClinicalHistoryValue;
  onChange: (next: ClinicalHistoryValue) => void;
  sections?: Section[];
}

/** Composes the four clinical editors + the safety/notes scalar fields into one controlled form. */
export function ClinicalHistoryFields({ value, onChange, sections = ALL_SECTIONS }: ClinicalHistoryFieldsProps) {
  const show = (s: Section) => sections.includes(s);

  return (
    <div className="flex flex-col gap-6">
      {show('conditions') && (
        <>
          <ConditionChecklist
            value={value.conditions ?? []}
            onChange={(next) => onChange({ ...value, conditions: next })}
          />
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                aria-label={copy.pregnant}
                checked={value.embarazo ?? false}
                onChange={(e) => onChange({ ...value, embarazo: e.target.checked })}
              />
              {copy.pregnant}
            </label>
            {value.embarazo && (
              <FormField htmlFor="ch-semanas-embarazo" label={copy.weeksPregnant}>
                <Input
                  id="ch-semanas-embarazo"
                  type="number"
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
          </div>
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
          onChange={(next) => onChange({ ...value, habits: next })}
        />
      )}

      <FormField htmlFor="ch-notes" label={copy.notes}>
        <textarea
          id="ch-notes"
          className={cn(fieldClass, 'min-h-24')}
          value={value.notes ?? ''}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </FormField>
    </div>
  );
}
