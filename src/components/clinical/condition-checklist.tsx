'use client';
import * as React from 'react';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/molecules/form-field';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import {
  type Condition, type ConditionStatus,
  CONDITION_STATUS_LABELS, STANDARD_CONDITIONS,
} from '@/lib/clinical/clinical-types';

const copy = { legend: 'Condiciones médicas', status: 'Estado', note: 'Nota' };

export function ConditionChecklist({ value, onChange }: { value: Condition[]; onChange: (n: Condition[]) => void }) {
  const findRow = (codigo: string) => value.find((c) => c.codigo === codigo);

  const update = (codigo: string, etiqueta: string, patch: Partial<Condition>) => {
    const current = findRow(codigo);
    const next: Condition = {
      codigo,
      etiqueta,
      estado: current?.estado ?? 'NO',
      esAlerta: false,
      nota: current?.nota,
      ...patch,
    };
    const rest = value.filter((c) => c.codigo !== codigo);
    onChange(next.estado === 'NO' ? rest : [...rest, next]);
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="t-label text-ink">{copy.legend}</legend>
      <ul className="flex flex-col gap-3">
        {STANDARD_CONDITIONS.map(({ codigo, etiqueta }) => {
          const row = findRow(codigo);
          const estado: ConditionStatus = row?.estado ?? 'NO';
          return (
            <li key={codigo} className="rounded-lg border border-border p-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <FormField htmlFor={`cs-${codigo}`} label={etiqueta}>
                  <select id={`cs-${codigo}`} className={cn(fieldClass, 'h-10')} value={estado}
                    onChange={(e) => update(codigo, etiqueta, { estado: e.target.value as ConditionStatus })}>
                    {Object.entries(CONDITION_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </FormField>
              </div>
              <div className="flex-1">
                <FormField htmlFor={`cn-${codigo}`} label={copy.note}>
                  <Input id={`cn-${codigo}`} value={row?.nota ?? ''} onChange={(e) => update(codigo, etiqueta, { nota: e.target.value })} />
                </FormField>
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
