'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { RECALL_INTERVALS, RECALL_REASON_MAX, intervalLabel } from '@/lib/recall/presentation';
import { setPatientRecall, type PatientRecall, type PatientRecalls } from '@/lib/recall/recall-api';
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
  // DX-015-bis: el campo es lo fijado a mano; el plazo cuenta desde lo más
  // reciente entre esto y el último procedimiento que reinicia el recall.
  lastDone: 'Fecha fijada a mano',
  lastDoneHint: 'Cuenta la más reciente entre esta fecha y el último procedimiento que reinicia el recall. Vacío: hoy.',
  // Al editar, sin tocarla no se manda: la API conserva lo fijado (y la base que da un procedimiento).
  lastDoneEditHint:
    'Cuenta la más reciente entre esta fecha y el último procedimiento que reinicia el recall. Si no la cambias, se conserva.',
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
  typeRef,
  typeName,
  defaultIntervalMonths = null,
  recall,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  /** Id del tipo (DX-015-bis) o, en el respaldo sin tipos, su clave. */
  typeRef: string;
  typeName: string;
  /** Intervalo con que nace un recall nuevo de este tipo (el del tipo; sin él, 6 meses). */
  defaultIntervalMonths?: number | null;
  recall: PatientRecall | null;
  onSaved: (recalls: PatientRecalls) => void;
}) {
  const [months, setMonths] = useState(recall?.intervalMonths ?? defaultIntervalMonths ?? 6);
  // DX-015-bis: el campo es lo fijado a mano (vacío si el recall nació de un
  // procedimiento). Al editar, `lastDoneAt` solo viaja si se cambió: sin él la
  // API conserva lo fijado, el procedimiento que da la base y la marca del
  // relleno, así que cambiar solo el intervalo no convierte el día de un
  // procedimiento en «fijado a mano». Un recall nuevo sin fecha nace con hoy.
  const isNew = recall === null;
  const initialLastDone = recall?.manualDoneAt ?? null;
  const [lastDone, setLastDone] = useState<string | null>(initialLastDone);
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
      const saved = await setPatientRecall(token, patientId, typeRef, {
        intervalMonths: months,
        ...(lastDone && (isNew || lastDone !== initialLastDone) ? { lastDoneAt: lastDone } : {}),
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
      title={copy.title(typeName)}
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
        <FormField
          htmlFor="ri-last-done"
          label={copy.lastDone}
          hint={isNew ? copy.lastDoneHint : copy.lastDoneEditHint}
        >
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
