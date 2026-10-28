'use client';
import * as React from 'react';
import { Trash2 } from 'lucide-react';
import type { ItemDraft, ItemDraftErrors } from '@/lib/prescriptions/prescription-draft';
// TODO(T8): el modo de la receta deja de llevar país.
import type { ClinicCountry } from '@/lib/locations/location-country';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
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
  /** Validación en el cliente: el mensaje va junto a cada campo. */
  errors?: ItemDraftErrors;
}

/**
 * Los campos de UN medicamento de la receta (DX-013), agrupados en un
 * `fieldset` con su número. Sin `required` nativo a propósito: el modal valida
 * según el país y pasa `errors`, que se pintan junto a cada campo
 * (`aria-invalid` + `aria-describedby`).
 */
export function PrescriptionItemFields({
  index,
  item,
  onChange,
  onRemove,
  mode,
  idPrefix,
  errors = {},
}: PrescriptionItemFieldsProps) {
  const n = index + 1;
  const id = (field: keyof ItemDraft) => `${idPrefix}-${index}-${field}`;
  const template = mode.kind === 'template';
  const label = (text: string, alwaysRequired = false) =>
    template && !alwaysRequired ? copy.optional(text) : text;
  const packagesRequired = mode.kind === 'prescription' && mode.country === 'ES';
  const invalid = (field: keyof ItemDraft) =>
    errors[field]
      ? { 'aria-invalid': true as const, 'aria-describedby': fieldErrorId(id(field)) }
      : {};

  function text(field: keyof ItemDraft, text: string, placeholder?: string, required = true) {
    return (
      <FormField
        htmlFor={id(field)}
        label={required ? label(text) : copy.optional(text)}
        error={errors[field]}
      >
        <Input
          id={id(field)}
          value={item[field]}
          placeholder={placeholder}
          maxLength={200}
          {...invalid(field)}
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
        error={errors[field]}
      >
        <Input
          id={id(field)}
          {...invalid(field)}
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
        <FormField
          htmlFor={id('activeIngredient')}
          label={copy.activeIngredient}
          error={errors.activeIngredient}
        >
          <Input
            id={id('activeIngredient')}
            value={item.activeIngredient}
            placeholder="Amoxicilina"
            maxLength={200}
            aria-invalid={errors.activeIngredient ? true : undefined}
            aria-describedby={
              errors.activeIngredient ? fieldErrorId(id('activeIngredient')) : undefined
            }
            onChange={(e) => onChange({ activeIngredient: e.target.value })}
          />
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
