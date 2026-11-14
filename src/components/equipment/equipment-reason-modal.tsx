'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';

const copy = {
  reason: 'Motivo',
  reasonInvalid: 'Escribe el motivo (de 3 a 500 caracteres).',
  date: 'Fecha de la baja',
  dateRequired: 'Elige la fecha de la baja.',
  dateFuture: 'La fecha de la baja no puede ser futura.',
};

interface EquipmentReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  fallbackError: string;
  /**
   * Con fecha (la baja): hoy en la sede por defecto, sin futuras. Sin ella
   * (anular un mantenimiento), solo el motivo.
   */
  withDate?: { today: string; min?: string | null };
  onConfirm: (input: { reason: string; date: string | null }) => Promise<void>;
}

/**
 * Lo que no se deshace en un equipo (DX-542): darlo de baja o anular un
 * mantenimiento. Siempre con motivo (3–500); la API repite la regla y su
 * mensaje sale aquí si lo rechaza.
 */
export function EquipmentReasonModal({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  fallbackError,
  withDate,
  onConfirm,
}: EquipmentReasonModalProps) {
  const [reason, setReason] = useState('');
  const [date, setDate] = useState<string | null>(withDate?.today ?? null);
  const [errors, setErrors] = useState<{ reason?: string; date?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const text = reason.trim();
    const next: { reason?: string; date?: string } = {};
    if (text.length < 3 || text.length > 500) next.reason = copy.reasonInvalid;
    if (withDate) {
      if (!date) next.date = copy.dateRequired;
      else if (date > withDate.today) next.date = copy.dateFuture;
    }
    setErrors(next);
    if (next.reason || next.date) return;
    setSubmitting(true);
    try {
      await onConfirm({ reason: text, date: withDate ? date : null });
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, fallbackError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={submitLabel}
      submitting={submitting}
      error={error}
      destructive
      fullScreenOnMobile={false}
      touchTargets
      ownValidation
    >
      {withDate ? (
        <FormField htmlFor="equipment-reason-date" label={copy.date} error={errors.date}>
          <DatePicker
            id="equipment-reason-date"
            name="date"
            max={withDate.today}
            min={withDate.min ?? undefined}
            value={date}
            disabled={submitting}
            onChange={setDate}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? fieldErrorId('equipment-reason-date') : undefined}
          />
        </FormField>
      ) : null}
      <FormField htmlFor="equipment-reason" label={copy.reason} error={errors.reason}>
        <Textarea
          id="equipment-reason"
          value={reason}
          maxLength={500}
          autoGrow
          className="max-h-48"
          disabled={submitting}
          onChange={(e) => {
            setReason(e.target.value);
            if (errors.reason) setErrors((prev) => ({ ...prev, reason: undefined }));
          }}
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? fieldErrorId('equipment-reason') : undefined}
        />
      </FormField>
    </FormModal>
  );
}
