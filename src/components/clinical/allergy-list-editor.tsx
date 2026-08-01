'use client';
import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/molecules/form-field';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
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
    <fieldset className="flex flex-col gap-3">
      <legend className="t-label text-ink">{copy.legend}</legend>
      {value.length === 0 && <p className="text-sm text-muted">{copy.empty}</p>}
      <ul className="flex flex-col gap-3">
        {value.map((row, i) => (
          <li key={i} className="rounded-lg border border-border p-3 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField htmlFor={`al-${i}`} label={copy.allergen}>
                <Input id={`al-${i}`} value={row.alergeno} onChange={(e) => update(i, { alergeno: e.target.value })} />
              </FormField>
              <FormField htmlFor={`at-${i}`} label={copy.type}>
                <select id={`at-${i}`} className={cn(fieldClass, 'h-10')} value={row.tipo}
                  onChange={(e) => update(i, { tipo: e.target.value as AllergyType })}>
                  {Object.entries(ALLERGY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </FormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField htmlFor={`as-${i}`} label={copy.severity}>
                <select id={`as-${i}`} className={cn(fieldClass, 'h-10')} value={row.severidad}
                  onChange={(e) => update(i, { severidad: e.target.value as AllergySeverity })}>
                  {Object.entries(ALLERGY_SEVERITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </FormField>
              <FormField htmlFor={`ar-${i}`} label={copy.reaction}>
                <Input id={`ar-${i}`} value={row.reaccion ?? ''} onChange={(e) => update(i, { reaccion: e.target.value })} />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" aria-label={copy.isAlert} checked={row.esAlerta}
                onChange={(e) => update(i, { esAlerta: e.target.checked })} />
              {copy.isAlert}
            </label>
            <Button type="button" variant="outline" size="sm" className="self-start"
              onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 /> {copy.remove}
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...value, newRow()])}>
        <Plus /> {copy.add}
      </Button>
    </fieldset>
  );
}
