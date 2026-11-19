'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { changeLeadStage, type Lead, type LeadStage } from '@/lib/leads/leads-api';
import { statusLabel } from '@/lib/status/tones';
import { FieldError } from '@/components/errors/field-error';
import { notifyError, notifySuccess } from '@/components/errors/notify';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { NativeSelect } from '@/components/ui/native-select';
import { useLeadReasons } from './use-lead-catalogs';

export const leadStageCopy = {
  /** Lo que dice cada movimiento manual en el «⋯» y en la ficha. */
  moveTo: (from: LeadStage, to: LeadStage): string => {
    if (to === 'LOST') return 'Marcar como perdido…';
    if (from === 'LOST') return to === 'NEW' ? 'Reabrir como nuevo' : 'Reabrir como contactado';
    if (from === 'SCHEDULED' && to === 'CONTACTED') return 'La cita se cayó: volver a contactado';
    return to === 'CONTACTED' ? 'Marcar como contactado' : 'Volver a nuevo';
  },
  moved: (name: string, label: string) => `${name}: ${label}.`,
  moveError: 'No pudimos cambiar la etapa.',
  lostTitle: 'Marcar como perdido',
  lostDescription: (name: string) =>
    `${name} sale del seguimiento. El motivo sirve para el informe; se puede reabrir más adelante.`,
  lostReason: 'Motivo de pérdida',
  chooseReason: 'Elige un motivo',
  reasonRequired: 'Elige el motivo de la pérdida.',
  reasonsError: 'Motivos no disponibles',
  lostSubmit: 'Marcar como perdido',
  lostError: 'No pudimos marcarlo como perdido. Intenta de nuevo.',
};

/**
 * Un movimiento manual que no pide motivo (todos menos «Perdido»): aviso al
 * terminar y, si falla, toast con reintento (escalón 3: la fila sigue en
 * pantalla y correcta). El reintento repite el mismo movimiento.
 */
export function moveLeadStage(
  token: string,
  lead: Pick<Lead, 'id' | 'fullName'>,
  to: Exclude<LeadStage, 'LOST'>,
  onDone: () => void,
): Promise<void> {
  return changeLeadStage(token, lead.id, to).then(
    () => {
      notifySuccess(leadStageCopy.moved(lead.fullName, statusLabel('lead', to)));
      onDone();
    },
    (err: unknown) => {
      notifyError(apiErrorMessage(err, { fallback: leadStageCopy.moveError }), {
        onRetry: () => void moveLeadStage(token, lead, to, onDone),
      });
    },
  );
}

/**
 * «Perdido» pide un motivo del catálogo de pérdida (predefinidos y propios):
 * sin él la API responde 400. El diálogo no se cierra hasta que se guarda.
 */
export function LeadLostDialog({
  open,
  onOpenChange,
  token,
  lead,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  lead: Pick<Lead, 'id' | 'fullName'>;
  onSaved: (lead: Lead) => void;
}) {
  const fieldId = useId();
  const reasons = useLeadReasons(token, 'LOSS', open);
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setReason('');
      setFieldError(null);
      setError(null);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason) {
      setFieldError(leadStageCopy.reasonRequired);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await changeLeadStage(token, lead.id, 'LOST', reason));
    } catch (err) {
      setError(apiErrorMessage(err, { fallback: leadStageCopy.lostError }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={leadStageCopy.lostTitle}
      description={leadStageCopy.lostDescription(lead.fullName)}
      onSubmit={(e) => void submit(e)}
      submitLabel={leadStageCopy.lostSubmit}
      submitting={saving}
      error={error}
      fullScreenOnMobile={false}
      touchTargets
      ownValidation
    >
      <FormField htmlFor={fieldId} label={leadStageCopy.lostReason} error={fieldError ?? undefined}>
        {reasons.failed ? (
          <FieldError label={leadStageCopy.reasonsError} onRetry={reasons.reload} retryId={fieldId} />
        ) : (
          <NativeSelect
            id={fieldId}
            value={reason}
            disabled={reasons.items === null}
            aria-invalid={fieldError ? true : undefined}
            onChange={(e) => {
              setReason(e.target.value);
              if (fieldError) setFieldError(null);
            }}
          >
            <option value="">{leadStageCopy.chooseReason}</option>
            {(reasons.items ?? []).map((r) => (
              <option key={`${r.predefined ? 'p' : r.id}:${r.name}`} value={r.name}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
    </FormModal>
  );
}
