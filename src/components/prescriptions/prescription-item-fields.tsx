'use client';
import * as React from 'react';
import { Trash2 } from 'lucide-react';
import type { ItemDraft } from '@/lib/prescriptions/prescription-draft';
import type { ClinicCountry } from '@/lib/prescriptions/prescriptions-api';
import type { AllergyMatch } from '@/lib/prescriptions/allergy-match';
import { FormField } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const copy = {
  legend: (n: number) => `Medicamento ${n}`,
  remove: (n: number) => `Quitar medicamento ${n}`,
  optional: (label: string) => `${label} (opcional)`,
  activeIngredient: 'Principio activo (DCI)',
  brandName: 'Marca comercial',
  concentration: 'Concentración',
  pharmaceuticalForm: 'Forma farmacéutica',
  route: 'Vía de administración',
  dose: 'Dosis',
  frequency: 'Frecuencia',
  durationDays: 'Duración (días)',
  totalQuantity: 'Cantidad total',
  quantityUnit: 'Unidad',
  packages: 'Nº de envases',
  instructions: 'Indicaciones',
  totalQuantityHint: 'Se imprime también en letras.',
  allergy: (allergens: string) => `Alergia registrada en la anamnesis: ${allergens}.`,
};

/**
 * `prescription`: reglas del país (en ES el nº de envases es obligatorio).
 * `template`: solo el principio activo es obligatorio; el resto se completa al
 * emitir.
 */
export type ItemFieldsMode = { kind: 'prescription'; country: ClinicCountry } | { kind: 'template' };

interface PrescriptionItemFieldsProps {
  index: number;
  item: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  /** Sin él no hay botón de quitar (p. ej. con un solo medicamento). */
  onRemove?: () => void;
  mode: ItemFieldsMode;
  idPrefix: string;
  allergyMatches?: AllergyMatch[];
}

/**
 * Los campos de UN medicamento de la receta (DX-013), agrupados en un
 * `fieldset` con su número. Sin `required` nativo a propósito: qué falta lo
 * dice la API en español, con todos los campos a la vez, según el país.
 */
export function PrescriptionItemFields({
  index,
  item,
  onChange,
  onRemove,
  mode,
  idPrefix,
  allergyMatches = [],
}: PrescriptionItemFieldsProps) {
  const n = index + 1;
  const id = (field: keyof ItemDraft | 'allergy') => `${idPrefix}-${index}-${field}`;
  const template = mode.kind === 'template';
  const label = (text: string, alwaysRequired = false) =>
    template && !alwaysRequired ? copy.optional(text) : text;
  const packagesRequired = mode.kind === 'prescription' && mode.country === 'ES';

  function text(field: keyof ItemDraft, text: string, placeholder?: string, required = true) {
    return (
      <FormField htmlFor={id(field)} label={required ? label(text) : copy.optional(text)}>
        <Input
          id={id(field)}
          value={item[field]}
          placeholder={placeholder}
          maxLength={200}
          onChange={(e) => onChange({ [field]: e.target.value })}
        />
      </FormField>
    );
  }

  function number(field: keyof ItemDraft, text: string, max: number, required = true, hint?: string) {
    return (
      <FormField
        htmlFor={id(field)}
        label={required ? label(text) : copy.optional(text)}
        hint={hint}
      >
        <Input
          id={id(field)}
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          step={1}
          value={item[field]}
          onChange={(e) => onChange({ [field]: e.target.value })}
          className="tabular-nums"
        />
      </FormField>
    );
  }

  const allergens = [...new Set(allergyMatches.map((m) => m.allergen))].join(', ');

  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-ink">{copy.legend(n)}</legend>
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mt-2 self-end"
          onClick={onRemove}
          aria-label={copy.remove(n)}
        >
          <Trash2 aria-hidden />
          <span className="hidden sm:inline">{copy.remove(n)}</span>
        </Button>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField htmlFor={id('activeIngredient')} label={copy.activeIngredient}>
          <Input
            id={id('activeIngredient')}
            value={item.activeIngredient}
            placeholder="Amoxicilina"
            maxLength={200}
            aria-invalid={allergyMatches.length > 0 || undefined}
            aria-describedby={allergyMatches.length > 0 ? id('allergy') : undefined}
            onChange={(e) => onChange({ activeIngredient: e.target.value })}
          />
          {allergyMatches.length > 0 ? (
            <InlineError id={id('allergy')} className="text-xs">
              {copy.allergy(allergens)}
            </InlineError>
          ) : null}
        </FormField>
        {text('brandName', copy.brandName, undefined, false)}
        {text('concentration', copy.concentration, '500 mg')}
        {text('pharmaceuticalForm', copy.pharmaceuticalForm, 'Cápsula')}
        {text('route', copy.route, 'Oral')}
        {text('dose', copy.dose, '1 cápsula')}
        {text('frequency', copy.frequency, 'Cada 8 horas')}
        {number('durationDays', copy.durationDays, 365)}
        {number('totalQuantity', copy.totalQuantity, 9999, true, copy.totalQuantityHint)}
        {text('quantityUnit', copy.quantityUnit, 'cápsulas')}
        {number('packages', copy.packages, 99, packagesRequired && !template)}
        {text('instructions', copy.instructions, 'Tomar después de las comidas', false)}
      </div>
    </fieldset>
  );
}
