'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiErrorMessage } from '@/lib/api/error-message';
import type { ExistingRecordRef } from '@/lib/api/api-error';
import {
  DEFAULT_LEAD_CHANNEL,
  LEAD_CHANNEL_LABELS,
  LEAD_CHANNEL_ORDER,
  LEAD_NAME_MAX,
  LEAD_PHONE_INPUT_MAX,
  createLead,
  existingRecordHref,
  phoneTakenOf,
  type Lead,
  type LeadChannel,
} from '@/lib/leads/leads-api';
import { FieldError } from '@/components/errors/field-error';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useLeadReasons } from './use-lead-catalogs';

export const leadCreateCopy = {
  title: 'Nuevo prospecto',
  description:
    'Solo datos comerciales: quién es, cómo contactarle y qué le interesa. Nunca síntomas, diagnósticos ni medicación.',
  name: 'Nombre',
  namePlaceholder: 'María Pérez',
  phone: 'Teléfono',
  phoneHint: 'Con o sin prefijo del país; sin él, se usa el de la sede.',
  channel: 'Canal',
  reason: 'Motivo de interés',
  noReason: 'Sin indicar',
  reasonsError: 'Motivos no disponibles',
  submit: 'Crear prospecto',
  nameRequired: 'Escribe el nombre.',
  phoneRequired: 'Escribe el teléfono.',
  saveError: 'No pudimos crear el prospecto. Intenta de nuevo.',
  takenByPatient: (name: string | null) =>
    name
      ? `Ese teléfono ya es de ${name}, que ya es paciente de la clínica.`
      : 'Ese teléfono ya es de un paciente de la clínica.',
  takenByLead: (name: string | null) =>
    name ? `Ese teléfono ya es del prospecto ${name}.` : 'Ese teléfono ya es de un prospecto de otra sede.',
  openPatient: 'Abrir paciente',
  openLead: 'Abrir prospecto',
};
const copy = leadCreateCopy;

/** El aviso del 409 `LEAD_PHONE_TAKEN`: quién tiene el número. */
export function phoneTakenMessage(existing: ExistingRecordRef): string {
  return existing.kind === 'PATIENT' ? copy.takenByPatient(existing.name) : copy.takenByLead(existing.name);
}

/**
 * Alta rápida de un prospecto (DX-556): cuatro campos que recepción completa
 * en segundos. El foco empieza en el nombre, Enter envía y el canal viene en
 * WhatsApp. Si el teléfono ya es de un paciente o de otro prospecto, el aviso
 * va arriba del formulario con el botón para abrirlo (sin `id`: otra sede,
 * solo el aviso).
 */
export function LeadCreateDialog({
  open,
  onOpenChange,
  token,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  onCreated: (lead: Lead) => void;
}) {
  const router = useRouter();
  const ids = { name: useId(), phone: useId(), channel: useId(), reason: useId() };
  const reasons = useLeadReasons(token, 'INTEREST', open);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [channel, setChannel] = useState<LeadChannel>(DEFAULT_LEAD_CHANNEL);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<ExistingRecordRef | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName('');
      setPhone('');
      setChannel(DEFAULT_LEAD_CHANNEL);
      setReason('');
      setErrors({});
      setError(null);
      setExisting(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = copy.nameRequired;
    if (!phone.trim()) next.phone = copy.phoneRequired;
    setErrors(next);
    if (next.name || next.phone) return;
    setSubmitting(true);
    setError(null);
    setExisting(null);
    try {
      const lead = await createLead(token, {
        fullName: name.trim(),
        phone: phone.trim(),
        channel,
        interestReason: reason || null,
      });
      onCreated(lead);
    } catch (err) {
      const taken = phoneTakenOf(err);
      if (taken) {
        setExisting(taken);
        setError(phoneTakenMessage(taken));
      } else {
        setError(apiErrorMessage(err, { fallback: copy.saveError }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const existingHref = existing ? existingRecordHref(existing) : null;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={(e) => void submit(e)}
      submitLabel={copy.submit}
      submitting={submitting}
      error={error}
      errorAction={
        existing && existingHref
          ? {
              label: existing.kind === 'PATIENT' ? copy.openPatient : copy.openLead,
              onAction: () => {
                onOpenChange(false);
                router.push(existingHref);
              },
            }
          : null
      }
      touchTargets
      ownValidation
    >
      <FormField htmlFor={ids.name} label={copy.name} error={errors.name}>
        <Input
          id={ids.name}
          name="lead-name"
          autoComplete="off"
          maxLength={LEAD_NAME_MAX}
          placeholder={copy.namePlaceholder}
          value={name}
          aria-invalid={errors.name ? true : undefined}
          onChange={(e) => {
            setName(e.target.value);
            if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
          }}
        />
      </FormField>
      <FormField htmlFor={ids.phone} label={copy.phone} error={errors.phone} hint={copy.phoneHint}>
        <Input
          id={ids.phone}
          name="lead-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          maxLength={LEAD_PHONE_INPUT_MAX}
          value={phone}
          aria-invalid={errors.phone ? true : undefined}
          onChange={(e) => {
            setPhone(e.target.value);
            if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
            if (existing) {
              setExisting(null);
              setError(null);
            }
          }}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor={ids.channel} label={copy.channel}>
          <NativeSelect id={ids.channel} value={channel} onChange={(e) => setChannel(e.target.value as LeadChannel)}>
            {LEAD_CHANNEL_ORDER.map((c) => (
              <option key={c} value={c}>
                {LEAD_CHANNEL_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor={ids.reason} label={copy.reason}>
          {reasons.failed ? (
            <FieldError label={copy.reasonsError} onRetry={reasons.reload} retryId={ids.reason} />
          ) : (
            <NativeSelect
              id={ids.reason}
              value={reason}
              disabled={reasons.items === null}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">{copy.noReason}</option>
              {(reasons.items ?? []).map((r) => (
                <option key={`${r.predefined ? 'p' : r.id}:${r.name}`} value={r.name}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>
    </FormModal>
  );
}
