'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createAnesthetic,
  updateAnesthetic,
  type AnestheticProduct,
} from '@/lib/anesthesia/anesthesia-api';
import {
  ANESTHETIC_LIMITS,
  draftFrom,
  emptyDraft,
  toCreateInput,
  toUpdatePatch,
  validateDraft,
  type AnestheticDraft,
  type AnestheticErrors,
  type FormField as DraftField,
} from '@/lib/anesthesia/anesthetic-form';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { Callout } from '@/components/ui/callout';

const copy = {
  createTitle: 'Nuevo anestésico',
  editTitle: 'Editar anestésico',
  description:
    'Los valores de ayuda que usa el cálculo de la dosis máxima al registrar una anestesia. Consulta la ficha técnica del fabricante.',
  recordsNotice:
    'Guardar no cambia las anestesias ya registradas: cada una conserva los valores con que se anotó. Lo nuevo vale para las que se registren desde ahora.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Lidocaína 2 % con epinefrina 1:100.000',
  activeIngredient: 'Principio activo',
  activeIngredientPlaceholder: 'Por ejemplo, Lidocaína',
  concentration: 'Concentración (%)',
  vasoconstrictor: 'Vasoconstrictor (opcional)',
  vasoconstrictorPlaceholder: 'Por ejemplo, Epinefrina 1:100.000',
  vasoconstrictorHint: 'Vacío si no lleva. Con la dilución (1:100.000) se calcula la epinefrina.',
  mlPerCarpule: 'Volumen del carpule (ml)',
  maxMgPerKg: 'Dosis máxima (mg/kg)',
  maxAbsoluteMg: 'Tope absoluto (mg)',
  maxAbsoluteHint: 'Máximo por paciente aunque el peso dé más.',
  pediatricTitle: 'Niños y epinefrina (opcional)',
  pediatricMaxMgPerKg: 'Dosis máxima en menores de 12 años (mg/kg)',
  pediatricHint: 'Vacío: se usa la de adulto.',
  minAgeYears: 'Edad mínima (años)',
  minAgeHint: 'Vacío: sin edad mínima.',
  epinephrine: 'Epinefrina por carpule (mg)',
  epinephrineHint: 'Vacío: se calcula del vasoconstrictor y del volumen.',
  create: 'Añadir anestésico',
  save: 'Guardar cambios',
  genericError: 'No pudimos guardar el anestésico. Intenta de nuevo.',
};

interface AnestheticFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin anestésico: alta. Con anestésico: edición. */
  product: AnestheticProduct | null;
  onSaved: (product: AnestheticProduct) => void;
}

/**
 * Alta y edición de un anestésico del catálogo (DX-408, solo ADMIN). Valida
 * en español con los límites de la API (que los repite) y, al editar, envía
 * solo lo que cambió. El padre lo monta con una `key` por apertura.
 */
export function AnestheticFormModal({ open, onOpenChange, token, product, onSaved }: AnestheticFormModalProps) {
  const editing = product !== null;
  const [draft, setDraft] = useState<AnestheticDraft>(() => (product ? draftFrom(product) : emptyDraft()));
  const [errors, setErrors] = useState<AnestheticErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(field: DraftField, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const result = validateDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      if (editing) {
        const patch = toUpdatePatch(product, result.value);
        onSaved(Object.keys(patch).length === 0 ? product : await updateAnesthetic(token, product.id, patch));
      } else {
        onSaved(await createAnesthetic(token, toCreateInput(result.value)));
      }
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  function field(
    id: DraftField,
    label: string,
    options: { hint?: string; placeholder?: string; numeric?: boolean; maxLength?: number; integer?: boolean } = {},
  ) {
    const htmlId = `anesthetic-${id}`;
    return (
      <FormField htmlFor={htmlId} label={label} error={errors[id] ?? null} hint={options.hint}>
        <Input
          id={htmlId}
          name={id}
          value={draft[id]}
          placeholder={options.placeholder}
          maxLength={options.maxLength}
          inputMode={options.numeric ? (options.integer ? 'numeric' : 'decimal') : undefined}
          autoComplete="off"
          className={options.numeric ? 'tabular-nums' : undefined}
          aria-invalid={errors[id] ? true : undefined}
          onChange={(e) => set(id, e.target.value)}
        />
      </FormField>
    );
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      error={error}
      size="lg"
      touchTargets
      ownValidation
    >
      {editing ? (
        <Callout tone="info" data-testid="anesthetic-records-notice">
          {copy.recordsNotice}
        </Callout>
      ) : null}
      {field('name', copy.name, { placeholder: copy.namePlaceholder, maxLength: ANESTHETIC_LIMITS.nameMax })}
      <div className="grid gap-4 sm:grid-cols-2">
        {field('activeIngredient', copy.activeIngredient, {
          placeholder: copy.activeIngredientPlaceholder,
          maxLength: ANESTHETIC_LIMITS.activeIngredientMax,
        })}
        {field('concentrationPct', copy.concentration, { numeric: true, placeholder: '2' })}
      </div>
      {field('vasoconstrictor', copy.vasoconstrictor, {
        hint: copy.vasoconstrictorHint,
        placeholder: copy.vasoconstrictorPlaceholder,
        maxLength: ANESTHETIC_LIMITS.vasoconstrictorMax,
      })}
      <div className="grid gap-4 sm:grid-cols-3">
        {field('mlPerCarpule', copy.mlPerCarpule, { numeric: true, placeholder: '1,8' })}
        {field('maxMgPerKg', copy.maxMgPerKg, { numeric: true, placeholder: '7' })}
        {field('maxAbsoluteMg', copy.maxAbsoluteMg, { numeric: true, placeholder: '500', hint: copy.maxAbsoluteHint })}
      </div>
      <fieldset className="flex flex-col gap-4 border-t border-border-subtle pt-4">
        <legend className="float-left mb-1 text-sm font-semibold text-ink">{copy.pediatricTitle}</legend>
        <div className="grid clear-both gap-4 sm:grid-cols-3">
          {field('pediatricMaxMgPerKg', copy.pediatricMaxMgPerKg, { numeric: true, hint: copy.pediatricHint })}
          {field('minAgeYears', copy.minAgeYears, { numeric: true, integer: true, hint: copy.minAgeHint })}
          {field('epinephrineMgPerCarpule', copy.epinephrine, { numeric: true, hint: copy.epinephrineHint })}
        </div>
      </fieldset>
    </FormModal>
  );
}
