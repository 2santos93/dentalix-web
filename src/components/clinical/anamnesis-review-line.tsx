'use client';
import { useState } from 'react';
import { ClipboardCheck, ClipboardClock, ClipboardX } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  ANAMNESIS_EXPIRED_LABEL,
  confirmAnamnesisNoChanges,
  confirmedToday,
  reviewedToday,
  sedeDateLabel,
  sedeTimeLabel,
  type PatientMedicalAlerts,
} from '@/lib/clinical/medical-alerts';
import { formatCivilDate } from '@/lib/format/date';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FieldError } from '@/components/errors/field-error';
import { cn } from '@/lib/utils';

const copy = {
  current: 'Anamnesis al día',
  missing: 'Sin anamnesis: regístrala en «Historia clínica» antes de tratar.',
  reviewed: (date: string, by: string | null) => `revisada el ${date}${by ? ` por ${by}` : ''}`,
  noChangesToday: (time: string, by: string | null) =>
    `Sin cambios hoy · confirmado a las ${time}${by ? ` por ${by}` : ''}`,
  validity: (months: number) => `Vigencia de la clínica: ${months} ${months === 1 ? 'mes' : 'meses'}.`,
  expiresOn: (date: string) => `Caduca el ${date}.`,
  confirm: 'Sin cambios hoy',
  dialogTitle: '¿Sin cambios en la salud del paciente?',
  dialogDescription:
    'Confirma que le preguntaste hoy y que su salud, sus alergias y su medicación no han cambiado. Quedará registrado con tu nombre y la hora, y la anamnesis volverá a estar al día.',
  dialogConfirm: 'Confirmar sin cambios',
  confirmError: 'No pudimos guardar la confirmación. Intenta de nuevo.',
  loadError: 'Revisión sin comprobar',
};

interface AnamnesisReviewLineProps {
  token: string;
  patientId: string;
  alerts: PatientMedicalAlerts | null;
  failed: boolean;
  onReload: () => void;
  /** Rol clínico: puede confirmar «Sin cambios hoy» (la API da 403 a recepción). */
  canConfirm: boolean;
}

/**
 * Estado de la anamnesis bajo el banner de alertas de la ficha (DX-247): al
 * día, caducada o ausente, con la última revisión (fecha y quién) y la
 * confirmación «Sin cambios hoy» en un modal. La confirmación queda en la
 * auditoría con autor y hora del servidor.
 */
export function AnamnesisReviewLine({
  token,
  patientId,
  alerts,
  failed,
  onReload,
  canConfirm,
}: AnamnesisReviewLineProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (failed) return <FieldError label={copy.loadError} onRetry={onReload} className="self-start" />;
  if (!alerts) return null;

  const status = alerts.anamnesisStatus;
  const review = alerts.lastReview;
  const today = confirmedToday(review, alerts);
  const Icon = status === 'MISSING' ? ClipboardX : status === 'EXPIRED' ? ClipboardClock : ClipboardCheck;

  let text: string;
  if (status === 'MISSING') {
    text = copy.missing;
  } else if (today && review) {
    text = copy.noChangesToday(sedeTimeLabel(review.at, alerts.timeZone), review.byName);
  } else {
    const head = status === 'EXPIRED' ? ANAMNESIS_EXPIRED_LABEL : copy.current;
    text = review
      ? `${head} · ${copy.reviewed(sedeDateLabel(review.at, alerts.timeZone), review.byName)}`
      : head;
  }

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await confirmAnamnesisNoChanges(token, patientId);
      setOpen(false);
      onReload();
    } catch (err) {
      setError(apiErrorMessage(err, copy.confirmError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-testid="anamnesis-review"
      data-status={status}
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2 text-sm">
        <Icon
          aria-hidden
          className={cn(
            'mt-0.5 size-4 shrink-0',
            status === 'CURRENT' ? 'text-success' : 'text-warning',
          )}
        />
        <p className={status === 'CURRENT' ? 'text-muted' : 'text-warning'}>
          <span className="font-medium">{text}</span>
          {status !== 'MISSING' ? (
            <span className="text-muted">
              {' '}
              {copy.validity(alerts.validityMonths)}
              {status === 'CURRENT' && alerts.anamnesisExpiresOn
                ? ` ${copy.expiresOn(formatCivilDate(alerts.anamnesisExpiresOn))}`
                : ''}
            </span>
          ) : null}
        </p>
      </div>
      {/* Revisada hoy (versión nueva o «Sin cambios hoy»): no hay nada que confirmar. */}
      {canConfirm && status !== 'MISSING' && !reviewedToday(review, alerts) ? (
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 max-sm:min-h-11 max-sm:w-full"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          <ClipboardCheck aria-hidden className="size-4" />
          {copy.confirm}
        </Button>
      ) : null}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.dialogTitle}
        description={copy.dialogDescription}
        confirmLabel={copy.dialogConfirm}
        destructive={false}
        confirming={saving}
        error={error}
        onConfirm={() => void handleConfirm()}
      />
    </div>
  );
}
