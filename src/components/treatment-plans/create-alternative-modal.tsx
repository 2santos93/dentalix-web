'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { createPlanAlternative } from '@/lib/treatment-plans/plan-options-api';
import type { TreatmentPlan } from '@/lib/treatment-plans/treatment-plans-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';

// Mismo tope que `CreatePlanAlternativeDto.optionLabel` en la API.
const LABEL_MAX = 60;

const copy = {
  title: 'Crear alternativa',
  description:
    'Crea otra opción para que el paciente compare (por ejemplo, implante o puente). Copia los procedimientos de este plan con sus precios y descuentos; después la ajustas.',
  labelField: 'Nombre de la opción',
  labelHint: 'Si lo dejas vacío, se llama con la letra siguiente.',
  submit: 'Crear alternativa',
  genericError: 'No pudimos crear la alternativa. Intenta de nuevo.',
};

interface CreateAlternativeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** El plan del que sale la alternativa. */
  planId: string;
  /** Lo que pondrá la API si no se escribe nada («Opción B»…). */
  suggestedLabel: string;
  onCreated: (plan: TreatmentPlan) => void;
}

/** Nueva opción del grupo del plan (DX-040). Se monta con `key` por plan. */
export function CreateAlternativeModal({
  open,
  onOpenChange,
  token,
  planId,
  suggestedLabel,
  onCreated,
}: CreateAlternativeModalProps) {
  const labelId = useId();
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const trimmed = label.trim();
    try {
      const created = await createPlanAlternative(
        token,
        planId,
        trimmed ? { optionLabel: trimmed } : {},
      );
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
    >
      <FormField htmlFor={labelId} label={copy.labelField} hint={copy.labelHint}>
        <Input
          id={labelId}
          value={label}
          maxLength={LABEL_MAX}
          placeholder={suggestedLabel}
          disabled={submitting}
          onChange={(e) => setLabel(e.target.value)}
        />
      </FormField>
    </FormModal>
  );
}
