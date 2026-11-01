'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { KIND_LABELS, RECALL_INTERVALS, RECALL_REASON_MAX, intervalLabel } from '@/lib/recall/presentation';
import {
  setPatientRecall,
  type PatientRecall,
  type PatientRecalls,
  type RecallKind,
} from '@/lib/recall/recall-api';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Checkbox } from '@/components/ui/checkbox';
import { DateField } from '@/components/ui/date-field';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

export const intervalDialogCopy = {
  title: (kind: string) => `Recall de ${kind.toLowerCase()}`,
  description: 'Cada cuánto debe volver el paciente. Cuando venza y no tenga cita, recepción lo verá en la lista.',
  interval: 'Intervalo',
  lastDone: 'Último control',
  lastDoneHint: 'Vacío: hoy.',
  pauseUntil: 'Pausar hasta (opcional)',
  pauseReason: 'Motivo de la pausa (opcional)',
  active: 'Recall activo',
  activeHint: 'Desmárcalo para retirarlo: no volverá a salir en la lista.',
  submit: 'Guardar recall',
  reasonTooLong: `El motivo admite hasta ${RECALL_REASON_MAX} caracteres.`,
  saveError: 'No pudimos guardar el recall. Intenta de nuevo.',
};
const copy = intervalDialogCopy;

/** Fijar, cambiar, pausar o retirar el recall de un tipo (DX-015): lo hace el clínico. */
export function RecallIntervalDialog({
  open,
  onOpenChange,
  token,
  patientId,
  kind,
  recall,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  kind: RecallKind;
  recall: PatientRecall | null;
  onSaved: (recalls: PatientRecalls) => void;
}) {
  const [months, setMonths] = useState(recall?.intervalMonths ?? 6);
  const [lastDone, setLastDone] = useState<string | null>(recall?.lastDoneAt ?? null);
  const [pauseUntil, setPauseUntil] = useState<string | null>(recall?.disabledUntil ?? null);
  const [reason, setReason] = useState(recall?.disabledReason ?? '');
  const [active, setActive] = useState(recall?.active ?? true);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const tooLong = reason.trim().length > RECALL_REASON_MAX;
    setReasonError(tooLong ? copy.reasonTooLong : null);
    if (tooLong) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const saved = await setPatientRecall(token, patientId, kind, {
        intervalMonths: months,
        // Sin fecha manda hoy la API: al editar se conserva la que había.
        ...(lastDone ? { lastDoneAt: lastDone } : {}),
        active,
        disabledUntil: pauseUntil,
        disabledReason: pauseUntil && reason.trim() ? reason.trim() : null,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(apiErrorMessage(err, { fallback: copy.saveError }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title(KIND_LABELS[kind])}
      description={copy.description}
      onSubmit={(e) => void submit(e)}
      submitLabel={copy.submit}
      submitting={submitting}
      error={submitError}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="ri-months" label={copy.interval}>
          <NativeSelect id="ri-months" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {[...new Set([...RECALL_INTERVALS, months])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {intervalLabel(m)}
                </option>
              ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor="ri-last-done" label={copy.lastDone} hint={copy.lastDoneHint}>
          <DateField id="ri-last-done" value={lastDone} onChange={setLastDone} />
        </FormField>
        <FormField htmlFor="ri-pause" label={copy.pauseUntil}>
          <DatePicker id="ri-pause" value={pauseUntil} onChange={setPauseUntil} />
        </FormField>
        <FormField htmlFor="ri-reason" label={copy.pauseReason} error={reasonError}>
          <Input
            id="ri-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={!pauseUntil}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? fieldErrorId('ri-reason') : undefined}
          />
        </FormField>
      </div>
      <Checkbox label={copy.active} description={copy.activeHint} checked={active} onChange={(e) => setActive(e.target.checked)} />
    </FormModal>
  );
}
