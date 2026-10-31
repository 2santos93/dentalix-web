'use client';
import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { AnswerSection } from '@/components/clinical/answer-group';
import { type Medication } from '@/lib/clinical/clinical-types';

const copy = {
  legend: 'Medicamentos', add: 'Agregar medicamento', remove: 'Quitar medicamento',
  name: 'Medicamento', dose: 'Dosis', frequency: 'Frecuencia', reason: 'Motivo',
  isAlert: 'Marcar como alerta', empty: 'Sin medicamentos registrados.',
};
const newRow = (): Medication => ({ nombre: '', esAlerta: false });

export function MedicationListEditor({ value, onChange }: { value: Medication[]; onChange: (n: Medication[]) => void }) {
  const update = (i: number, patch: Partial<Medication>) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      <AnswerSection
        title={copy.legend}
        description={value.length === 0 ? <p>{copy.empty}</p> : undefined}
      >
        {value.map((row, i) => (
          <li key={i} className="flex flex-col gap-3 border-b border-border-subtle py-3 last:border-b-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField htmlFor={`mn-${i}`} label={copy.name}>
                <Input id={`mn-${i}`} value={row.nombre} onChange={(e) => update(i, { nombre: e.target.value })} />
              </FormField>
              <FormField htmlFor={`md-${i}`} label={copy.dose}>
                <Input id={`md-${i}`} value={row.dosis ?? ''} onChange={(e) => update(i, { dosis: e.target.value })} />
              </FormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField htmlFor={`mf-${i}`} label={copy.frequency}>
                <Input id={`mf-${i}`} value={row.frecuencia ?? ''} onChange={(e) => update(i, { frecuencia: e.target.value })} />
              </FormField>
              <FormField htmlFor={`mm-${i}`} label={copy.reason}>
                <Input id={`mm-${i}`} value={row.motivo ?? ''} onChange={(e) => update(i, { motivo: e.target.value })} />
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
