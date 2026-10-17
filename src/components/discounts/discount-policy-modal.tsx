'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ClinicRole } from '@/lib/me/me-api';
import { updateDiscountPolicy, type DiscountPolicy } from '@/lib/discounts/discounts-api';
import { ROLE_LABELS } from '@/lib/discounts/discount-rules';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Input } from '@/components/ui/input';

export const policyModalCopy = {
  title: 'Topes de descuento',
  description:
    'El máximo que cada rol puede descontar en un ítem del plan, y a partir de qué % hay que decir el motivo. Aplica a los descuentos que se den desde ahora.',
  roleLabel: (role: string) => `Tope de ${role.toLowerCase()} (%)`,
  threshold: 'Motivo obligatorio por encima del (%)',
  thresholdHint: 'Por encima de este porcentaje el motivo es obligatorio para todos los roles.',
  invalid: 'Escribe un número entero entre 0 y 100.',
  save: 'Guardar',
  saveError: 'No pudimos guardar la política. Intenta de nuevo.',
};

export const POLICY_ROLES: ClinicRole[] = ['ADMIN', 'DENTIST', 'ASSISTANT', 'RECEPTION'];

type Draft = Record<ClinicRole | 'threshold', string>;

function parsePercent(text: string): number | null {
  const value = Number(text);
  return text.trim() !== '' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

interface DiscountPolicyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  policy: DiscountPolicy;
  onSaved: (policy: DiscountPolicy) => void;
}

/** Editar la política de descuentos (DX-204, solo ADMIN). El padre lo monta con una `key` por apertura. */
export function DiscountPolicyModal({ open, onOpenChange, token, policy, onSaved }: DiscountPolicyModalProps) {
  const [draft, setDraft] = useState<Draft>({
    ADMIN: String(policy.maxPercentByRole.ADMIN),
    DENTIST: String(policy.maxPercentByRole.DENTIST),
    ASSISTANT: String(policy.maxPercentByRole.ASSISTANT),
    RECEPTION: String(policy.maxPercentByRole.RECEPTION),
    threshold: String(policy.reasonRequiredAbovePercent),
  });
  const [invalid, setInvalid] = useState<ReadonlySet<keyof Draft>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const keys = [...POLICY_ROLES, 'threshold'] as (keyof Draft)[];
    const parsed = Object.fromEntries(keys.map((k) => [k, parsePercent(draft[k])])) as Record<
      keyof Draft,
      number | null
    >;
    const bad = new Set(keys.filter((k) => parsed[k] === null));
    setInvalid(bad);
    if (bad.size > 0) return;
    setSubmitting(true);
    try {
      const saved = await updateDiscountPolicy(token, {
        maxPercentByRole: {
          ADMIN: parsed.ADMIN!,
          DENTIST: parsed.DENTIST!,
          ASSISTANT: parsed.ASSISTANT!,
          RECEPTION: parsed.RECEPTION!,
        },
        reasonRequiredAbovePercent: parsed.threshold!,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, policyModalCopy.saveError));
    } finally {
      setSubmitting(false);
    }
  }

  function field(key: keyof Draft, label: string, hint?: string) {
    const id = `discount-policy-${key}`;
    const isInvalid = invalid.has(key);
    return (
      <FormField key={key} htmlFor={id} label={label} hint={hint} error={isInvalid ? policyModalCopy.invalid : null}>
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          value={draft[key]}
          onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
          aria-invalid={isInvalid ? true : undefined}
          aria-describedby={isInvalid ? fieldErrorId(id) : undefined}
          className="w-28 tabular-nums"
        />
      </FormField>
    );
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={policyModalCopy.title}
      description={policyModalCopy.description}
      onSubmit={handleSubmit}
      submitLabel={policyModalCopy.save}
      submitting={submitting}
      error={error}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {POLICY_ROLES.map((role) => field(role, policyModalCopy.roleLabel(ROLE_LABELS[role])))}
      </div>
      {field('threshold', policyModalCopy.threshold, policyModalCopy.thresholdHint)}
    </FormModal>
  );
}
