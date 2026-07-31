'use client';
import * as React from 'react';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/molecules/form-field';
import { type Habits } from '@/lib/clinical/clinical-types';

const copy = {
  legend: 'Hábitos',
  smokes: 'Fuma', perDay: 'Cigarrillos por día', years: 'Años fumando',
  drinks: 'Consume alcohol', frequency: 'Frecuencia',
  substances: 'Consume sustancias psicoactivas',
  bruxism: 'Bruxismo',
  hygieneLegend: 'Higiene oral',
  brushingsPerDay: 'Cepillados por día', floss: 'Usa hilo dental',
  mouthwash: 'Usa enjuague bucal', fluorideToothpaste: 'Usa crema dental con flúor',
};

export function HabitsEditor({ value, onChange }: { value: Habits; onChange: (n: Habits) => void }) {
  const patchTabaquismo = (patch: Partial<NonNullable<Habits['tabaquismo']>>) =>
    onChange({ ...value, tabaquismo: { activo: false, ...value.tabaquismo, ...patch } });
  const patchAlcohol = (patch: Partial<NonNullable<Habits['alcohol']>>) =>
    onChange({ ...value, alcohol: { activo: false, ...value.alcohol, ...patch } });
  const patchHigiene = (patch: Partial<NonNullable<Habits['higieneOral']>>) =>
    onChange({ ...value, higieneOral: { ...value.higieneOral, ...patch } });

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="t-label text-ink">{copy.legend}</legend>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" aria-label={copy.smokes} checked={value.tabaquismo?.activo ?? false}
            onChange={(e) => patchTabaquismo({ activo: e.target.checked })} />
          {copy.smokes}
        </label>
        {value.tabaquismo?.activo && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField htmlFor="hb-tabaco-porDia" label={copy.perDay}>
              <Input id="hb-tabaco-porDia" type="number" value={value.tabaquismo?.porDia ?? ''}
                onChange={(e) => patchTabaquismo({ porDia: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </FormField>
            <FormField htmlFor="hb-tabaco-anios" label={copy.years}>
              <Input id="hb-tabaco-anios" type="number" value={value.tabaquismo?.anios ?? ''}
                onChange={(e) => patchTabaquismo({ anios: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </FormField>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" aria-label={copy.drinks} checked={value.alcohol?.activo ?? false}
            onChange={(e) => patchAlcohol({ activo: e.target.checked })} />
          {copy.drinks}
        </label>
        {value.alcohol?.activo && (
          <FormField htmlFor="hb-alcohol-frecuencia" label={copy.frequency}>
            <Input id="hb-alcohol-frecuencia" value={value.alcohol?.frecuencia ?? ''}
              onChange={(e) => patchAlcohol({ frecuencia: e.target.value })} />
          </FormField>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" aria-label={copy.substances} checked={value.sustancias ?? false}
          onChange={(e) => onChange({ ...value, sustancias: e.target.checked })} />
        {copy.substances}
      </label>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" aria-label={copy.bruxism} checked={value.bruxismo ?? false}
          onChange={(e) => onChange({ ...value, bruxismo: e.target.checked })} />
        {copy.bruxism}
      </label>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <legend className="t-label text-ink">{copy.hygieneLegend}</legend>
        <FormField htmlFor="hb-higiene-cepillados" label={copy.brushingsPerDay}>
          <Input id="hb-higiene-cepillados" type="number" value={value.higieneOral?.cepilladoPorDia ?? ''}
            onChange={(e) => patchHigiene({ cepilladoPorDia: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" aria-label={copy.floss} checked={value.higieneOral?.hilo ?? false}
            onChange={(e) => patchHigiene({ hilo: e.target.checked })} />
          {copy.floss}
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" aria-label={copy.mouthwash} checked={value.higieneOral?.enjuague ?? false}
            onChange={(e) => patchHigiene({ enjuague: e.target.checked })} />
          {copy.mouthwash}
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" aria-label={copy.fluorideToothpaste} checked={value.higieneOral?.cremaConFluor ?? false}
            onChange={(e) => patchHigiene({ cremaConFluor: e.target.checked })} />
          {copy.fluorideToothpaste}
        </label>
      </fieldset>
    </fieldset>
  );
}
