'use client';
import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { NativeSelect } from '@/components/ui/native-select';
import { Checkbox } from '@/components/ui/checkbox';
import { AnswerSection } from '@/components/clinical/answer-group';
import {
  type Allergy, type AllergyType, type AllergySeverity,
  ALLERGY_TYPE_LABELS, ALLERGY_SEVERITY_LABELS,
} from '@/lib/clinical/clinical-types';

const copy = {
  legend: 'Alergias', add: 'Agregar alergia', remove: 'Quitar alergia',
  allergen: 'Alérgeno', type: 'Tipo', reaction: 'Reacción', severity: 'Severidad',
  isAlert: 'Marcar como alerta', empty: 'Sin alergias registradas.',
};
const newRow = (): Allergy => ({ alergeno: '', tipo: 'MEDICAMENTO', severidad: 'MODERADA', esAlerta: false });

export function AllergyListEditor({ value, onChange }: { value: Allergy[]; onChange: (n: Allergy[]) => void }) {
  const update = (i: number, patch: Partial<Allergy>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      <AnswerSection
        title={copy.legend}
        description={value.length === 0 ? <p>{copy.empty}</p> : undefined}
      >
        {value.map((row, i) => (
          <li key={i} className="flex flex-col gap-3 border-b border-border-subtle py-3 last:border-b-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField htmlFor={`al-${i}`} label={copy.allergen}>
                <Input id={`al-${i}`} value={row.alergeno} onChange={(e) => update(i, { alergeno: e.target.value })} />
              </FormField>
              <FormField htmlFor={`at-${i}`} label={copy.type}>
                <NativeSelect id={`at-${i}`} value={row.tipo}
                  onChange={(e) => update(i, { tipo: e.target.value as AllergyType })}>
                  {Object.entries(ALLERGY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </NativeSelect>
              </FormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField htmlFor={`as-${i}`} label={copy.severity}>
                <NativeSelect id={`as-${i}`} value={row.severidad}
                  onChange={(e) => update(i, { severidad: e.target.value as AllergySeverity })}>
                  {Object.entries(ALLERGY_SEVERITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </NativeSelect>
              </FormField>
              <FormField htmlFor={`ar-${i}`} label={copy.reaction}>
                <Input id={`ar-${i}`} value={row.reaccion ?? ''} onChange={(e) => update(i, { reaccion: e.target.value })} />
              </FormField>
            </div>
            <Checkbox label={copy.isAlert} checked={row.esAlerta}
              onChange={(e) => update(i, { esAlerta: e.target.checked })} />
            <Button type="button" variant="destructive-ghost" size="sm" className="self-start"
              onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 /> {copy.remove}
            </Button>
          </li>
        ))}
      </AnswerSection>
      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => onChange([...value, newRow()])}>
        <Plus /> {copy.add}
      </Button>
    </div>
  );
}
