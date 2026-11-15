'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { updateReminderPolicy, type BalanceReminderPolicy } from '@/lib/receivables/reminders-api';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Input } from '@/components/ui/input';

export const policyDialogCopy = {
  title: 'Tramos de los avisos de saldo',
  description:
    'Cuándo aparece un paciente en «Por avisar hoy»: al llegar su deuda vencida más antigua a cada tramo. Aplica a toda la clínica y queda en la auditoría.',
  stage: (n: number) => `Tramo ${n} (días)`,
  stageHint: 'Déjalo vacío para no usarlo.',
  maxNotices: 'Máximo de avisos por deuda',
  minGapDays: 'Días mínimos entre avisos',
  submit: 'Guardar tramos',
  firstRequired: 'El primer tramo es obligatorio.',
  wholeDays: 'Escribe un número entero de días entre 1 y 365.',
  increasing: 'Cada tramo tiene que ser mayor que el anterior.',
  maxRange: 'Escribe un número entero entre 1 y 10.',
  gapRange: 'Escribe un número entero entre 1 y 90.',
  saveError: 'No pudimos guardar los tramos. Intenta de nuevo.',
};

type Field = 'stage0' | 'stage1' | 'stage2' | 'maxNotices' | 'minGapDays';

function wholeIn(text: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= min && n <= max ? n : null;
}

/** Valida el borrador con los mismos topes que la API; devuelve la política o los errores por campo. */
export function parsePolicyDraft(draft: Record<Field, string>): {
  policy: BalanceReminderPolicy | null;
  errors: Partial<Record<Field, string>>;
} {
  const errors: Partial<Record<Field, string>> = {};
  const days: number[] = [];
  (['stage0', 'stage1', 'stage2'] as const).forEach((key, i) => {
    const text = draft[key].trim();
    if (!text) {
      if (i === 0) errors[key] = policyDialogCopy.firstRequired;
      return;
    }
    const n = wholeIn(text, 1, 365);
    if (n === null) {
      errors[key] = policyDialogCopy.wholeDays;
      return;
    }
    if (days.length > 0 && n <= days[days.length - 1]) {
      errors[key] = policyDialogCopy.increasing;
      return;
    }
    days.push(n);
  });
  const maxNotices = wholeIn(draft.maxNotices, 1, 10);
  if (maxNotices === null) errors.maxNotices = policyDialogCopy.maxRange;
  const minGapDays = wholeIn(draft.minGapDays, 1, 90);
  if (minGapDays === null) errors.minGapDays = policyDialogCopy.gapRange;
  if (Object.keys(errors).length > 0 || maxNotices === null || minGapDays === null) return { policy: null, errors };
  return { policy: { days, maxNotices, minGapDays }, errors };
}

function draftOf(policy: BalanceReminderPolicy): Record<Field, string> {
  return {
    stage0: policy.days[0] !== undefined ? String(policy.days[0]) : '',
    stage1: policy.days[1] !== undefined ? String(policy.days[1]) : '',
    stage2: policy.days[2] !== undefined ? String(policy.days[2]) : '',
    maxNotices: String(policy.maxNotices),
    minGapDays: String(policy.minGapDays),
  };
}

interface ReminderPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  policy: BalanceReminderPolicy;
  onSaved: (policy: BalanceReminderPolicy) => void;
}

/** «Cambiar tramos» de «Por avisar hoy» (DX-146): solo ADMIN (la API responde 403 al resto). */
export function ReminderPolicyDialog({ open, onOpenChange, token, policy, onSaved }: ReminderPolicyDialogProps) {
  const [draft, setDraft] = useState<Record<Field, string>>(() => draftOf(policy));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Cada apertura parte de la política vigente.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraft(draftOf(policy));
      setErrors({});
      setSubmitError(null);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = parsePolicyDraft(draft);
    setErrors(parsed.errors);
    if (!parsed.policy) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const saved = await updateReminderPolicy(token, parsed.policy);
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(apiErrorMessage(err, { fallback: policyDialogCopy.saveError }));
    } finally {
      setSubmitting(false);
    }
  }

  const field = (key: Field, label: string, min: number, max: number, hint?: string) => {
    const id = `reminder-policy-${key}`;
    return (
      <FormField htmlFor={id} label={label} error={errors[key]} hint={hint}>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={errors[key] ? fieldErrorId(id) : undefined}
        />
      </FormField>
    );
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={policyDialogCopy.title}
      description={policyDialogCopy.description}
      onSubmit={(e) => void submit(e)}
      submitLabel={policyDialogCopy.submit}
      submitting={submitting}
      error={submitError}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {field('stage0', policyDialogCopy.stage(1), 1, 365)}
        {field('stage1', policyDialogCopy.stage(2), 1, 365, policyDialogCopy.stageHint)}
        {field('stage2', policyDialogCopy.stage(3), 1, 365, policyDialogCopy.stageHint)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field('maxNotices', policyDialogCopy.maxNotices, 1, 10)}
        {field('minGapDays', policyDialogCopy.minGapDays, 1, 90)}
      </div>
    </FormModal>
  );
}
